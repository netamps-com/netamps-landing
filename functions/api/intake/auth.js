export async function verifySession(env, request) {
  const cookie = request.headers.get('Cookie') || '';
  const cookies = Object.fromEntries(cookie.split(';').map(c => c.trim().split('=')));
  const sessionToken = cookies['session_token'];

  if (!sessionToken || !env.DB) {
    return null;
  }

  try {
    const row = await env.DB.prepare(`
      SELECT s.email, u.role, s.expires_at 
      FROM sessions s 
      LEFT JOIN users u ON s.email = u.email 
      WHERE s.token = ?
    `).bind(sessionToken).first();
    if (!row) return null;

    const expiresAt = new Date(row.expires_at).getTime();
    if (Date.now() > expiresAt) {
      // Session expired
      await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(sessionToken).run();
      return null;
    }

    return { email: row.email, role: row.role || 'user' };
  } catch (err) {
    console.error('Session verification error', err);
    return null;
  }
}
