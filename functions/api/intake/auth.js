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

export async function verifySession(env, request) {
  const cookie = request.headers.get('Cookie') || '';
  const cookies = Object.fromEntries(cookie.split(';').map(c => c.trim().split('=')));
  const sessionToken = cookies['session_token'];

  if (sessionToken && env.DB) {
    try {
      const row = await env.DB.prepare(`
        SELECT s.email, u.role, s.expires_at 
        FROM sessions s 
        LEFT JOIN users u ON s.email = u.email 
        WHERE s.token = ?
      `).bind(sessionToken).first();
      if (row) {
        const expiresAt = new Date(row.expires_at).getTime();
        if (Date.now() > expiresAt) {
          // Session expired
          await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(sessionToken).run();
        } else {
          return { email: row.email, role: row.role || 'user' };
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
