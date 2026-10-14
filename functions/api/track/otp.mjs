/**
 * Track-order OTP — a SECOND, isolated OTP channel, keyed by EMAIL.
 *
 * Identity model: the email address IS the buyer. A code delivered to the
 * mailbox proves ownership of every request filed under that address, so no
 * order ID is needed to look anything up — the buyer verifies once and then
 * picks from their own list.
 *
 * It deliberately does NOT share keys with the login OTP (functions/api/otp/*):
 * a code issued to verify a buyer's mailbox can never be redeemed to log in,
 * and vice versa.
 *
 * ANTI-ENUMERATION: rate limits (cooldown + per-hour cap) are enforced for
 * EVERY address, whether or not that address has requests on file. A code is
 * only actually delivered when orders exist, but the responses are identical
 * either way — so probing an address never reveals whether it has orders.
 *
 * Storage follows the same contract as the rest of the mailer — KV (OTP_KV)
 * preferred, D1 (DB) fallback — so it works on the current deployment and
 * future-proofs for a KV binding without a code change.
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

/** Normalised identity key. Emails are case-insensitive and never trimmed away. */
const norm = (email) => String(email || '').trim().toLowerCase();
const key = (email) => `track_otp:email:${norm(email)}`;
const sendKey = (email) => `track_otp_send:email:${norm(email)}`;

async function ensureTables(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS track_email_otps (
       email TEXT PRIMARY KEY,
       code TEXT NOT NULL,
       attempts INTEGER NOT NULL DEFAULT 0,
       expires_at INTEGER NOT NULL,
       created_at INTEGER NOT NULL
     )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS track_email_sends (
       email TEXT PRIMARY KEY,
       count INTEGER NOT NULL DEFAULT 0,
       window_start INTEGER NOT NULL
     )`
  ).run();
}

async function readRecord(env, email, kind) {
  if (kind === 'kv') return await env.OTP_KV.get(key(email), 'json');
  await ensureTables(env);
  const row = await env.DB.prepare(
    'SELECT code, attempts, expires_at AS expiresAt, created_at AS createdAt FROM track_email_otps WHERE email = ?1'
  ).bind(norm(email)).first();
  return row || null;
}

async function writeRecord(env, email, record, kind) {
  if (kind === 'kv') {
    const ttl = Math.max(1, record.expiresAt - Math.floor(Date.now() / 1000));
    await env.OTP_KV.put(key(email), JSON.stringify(record), { expirationTtl: ttl });
    return;
  }
  await ensureTables(env);
  await env.DB.prepare(
    `INSERT INTO track_email_otps (email, code, attempts, expires_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(email) DO UPDATE SET code = excluded.code, attempts = excluded.attempts,
       expires_at = excluded.expires_at, created_at = excluded.created_at`
  ).bind(norm(email), record.code, record.attempts, record.expiresAt, record.createdAt).run();
}

async function deleteRecord(env, email, kind) {
  if (kind === 'kv') {
    await env.OTP_KV.delete(key(email));
    return;
  }
  await env.DB.prepare('DELETE FROM track_email_otps WHERE email = ?1').bind(norm(email)).run();
}

/**
 * Per-hour send counter. KV when bound, otherwise a tiny D1 table — so the cap
 * holds on the CURRENT deployment too, not just after a future KV migration.
 * Returns the count for the current window (after counting this send).
 */
async function bumpSendCounter(env, email, kind) {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStartKey = kind === 'kv' ? sendKey(email) : null;

  if (kind === 'kv') {
    const counter = (await env.OTP_KV.get(windowStartKey, 'json')) || null;
    const fresh = !counter || nowSec - counter.start > 3600;
    const next = { count: fresh ? 1 : counter.count + 1, start: fresh ? nowSec : counter.start };
    await env.OTP_KV.put(windowStartKey, JSON.stringify(next), { expirationTtl: 3600 });
    return next.count;
  }

  await ensureTables(env);
  const row = await env.DB.prepare('SELECT count, window_start AS windowStart FROM track_email_sends WHERE email = ?1')
    .bind(norm(email)).first();
  const fresh = !row || nowSec - row.windowStart > 3600;
  const count = fresh ? 1 : row.count + 1;
  const start = fresh ? nowSec : row.windowStart;
  await env.DB.prepare(
    `INSERT INTO track_email_sends (email, count, window_start) VALUES (?1, ?2, ?3)
     ON CONFLICT(email) DO UPDATE SET count = excluded.count, window_start = excluded.window_start`
  ).bind(norm(email), count, start).run();
  return count;
}

async function readSendCount(env, email, kind) {
  if (kind === 'kv') {
    const counter = await env.OTP_KV.get(sendKey(email), 'json');
    if (!counter) return 0;
    return Math.floor(Date.now() / 1000) - counter.start > 3600 ? 0 : counter.count;
  }
  await ensureTables(env);
  const row = await env.DB.prepare('SELECT count, window_start AS windowStart FROM track_email_sends WHERE email = ?1')
    .bind(norm(email)).first();
  if (!row) return 0;
  return Math.floor(Date.now() / 1000) - row.windowStart > 3600 ? 0 : row.count;
}

async function sendOtpEmail(env, to, otp) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[track-otp] RESEND_API_KEY is not configured');
    return { ok: false, misconfigured: true };
  }
  const html =
    `<h3>Verify your Netamps email address</h3>` +
    `<p>Enter this code to view and negotiate every request filed under <strong>${String(to).replace(/[<>&"]/g, '')}</strong>:</p>` +
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
        subject: 'Your Netamps verification code',
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
 * Issue a code to an email address.
 *
 * @param {object} opts
 * @param {string} opts.email        the address being proven
 * @param {boolean} opts.hasOrders   whether requests exist for it — decides if a
 *                                   mail is actually DELIVERED, never whether
 *                                   the call succeeds (responses stay uniform).
 * Returns { ok:true } | { ok:false, code, message }.
 */
export async function issueTrackOtp(env, { email, hasOrders = true } = {}) {
  const kind = storeKind(env);
  if (!kind) {
    return { ok: false, code: 'unavailable', message: 'Verification service temporarily unavailable.' };
  }
  const to = norm(email);
  if (!to) return { ok: false, code: 'invalid', message: 'A valid email address is required.' };

  const nowSec = Math.floor(Date.now() / 1000);

  // Limits run BEFORE any branch, for every address — identical behaviour with
  // or without orders on file.
  const sends = await readSendCount(env, to, kind);
  if (sends >= MAX_SENDS_PER_HOUR) {
    return { ok: false, code: 'rate', message: 'Too many codes requested. Please try again later.' };
  }
  const existing = await readRecord(env, to, kind);
  if (existing && nowSec - existing.createdAt < RESEND_COOLDOWN_SECONDS) {
    const wait = RESEND_COOLDOWN_SECONDS - (nowSec - existing.createdAt);
    return { ok: false, code: 'cooldown', message: `Please wait ${wait}s before requesting a new code.` };
  }

  const otp = newOtp();
  const record = { code: otp, attempts: 0, createdAt: nowSec, expiresAt: nowSec + OTP_TTL_SECONDS };
  await writeRecord(env, to, record, kind);
  await bumpSendCounter(env, to, kind);

  // Nothing on file for this address → hold the code, send nothing. The caller
  // still reports success, so this is indistinguishable from a real send.
  if (!hasOrders) return { ok: true, expiresIn: OTP_TTL_SECONDS, suppressed: true };

  const sent = await sendOtpEmail(env, to, otp);
  if (!sent.ok) {
    await deleteRecord(env, to, kind);
    if (sent.misconfigured) {
      return { ok: false, code: 'email-config', message: 'Email service is not configured.' };
    }
    return { ok: false, code: 'email-fail', message: 'Failed to deliver the code. Please try again shortly.' };
  }

  return { ok: true, expiresIn: OTP_TTL_SECONDS };
}

/**
 * Verify + consume a code. Returns true only on an exact, unexpired match.
 * Attempts are consumed even for addresses with no requests, so the
 * brute-force budget is the same everywhere.
 */
export async function verifyTrackOtp(env, { email, code }) {
  const kind = storeKind(env);
  if (!kind) return false;

  const record = await readRecord(env, email, kind);
  if (!record) return false;

  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec > record.expiresAt) {
    await deleteRecord(env, email, kind);
    return false;
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    await deleteRecord(env, email, kind);
    return false;
  }
  if (!timingSafeEqual(String(record.code), String(code))) {
    record.attempts += 1;
    if (record.attempts >= MAX_ATTEMPTS) {
      await deleteRecord(env, email, kind);
    } else {
      await writeRecord(env, email, record, kind);
    }
    return false;
  }

  await deleteRecord(env, email, kind); // single-use
  return true;
}

export { OTP_TTL_SECONDS, MAX_SENDS_PER_HOUR, MAX_ATTEMPTS, RESEND_COOLDOWN_SECONDS };
