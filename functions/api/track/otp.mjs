/**
 * Track-order OTP — a SECOND, isolated OTP channel.
 *
 * It deliberately does NOT share keys with the login OTP (functions/api/otp/*):
 * a code issued to verify "order X for email Y" can never be redeemed to log in,
 * and vice versa. Storage follows the same contract — KV (OTP_KV) preferred,
 * D1 (DB) fallback — so it works on the current deployment (D1) and future-proofs
 * for a KV binding without a code change.
 *
 * Delivery is Resend REST (RESEND_API_KEY), same as every other mailer here.
 */

const OTP_TTL_SECONDS = 300; // 5 minutes — what the email promises
const RESEND_COOLDOWN_SECONDS = 30;
const MAX_SENDS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

function storeKind(env) {
  if (env.OTP_KV && typeof env.OTP_KV.get === 'function' && typeof env.OTP_KV.put === 'function') return 'kv';
  if (env.DB && typeof env.DB.prepare === 'function') return 'd1';
  return null;
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function newOtp() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + (buf[0] % 900000));
}

const key = (requestId) => `track_otp:${String(requestId).toUpperCase()}`;
const sendKey = (requestId) => `track_otp_send:${String(requestId).toUpperCase()}`;

async function ensureTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS track_otps (
       request_id TEXT PRIMARY KEY,
       code TEXT NOT NULL,
       attempts INTEGER NOT NULL DEFAULT 0,
       expires_at INTEGER NOT NULL,
       created_at INTEGER NOT NULL
     )`
  ).run();
}

async function readRecord(env, requestId, kind) {
  if (kind === 'kv') return await env.OTP_KV.get(key(requestId), 'json');
  await ensureTable(env);
  const row = await env.DB.prepare(
    'SELECT code, attempts, expires_at AS expiresAt, created_at AS createdAt FROM track_otps WHERE request_id = ?1'
  ).bind(String(requestId).toUpperCase()).first();
  return row || null;
}

async function writeRecord(env, requestId, record, kind) {
  if (kind === 'kv') {
    const ttl = Math.max(1, record.expiresAt - Math.floor(Date.now() / 1000));
    await env.OTP_KV.put(key(requestId), JSON.stringify(record), { expirationTtl: ttl });
    return;
  }
  await ensureTable(env);
  await env.DB.prepare(
    `INSERT INTO track_otps (request_id, code, attempts, expires_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(request_id) DO UPDATE SET code = excluded.code, attempts = excluded.attempts,
       expires_at = excluded.expires_at, created_at = excluded.created_at`
  ).bind(String(requestId).toUpperCase(), record.code, record.attempts, record.expiresAt, record.createdAt).run();
}

async function deleteRecord(env, requestId, kind) {
  if (kind === 'kv') {
    await env.OTP_KV.delete(key(requestId));
    return;
  }
  await env.DB.prepare('DELETE FROM track_otps WHERE request_id = ?1').bind(String(requestId).toUpperCase()).run();
}

async function readCounter(env, requestId) {
  if (env.OTP_KV && typeof env.OTP_KV.get === 'function') {
    return (await env.OTP_KV.get(sendKey(requestId), 'json')) || null;
  }
  return null;
}

async function writeCounter(env, requestId, counter) {
  if (env.OTP_KV && typeof env.OTP_KV.put === 'function') {
    await env.OTP_KV.put(sendKey(requestId), JSON.stringify(counter), { expirationTtl: 3600 });
  }
}

async function sendOtpEmail(env, to, otp, requestId) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[track-otp] RESEND_API_KEY is not configured');
    return { ok: false, misconfigured: true };
  }
  const safeId = String(requestId).replace(/[<>&"]/g, '');
  const html =
    `<h3>Verify your Netamps request</h3>` +
    `<p>Enter this code to view and negotiate request <strong>${safeId}</strong>:</p>` +
    `<p style="font-size:24px"><strong>${otp}</strong></p>` +
    `<p>It expires in 5 minutes. Never share this code with anyone.</p>`;
  let res;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: 'Netamps Portal <no-reply@netamps.in>',
        to,
        subject: `Verification code for request ${safeId}`,
        html
      })
    });
  } catch (err) {
    console.error('[track-otp] Resend fetch threw:', String((err && err.message) || err));
    return { ok: false, thrown: String((err && err.message) || err) };
  }
  if (!res.ok) {
    console.error('[track-otp] Resend API failed:', res.status, await res.text().catch(() => ''));
    return { ok: false, status: res.status };
  }
  return { ok: true };
}

/**
 * Issue a code. The caller MUST have already proven (requestId, email) match a
 * real order — this function never decides who is allowed to request a code.
 * Returns { ok:true } | { ok:false, code, message }.
 */
export async function issueTrackOtp(env, { requestId, email }) {
  const kind = storeKind(env);
  if (!kind) {
    return { ok: false, code: 'unavailable', message: 'Verification service temporarily unavailable.' };
  }

  const nowSec = Math.floor(Date.now() / 1000);

  if (kind === 'kv') {
    const counter = await readCounter(env, requestId);
    if (counter && counter.count >= MAX_SENDS_PER_HOUR) {
      return { ok: false, code: 'rate', message: 'Too many codes requested. Please try again later.' };
    }
  }

  const existing = await readRecord(env, requestId, kind);
  if (existing && nowSec - existing.createdAt < RESEND_COOLDOWN_SECONDS) {
    const wait = RESEND_COOLDOWN_SECONDS - (nowSec - existing.createdAt);
    return { ok: false, code: 'cooldown', message: `Please wait ${wait}s before requesting a new code.` };
  }

  const otp = newOtp();
  const record = { code: otp, attempts: 0, createdAt: nowSec, expiresAt: nowSec + OTP_TTL_SECONDS };
  await writeRecord(env, requestId, record, kind);

  const sent = await sendOtpEmail(env, email, otp, requestId);
  if (!sent.ok) {
    await deleteRecord(env, requestId, kind);
    if (sent.misconfigured) {
      return { ok: false, code: 'email-config', message: 'Email service is not configured.' };
    }
    return { ok: false, code: 'email-fail', message: 'Failed to deliver the code. Please try again shortly.' };
  }

  if (kind === 'kv') {
    const counter = (await readCounter(env, requestId)) || { count: 0 };
    await writeCounter(env, requestId, { count: counter.count + 1 });
  }

  return { ok: true, expiresIn: OTP_TTL_SECONDS };
}

/** Verify + consume a code. Returns true only on an exact, unexpired match. */
export async function verifyTrackOtp(env, { requestId, code }) {
  const kind = storeKind(env);
  if (!kind) return false;

  const record = await readRecord(env, requestId, kind);
  if (!record) return false;

  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec > record.expiresAt) {
    await deleteRecord(env, requestId, kind);
    return false;
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    await deleteRecord(env, requestId, kind);
    return false;
  }
  if (!timingSafeEqual(String(record.code), String(code))) {
    record.attempts += 1;
    if (record.attempts >= MAX_ATTEMPTS) {
      await deleteRecord(env, requestId, kind);
    } else {
      await writeRecord(env, requestId, record, kind);
    }
    return false;
  }

  await deleteRecord(env, requestId, kind); // single-use
  return true;
}
