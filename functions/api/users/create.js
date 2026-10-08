import { verifySession } from '../intake/auth';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
const ALLOWED_ROLES = new Set(['admin', 'staff', 'user']);

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * POST /api/users/create — admin-only user provisioning.
 * Requires a valid admin session; creates staff/user accounts. Never admin-able anonymously.
 */
export async function onRequestPost({ request, env }) {
  try {
    const caller = await verifySession(env, request);
    if (!caller) {
      return json({ success: false, message: 'Unauthorized' }, 401);
    }
    if (caller.role !== 'admin') {
      return json({ success: false, message: 'Forbidden: admin role required' }, 403);
    }

    if (!env.DB || typeof env.DB.prepare !== 'function') {
      return json({ success: false, message: 'User store unavailable. Please try again shortly.' }, 503);
    }

    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const passwordHash = typeof body?.passwordHash === 'string' ? body.passwordHash : '';
    const role = typeof body?.role === 'string' && ALLOWED_ROLES.has(body.role) ? body.role : 'staff';

    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
      return json({ success: false, message: 'A valid email address is required' }, 400);
    }
    if (!passwordHash || passwordHash.length > 512) {
      return json({ success: false, message: 'A password hash is required' }, 400);
    }

    const existing = await env.DB.prepare('SELECT email FROM users WHERE email = ?1').bind(email).first();
    if (existing) {
      return json({ success: false, message: 'An account with this email already exists' }, 409);
    }

    await env.DB.prepare('INSERT INTO users (email, hash, role) VALUES (?1, ?2, ?3)').bind(email, passwordHash, role).run();

    try {
      await env.DB.prepare(
        'INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
      ).bind(
        crypto.randomUUID(),
        new Date().toISOString(),
        'USER_CREATE',
        'User Management',
        JSON.stringify({ created: email, role }),
        caller.email,
        request.headers.get('cf-connecting-ip') || 'unknown'
      ).run();
    } catch {}

    return json({ success: true });
  } catch (err) {
    console.error('[users] Create error:', err);
    return json({ success: false, message: 'Failed to create account. Please try again shortly.' }, 500);
  }
}
