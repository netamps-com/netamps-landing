/**
 * POST /api/verify-turnstile
 *
 * Server-side Cloudflare Turnstile token verification.
 * Runs on Cloudflare Pages Functions (Workers runtime) — the
 * TURNSTILE_SECRET_KEY never leaves the server.
 *
 * Required env (Cloudflare Pages → Settings → Environment variables):
 *   TURNSTILE_SECRET_KEY   Turnstile secret key (NOT NEXT_PUBLIC_ prefixed)
 * Optional env:
 *   TURNSTILE_ALLOWED_HOSTNAME   e.g. www.netamps.com — rejects tokens issued for other hostnames
 */

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;
const rateLimitMap = new Map();

function getClientIp(request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown'
  );
}

// Shared siteverify core (imported by the login handler so bots cannot
// bypass the widget by POSTing directly). Returns { ok } — callers map
// failures to their own generic messages to avoid account oracles.
export async function verifyTurnstileToken(env, token, ip, action) {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) return { configured: false, ok: false };
  try {
    const formData = new FormData();
    formData.append('secret', secret);
    formData.append('response', token);
    if (ip && ip !== 'unknown') formData.append('remoteip', ip);

    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData
    });
    const outcome = await verifyRes.json();

    if (!outcome.success) return { configured: true, ok: false };
    if (action && outcome.action && outcome.action !== action) return { configured: true, ok: false };

    const allowedHostname = env.TURNSTILE_ALLOWED_HOSTNAME;
    if (allowedHostname && outcome.hostname && outcome.hostname !== allowedHostname) {
      return { configured: true, ok: false };
    }
    return { configured: true, ok: true };
  } catch (err) {
    console.error('[verify-turnstile] siteverify request failed:', err);
    return { configured: true, ok: false, unavailable: true };
  }
}

function isRateLimited(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  record.count += 1;
  // Opportunistic cleanup to bound memory per isolate
  if (rateLimitMap.size > 5000) rateLimitMap.clear();
  return record.count > MAX_REQUESTS_PER_WINDOW;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({ success: false, error: 'Too many attempts. Try again shortly.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error('[verify-turnstile] TURNSTILE_SECRET_KEY is not configured');
    return new Response(JSON.stringify({ success: false, error: 'Verification service misconfigured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const action = typeof body.action === 'string' ? body.action.trim() : '';
  if (!token || token.length > 4096) {
    return new Response(JSON.stringify({ success: false, error: 'Missing verification token' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const check = await verifyTurnstileToken(env, token, ip, action || undefined);
    if (!check.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Verification failed' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('[verify-turnstile] siteverify request failed:', err);
    return new Response(JSON.stringify({ success: false, error: 'Verification service unavailable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
