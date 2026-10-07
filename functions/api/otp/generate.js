/**
 * POST /api/otp/generate
 *
 * Production OTP issuance. Workers-compatible by design:
 *  - Storage: Cloudflare KV (OTP_KV binding, native TTL) with D1 (DB binding) fallback.
 *    Postgres-over-TCP and SMTP are IMPOSSIBLE from Workers — do not re-add them here.
 *  - Delivery: Resend REST API using RESEND_API_KEY.
 *  - Crypto: CSPRNG via crypto.getRandomValues. The code is NEVER returned to the
 *    client and is single-use with a 5-minute expiry.
 *
 * Required bindings/secrets (Pages → Settings → Functions):
 *   OTP_KV               KV namespace binding (preferred store)
 *   DB                   D1 database binding (fallback store; at least one required)
 *   RESEND_API_KEY       Secret for api.resend.com
 */

const OTP_TTL_SECONDS = 300;
const RESEND_COOLDOWN_SECONDS = 30;
const MAX_SENDS_PER_HOUR = 5;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function newOtp() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + (buf[0] % 900000));
}

const otpKey = (email) => `otp:${email.toLowerCase()}`;
const sendKey = (email) => `otp_send:${email.toLowerCase()}`;

/* ── Storage layer (KV preferred, D1 fallback) ─────────────────────────── */

/** Returns 'kv' | 'd1' | null. A binding with the wrong shape (e.g. a D1
 *  database bound as OTP_KV) is treated as absent and reported, never called. */
function storeKind(env) {
  if (env.OTP_KV && typeof env.OTP_KV.get === 'function' && typeof env.OTP_KV.put === 'function') return 'kv';
  if (env.DB && typeof env.DB.prepare === 'function') return 'd1';
  return null;
}

function storeMisconfigured(env) {
  return Boolean(
    (env.OTP_KV && typeof env.OTP_KV.get !== 'function') ||
    (env.DB && typeof env.DB.prepare !== 'function')
  );
}

async function ensureD1(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS otps (
       email TEXT PRIMARY KEY,
       code TEXT NOT NULL,
       attempts INTEGER NOT NULL DEFAULT 0,
       expires_at INTEGER NOT NULL,
       created_at INTEGER NOT NULL
     )`
  ).run();
  // Self-heal tables created by older versions (email, code, created_at only).
  // CREATE TABLE IF NOT EXISTS never upgrades an existing table, so a legacy
  // table would otherwise crash every SELECT with "no such column".
  const cols = await env.DB.prepare(`PRAGMA table_info(otps)`).all();
  const names = new Set((cols.results || []).map((c) => c.name));
  if (!names.has('code')) {
    await env.DB.prepare(`ALTER TABLE otps ADD COLUMN code TEXT NOT NULL DEFAULT ''`).run();
  }
  if (!names.has('attempts')) {
    await env.DB.prepare(`ALTER TABLE otps ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0`).run();
  }
  if (!names.has('expires_at')) {
    await env.DB.prepare(`ALTER TABLE otps ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0`).run();
  }
  if (!names.has('created_at')) {
    await env.DB.prepare(`ALTER TABLE otps ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0`).run();
  }
}

async function readOtp(env, email, kind) {
  if (kind === 'kv') {
    return await env.OTP_KV.get(otpKey(email), 'json');
  }
  await ensureD1(env);
  const row = await env.DB.prepare(
    'SELECT code, attempts, expires_at AS expiresAt, created_at AS createdAt FROM otps WHERE email = ?1'
  ).bind(email.toLowerCase()).first();
  return row || null;
}

async function writeOtp(env, email, record, ttlSeconds, kind) {
  if (kind === 'kv') {
    await env.OTP_KV.put(otpKey(email), JSON.stringify(record), { expirationTtl: ttlSeconds });
    return;
  }
  await ensureD1(env);
  await env.DB.prepare(
    `INSERT INTO otps (email, code, attempts, expires_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(email) DO UPDATE SET code = excluded.code, attempts = excluded.attempts,
       expires_at = excluded.expires_at, created_at = excluded.created_at`
  ).bind(email.toLowerCase(), record.code, record.attempts, record.expiresAt, record.createdAt).run();
}

async function deleteOtp(env, email, kind) {
  if (kind === 'kv') {
    await env.OTP_KV.delete(otpKey(email));
    return;
  }
  await env.DB.prepare('DELETE FROM otps WHERE email = ?1').bind(email.toLowerCase()).run();
}

async function readSendCounter(env, email) {
  if (env.OTP_KV && typeof env.OTP_KV.get === 'function') {
    return (await env.OTP_KV.get(sendKey(email), 'json')) || null;
  }
  return null; // D1 path: enforced via cooldown on the OTP record itself
}

async function writeSendCounter(env, email, counter) {
  if (env.OTP_KV && typeof env.OTP_KV.put === 'function') {
    await env.OTP_KV.put(sendKey(email), JSON.stringify(counter), { expirationTtl: 3600 });
  }
}

/* ── Email delivery (Resend) ───────────────────────────────────────────── */

async function sendOtpEmail(env, to, otp) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[otp] RESEND_API_KEY is not configured');
    return { ok: false, misconfigured: true };
  }
  const html =
    `<h3>Your Netamps Verification Code</h3>` +
    `<p>Your OTP is: <strong style="font-size:24px">${otp}</strong>.</p>` +
    `<p>It will expire in 5 minutes. Never share this code with anyone.</p>`;
    
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json', 
      'Authorization': `Bearer ${apiKey}` 
    },
    body: JSON.stringify({
      from: 'onboarding@resend.dev',
      to: to,
      subject: 'Your Netamps Verification Code',
      html: html
    })
  });
  
  if (!res.ok) {
    console.error('[otp] Resend API failed:', res.status, await res.text().catch(() => ''));
    return { ok: false };
  }
  return { ok: true };
}

/* ── Handler ───────────────────────────────────────────────────────────── */

export async function onRequestPost({ request, env }) {
  let stage = 'parse';
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ success: false, message: 'Invalid request body' }, 400);
    }

    stage = 'validate';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
      return json({ success: false, message: 'A valid email address is required' }, 400);
    }

    stage = 'store-check';
    const kind = storeKind(env);
    if (!kind) {
      if (storeMisconfigured(env)) {
        console.error('[otp] OTP store binding has the wrong type. OTP_KV must be a KV namespace, DB must be a D1 database.');
        return json({ success: false, message: 'Verification store misconfigured. Please contact support.', stage: 'store-check' }, 503);
      }
      console.error('[otp] No OTP store bound. Bind OTP_KV (KV) or DB (D1) in Pages → Settings → Functions.');
      return json({ success: false, message: 'Verification service temporarily unavailable. Please try again shortly.', stage: 'store-check' }, 503);
    }

    const nowSec = Math.floor(Date.now() / 1000);

    // Hourly send cap (KV-backed; D1 path relies on cooldown + consume-on-success)
    stage = 'rate-check';
    if (kind === 'kv') {
      const counter = await readSendCounter(env, email);
      if (counter && counter.count >= MAX_SENDS_PER_HOUR) {
        return json({ success: false, message: 'Too many codes requested. Please try again later.' }, 429);
      }
    }

    // Resend cooldown — prevents double-click / retry storms
    stage = 'otp-read';
    const existing = await readOtp(env, email, kind);
    if (existing && nowSec - existing.createdAt < RESEND_COOLDOWN_SECONDS) {
      const wait = RESEND_COOLDOWN_SECONDS - (nowSec - existing.createdAt);
      return json({ success: false, message: `Please wait ${wait}s before requesting a new code.` }, 429);
    }

    stage = 'otp-write';
    const otp = newOtp();
    const record = { code: otp, attempts: 0, createdAt: nowSec, expiresAt: nowSec + OTP_TTL_SECONDS };
    await writeOtp(env, email, record, OTP_TTL_SECONDS, kind);

    stage = 'email-send';
    const sent = await sendOtpEmail(env, email, otp);
    if (!sent.ok) {
      await deleteOtp(env, email, kind); // don't leave an undeliverable code behind
      if (sent.misconfigured) {
        return json({ success: false, message: 'Email service is not configured. Please contact support.', stage: 'email-send' }, 503);
      }
      return json({ success: false, message: 'Failed to deliver the OTP email. Please try again shortly.', stage: 'email-send' }, 502);
    }

    stage = 'counter-write';
    if (kind === 'kv') {
      const counter = (await readSendCounter(env, email)) || { count: 0 };
      await writeSendCounter(env, email, { count: counter.count + 1 });
    }

    return json({ success: true, message: 'OTP sent successfully. It expires in 5 minutes.', expiresIn: OTP_TTL_SECONDS });
  } catch (err) {
    console.error(`[otp] Generate error at stage=${stage}:`, err);
    return json({ success: false, message: 'Failed to generate OTP. Please try again shortly.', stage }, 500);
  }
}
