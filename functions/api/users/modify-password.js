import { verifySession } from '../intake/auth';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * POST /api/users/modify-password — password change bound to the caller's session.
 * - Regular callers may change ONLY their own password and must prove the current one.
 * - Admins may reset any account without the current password (audited).
 * No Postgres branch: Workers have no TCP — D1 only.
 */
export async function onRequestPost({ request, env }) {
  try {
    const caller = await verifySession(env, request);
    if (!caller) {
      return json({ success: false, message: 'Unauthorized' }, 401);
    }

    if (!env.DB || typeof env.DB.prepare !== 'function') {
      return json({ success: false, message: 'User store unavailable. Please try again shortly.' }, 503);
    }

    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const passwordHash = typeof body?.passwordHash === 'string' ? body.passwordHash : '';
    const currentPasswordHash = typeof body?.currentPasswordHash === 'string' ? body.currentPasswordHash : '';

    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
      return json({ success: false, message: 'A valid email address is required' }, 400);
    }
    if (!passwordHash || passwordHash.length > 512) {
      return json({ success: false, message: 'A new password hash is required' }, 400);
    }

    const isAdmin = caller.role === 'admin';
    const isSelf = email === caller.email;
    if (!isSelf && !isAdmin) {
      return json({ success: false, message: 'Forbidden: you can only change your own password' }, 403);
    }

    // Non-admins must prove the current password; admins performing a reset are exempt (audited below).
    if (!isAdmin) {
      const row = await env.DB.prepare('SELECT hash FROM users WHERE email = ?1').bind(email).first();
      if (!row || row.hash !== currentPasswordHash) {
        return json({ success: false, message: 'Your current password is incorrect. Verification failed.' }, 403);
      }
    } else {
      const row = await env.DB.prepare('SELECT email FROM users WHERE email = ?1').bind(email).first();
      if (!row) {
        return json({ success: false, message: 'Account not found' }, 404);
      }
    }

    await env.DB.prepare('UPDATE users SET hash = ?1 WHERE email = ?2').bind(passwordHash, email).run();

    try {
      await env.DB.prepare(
        'INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
      ).bind(
        crypto.randomUUID(),
        new Date().toISOString(),
        isAdmin && !isSelf ? 'ADMIN_PASSWORD_RESET' : 'PASSWORD_CHANGE',
        'User Management',
        JSON.stringify({ target: email }),
        caller.email,
        request.headers.get('cf-connecting-ip') || 'unknown'
      ).run();
    } catch {}

    return json({ success: true });
  } catch (err) {
    console.error('[users] Modify-password error:', err);
    return json({ success: false, message: 'Failed to update password. Please try again shortly.' }, 500);
  }
}
