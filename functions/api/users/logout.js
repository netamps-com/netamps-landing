/**
 * POST /api/users/logout
 *
 * Server-side session termination. The dashboard's Terminate button currently
 * clears only browser cookies: the D1 `sessions` row stays valid until expiry
 * (up to 8h) and the HttpOnly `session_token` cookie cannot be cleared from
 * JS at all — so this endpoint does all three:
 *   1. DELETE the session row(s) for the presented token(s) — D1 and PG.
 *   2. Expire `session_token` via Set-Cookie (only the server can touch it).
 *   3. Expire the demo `session_id` / `user_role` cookies the dashboard reads.
 *
 * Always returns success (logout must never trap the user); a missing or
 * unknown token simply means there is nothing to revoke. Never caches.
 */

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders }
  });
}

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

function expiredCookie(name) {
  return `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; SameSite=Lax`;
}

export async function onRequestPost({ request, env }) {
  const cookies = readCookies(request);
  const tokens = [cookies['session_token'], cookies['session_id']].filter(
    (t) => typeof t === 'string' && t !== '' && t !== 'undefined' && t.length <= 256
  );

  // AUTH_LOGOUT is recorded server-side (client logging dies with the
  // session being destroyed). Email resolved from the doomed row when
  // possible, else 'unknown' — the revocation itself never depends on it.
  const auditLogout = async (email) => {
    try {
      if (!env.DB || typeof env.DB.prepare !== 'function') return;
      await env.DB.prepare(
        'CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, timestamp TEXT, event_type TEXT, page TEXT, details TEXT, username TEXT, ip_address TEXT)'
      ).run();
      await env.DB.prepare(
        'INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
      ).bind(
        crypto.randomUUID(), new Date().toISOString(), 'AUTH_LOGOUT', 'Dashboard Page',
        JSON.stringify({ revoked: tokens.length }), String(email || 'unknown').slice(0, 254),
        request.headers.get('cf-connecting-ip') || 'unknown'
      ).run();
    } catch {}
  };

  let logoutEmail = String(cookies['user_role'] || 'unknown').slice(0, 254);

  try {
    if (tokens.length > 0 && env.DB && typeof env.DB.prepare === 'function') {
      try {
        await env.DB.prepare('CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, email TEXT NOT NULL, role TEXT NOT NULL, expires_at DATETIME NOT NULL)').run();
      } catch {}
      for (const token of tokens) {
        try {
          const row = await env.DB.prepare('SELECT email FROM sessions WHERE token = ?').bind(token).first();
          if (row && row.email) logoutEmail = String(row.email).slice(0, 254);
          await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
        } catch {}
      }
      await auditLogout(logoutEmail);
    } else if (tokens.length > 0 && env.DATABASE_URL) {
      try {
        const { Client } = await import('pg');
        const client = new Client({ connectionString: env.DATABASE_URL });
        await client.connect();
        try {
          await client.query('CREATE TABLE IF NOT EXISTS sessions (token VARCHAR(255) PRIMARY KEY, email VARCHAR(255) NOT NULL, role VARCHAR(50) NOT NULL, expires_at TIMESTAMP NOT NULL)');
        } catch {}
        for (const token of tokens) {
          try {
            await client.query('DELETE FROM sessions WHERE token = $1', [token]);
          } catch {}
        }
        await client.end();
      } catch {}
    }
  } catch {}

  // Multi-value Set-Cookie: only the server can expire the HttpOnly token,
  // and Headers.append is required to carry all three expiries.
  const loggedOut = json({ success: true }, 200);
  const outHeaders = new Headers(loggedOut.headers);
  outHeaders.append('Set-Cookie', `${expiredCookie('session_token')}; Secure`);
  outHeaders.append('Set-Cookie', expiredCookie('session_id'));
  outHeaders.append('Set-Cookie', expiredCookie('user_role'));
  return new Response(loggedOut.body, { status: 200, headers: outHeaders });
}
