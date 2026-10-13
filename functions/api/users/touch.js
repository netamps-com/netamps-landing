import { verifySession } from '../intake/auth';

/**
 * POST /api/users/touch — idle-clock heartbeat for the mandatory 30-minute
 * idle policy (see app/lib/idle-timeout.tsx; IDLE_LIMIT_MS lives in
 * functions/api/intake/auth.js).
 *
 * Session-gated. Bumps sessions.last_seen at most once per TOUCH_THROTTLE_MS
 * (heartbeat floods must never become a write amplifier). Best-effort and
 * non-revealing: missing DB, missing row (pure demo-cookie sessions), and
 * throttled calls all answer identical success — the caller cannot
 * distinguish them, and the mandate does not depend on this endpoint (the
 * verifySession idle gate enforces regardless).
 */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

// Keep in sync with app/lib/idle-timeout.tsx TOUCH_EVERY_MS.
const TOUCH_THROTTLE_MS = 5 * 60 * 1000;

function readCookies(request) {
  const raw = request.headers.get('Cookie') || '';
  const out = {};
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name && out[name] === undefined) out[name] = value;
  }
  return out;
}

export async function onRequestPost({ request, env }) {
  const caller = await verifySession(env, request);
  if (!caller) {
    return json({ success: false, message: 'Unauthorized' }, 401);
  }
  // Idle-dead rows are already rejected above (mandate uniform for all).
  if (!env.DB || typeof env.DB.prepare !== 'function') {
    return json({ success: true, touched: false });
  }
  try {
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, email TEXT NOT NULL, role TEXT NOT NULL, expires_at DATETIME NOT NULL, last_seen DATETIME)'
    ).run();
    try {
      await env.DB.prepare('ALTER TABLE sessions ADD COLUMN last_seen DATETIME').run();
    } catch {}
    const cookies = readCookies(request);
    // Mirror verifySession's preference: the DB-backed HttpOnly token first.
    const token = cookies['session_token'] || cookies['session_id'] || '';
    if (!token) {
      return json({ success: true, touched: false });
    }
    const row = await env.DB.prepare('SELECT last_seen FROM sessions WHERE token = ?').bind(token).first().catch(() => null);
    if (!row) {
      return json({ success: true, touched: false });
    }
    // ISO strings sort lexicographically = chronologically; unparsable or
    // missing values always re-touch (fail-open toward activity, never lockout).
    const lastSeenMs = row.last_seen ? new Date(row.last_seen).getTime() : NaN;
    if (Number.isFinite(lastSeenMs) && Date.now() - lastSeenMs < TOUCH_THROTTLE_MS) {
      return json({ success: true, touched: false });
    }
    await env.DB.prepare('UPDATE sessions SET last_seen = ? WHERE token = ?').bind(new Date().toISOString(), token).run();
    return json({ success: true, touched: true });
  } catch {
    return json({ success: true, touched: false });
  }
}
