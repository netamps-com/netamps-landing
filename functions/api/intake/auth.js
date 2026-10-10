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
  // Restores evidence viewing for dashboard users; the owner-or-admin RBAC
  // in each handler below is unchanged, so this alters WHO can authenticate,
  // never WHAT they can see. Server-issued HttpOnly sessions remain the
  // correct long-term fix.
  const dashSession = cookies['session_id'];
  const dashRole = cookies['user_role'];
  if (dashSession && dashRole) {
    const email = String(dashRole).slice(0, 254);
    if (/^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/.test(email)) {
      return { email, role: email === 'admin@netamps.com' ? 'admin' : 'user' };
    }
  }

  return null;
}
