function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Server-issued dashboard session value: token.exp.sig (self-validating).
export async function signDemoSession(secret, token, expiresAtMs) {
  const sig = await hmacHex(secret, `${token}.${expiresAtMs}`);
  return `${token}.${expiresAtMs}.${sig}`;
}

const EMAIL_RE_AUTH = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

// MANDATE: uniform 30-minute idle termination for every session,
// irrespective of role or policy (no exemptions, no per-role branches).
// Keep in sync with app/lib/idle-timeout.tsx IDLE_LIMIT_MS. last_seen NULL
// (pre-deploy rows) is treated as "just now" — at most one 30-minute grace
// window, after which the touch endpoint has written a real value and
// enforcement is identical. Unparsable values fail open (never lockout).
const IDLE_LIMIT_MS = 30 * 60 * 1000;

async function lookupSessionRow(env, sessionToken) {
  const query = `
        SELECT s.email, u.role, s.expires_at, s.last_seen
        FROM sessions s
        LEFT JOIN users u ON s.email = u.email
        WHERE s.token = ?
      `;
  try {
    return await env.DB.prepare(query).bind(sessionToken).first();
  } catch (err) {
    // Pre-deploy tables lack last_seen: add the column once and retry. Any
    // other error (missing table, etc.) preserves the old null behavior.
    if (!/no such column/i.test(String((err && err.message) || err))) throw err;
    try {
      await env.DB.prepare('ALTER TABLE sessions ADD COLUMN last_seen DATETIME').run();
    } catch {}
    return await env.DB.prepare(query).bind(sessionToken).first();
  }
}

export async function verifySession(env, request) {
  const cookie = request.headers.get('Cookie') || '';
  const cookies = Object.fromEntries(cookie.split(';').map(c => c.trim().split('=')));
  const sessionToken = cookies['session_token'];

  if (sessionToken && env.DB) {
    try {
      const row = await lookupSessionRow(env, sessionToken);
      if (row) {
        const expiresAt = new Date(row.expires_at).getTime();
        if (Date.now() > expiresAt) {
          // Session expired
          await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(sessionToken).run();
        } else {
          // Idle mandate: uniform for every role and policy. NULL last_seen
          // (legacy rows) counts as just-now — one grace window at most.
          const lastSeenMs = row.last_seen ? new Date(row.last_seen).getTime() : Date.now();
          if (Number.isFinite(lastSeenMs) && Date.now() - lastSeenMs > IDLE_LIMIT_MS) {
            try {
              await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(sessionToken).run();
            } catch {}
          } else {
            // Pass-the-cookie control (see authz/login-guard.mjs bindingVerdict):
            // revoke ONLY on a double mismatch (different network AND different
            // device). A lone IP hop or UA change passes, so this cannot lock
            // out legitimate users; rows without bindings (legacy) pass
            // untouched. Any infra error here fails open — only an explicit
            // double mismatch revokes.
            try {
              const { bindingVerdict } = await import('../authz/login-guard.mjs');
              const hip = request.headers.get('cf-connecting-ip') ||
                (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
              const hua = request.headers.get('user-agent') || 'unknown';
              let huaHash = '';
              try {
                const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hua));
                huaHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
              } catch {}
              const brow = await env.DB.prepare('SELECT ip_prefix, ua_hash FROM sessions WHERE token = ?').bind(sessionToken).first().catch(() => null);
              if (bindingVerdict(brow, { ip: hip, uaHash: huaHash }) === 'hijack') {
                try {
                  await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(sessionToken).run();
                } catch {}
                try {
                  await env.DB.prepare(
                    'CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, timestamp TEXT, event_type TEXT, page TEXT, details TEXT, username TEXT, ip_address TEXT)'
                  ).run();
                  await env.DB.prepare(
                    'INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address) VALUES (?1,?2,?3,?4,?5,?6,?7)'
                  ).bind(crypto.randomUUID(), new Date().toISOString(), 'AUTH_SESSION_HIJACK_REVOKED', 'Session Verify',
                    JSON.stringify({ boundPrefix: brow && brow.ip_prefix ? 'set' : 'unset' }), String(row.email || 'unknown').slice(0, 254), hip).run();
                } catch {}
                return null;
              }
            } catch {}
            return { email: row.email, role: row.role || 'user' };
          }
        }
      }
    } catch (err) {
      console.error('Session verification error', err);
    }
  }

  // Fallback: dashboard demo sessions (session_id + user_role cookies).
  // The session_id value MUST be server-issued (token.exp.sig) once
  // DEMO_SESSION_SECRET is configured — a forged cookie fails HMAC and
  // authenticates as nobody (previously any forged user_role cookie passed
  // as admin). Without the secret (dev only), legacy unsigned cookies still
  // work so local development never locks out.
  const dashSession = cookies['session_id'];
  const dashRole = cookies['user_role'];
  if (dashSession && dashRole) {
    const email = String(dashRole).slice(0, 254);
    if (!EMAIL_RE_AUTH.test(email)) return null;
    const secret = env.DEMO_SESSION_SECRET;
    if (!secret) {
      return { email, role: email === 'admin@netamps.com' ? 'admin' : 'user' };
    }
    const parts = String(dashSession).split('.');
    if (parts.length !== 3) return null; // legacy unsigned cookie: re-login required
    const [token, expStr, sig] = parts;
    if (!token || !/^\d+$/.test(expStr || '')) return null;
    if (Date.now() > parseInt(expStr, 10)) return null;
    let good = '';
    try {
      good = await hmacHex(secret, `${token}.${expStr}`);
    } catch {
      return null;
    }
    if (!timingSafeEqual(good, String(sig).toLowerCase())) return null;
    return { email, role: email === 'admin@netamps.com' ? 'admin' : 'user' };
  }

  return null;
}
