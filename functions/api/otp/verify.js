/**
 * POST /api/otp/verify
 *
 * Production OTP validation. Pairs with generate.js:
 *  - Same store contract (KV OTP_KV preferred, D1 DB fallback).
 *  - Enforces the 5-minute expiry the email promises.
 *  - Single-use: a verified code is deleted immediately.
 *  - Brute-force protection: 5 wrong attempts invalidate the code.
 *  - Constant-time comparison (no early-exit timing signal).
 */

const MAX_ATTEMPTS = 5;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
const CODE_RE = /^[0-9]{6}$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const otpKey = (email) => `otp:${email.toLowerCase()}`;

/** Returns 'kv' | 'd1' | null. A binding with the wrong shape is treated as absent. */
function storeKind(env) {
  if (env.OTP_KV && typeof env.OTP_KV.get === 'function' && typeof env.OTP_KV.put === 'function') return 'kv';
  if (env.DB && typeof env.DB.prepare === 'function') return 'd1';
  return null;
}

async function readOtp(env, email, kind) {
  if (kind === 'kv') {
    return await env.OTP_KV.get(otpKey(email), 'json');
  }
  const row = await env.DB.prepare(
    'SELECT code, attempts, expires_at AS expiresAt, created_at AS createdAt FROM otps WHERE email = ?1'
  ).bind(email.toLowerCase()).first();
  return row || null;
}

async function writeOtp(env, email, record, kind) {
  if (kind === 'kv') {
    const ttl = Math.max(1, record.expiresAt - Math.floor(Date.now() / 1000));
    await env.OTP_KV.put(otpKey(email), JSON.stringify(record), { expirationTtl: ttl });
    return;
  }
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
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!email || email.length > 254 || !EMAIL_RE.test(email) || !CODE_RE.test(code)) {
      return json({ success: false, message: 'A valid email address and 6-digit code are required' }, 400);
    }

    stage = 'store-check';
    const kind = storeKind(env);
    if (!kind) {
      console.error('[otp] No OTP store bound. Bind OTP_KV (KV) or DB (D1) in Pages → Settings → Functions.');
      return json({ success: false, message: 'Verification service temporarily unavailable. Please try again shortly.', stage: 'store-check' }, 503);
    }

    stage = 'otp-read';
    const record = await readOtp(env, email, kind);
    if (!record) {
      return json({ success: false, message: 'Invalid or expired OTP. Please request a new code.' }, 400);
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec > record.expiresAt) {
      stage = 'otp-expire';
      await deleteOtp(env, email, kind);
      return json({ success: false, message: 'This OTP has expired. Please request a new code.' }, 400);
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      stage = 'otp-locked';
      await deleteOtp(env, email, kind);
      return json({ success: false, message: 'Too many incorrect attempts. Please request a new code.' }, 429);
    }

    stage = 'otp-compare';
    if (!safeEqual(record.code, code)) {
      record.attempts += 1;
      if (record.attempts >= MAX_ATTEMPTS) {
        await deleteOtp(env, email, kind);
        return json({ success: false, message: 'Too many incorrect attempts. Please request a new code.' }, 429);
      }
      await writeOtp(env, email, record, kind);
      return json({ success: false, message: 'Invalid OTP Code.' }, 400);
    }

    stage = 'otp-consume';
    await deleteOtp(env, email, kind); // single-use: consume on success
    return json({ success: true, message: 'OTP verified successfully' });
  } catch (err) {
    console.error(`[otp] Verify error at stage=${stage}:`, err);
    return json({ success: false, message: 'Failed to verify OTP. Please try again shortly.', stage }, 500);
  }
}
