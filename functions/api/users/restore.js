import { verifySession } from '../intake/auth';
import { hashNewSecret } from './index.js';

/**
 * POST /api/users/restore { email } — admin-only restore of suspended account.
 * Flips status back to 'active' (NULL). No password change; holder uses existing secret.
 * Audited as USER_RESTORED.
 */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

async function auditRestore(env, event, email, actor) {
  try {
    if (!env.DB || typeof env.DB.prepare !== 'function') return;
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, timestamp TEXT, event_type TEXT, page TEXT, details TEXT, username TEXT, ip_address TEXT)'
    ).run();
    await env.DB.prepare(
      'INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
    ).bind(
      crypto.randomUUID(), new Date().toISOString(), event, 'User Management',
      JSON.stringify({}), String(actor || 'unknown').slice(0, 254), 'server'
    ).run();
  } catch {}
}

async function sendRestoreNotice(env, to, actorEmail) {
  try {
    const apiKey = env.RESEND_API_KEY;
    if (!apiKey) return false;
    const html = `<h3>Your Netamps account has been restored</h3><p>Your access has been restored by an administrator. You can now sign in with your existing password.</p>`;
    const text = `Your Netamps account has been restored\n\nYour access has been restored by an administrator. You can now sign in with your existing password.`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          from: 'Netamps Portal <no-reply@netamps.in>',
          to,
          subject: 'Your Netamps account has been restored',
          html,
          text,
          headers: { 'List-Unsubscribe': '<mailto:contact@netamps.com?subject=Unsubscribe>' },
          tags: [{ name: 'kind', value: 'user-restored' }]
        }),
        signal: ctrl.signal
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {}
}

export async function onRequestPost({ request, env }) {
  const caller = await verifySession(env, request);
  if (!caller || (caller.role !== 'admin' && caller.email !== 'admin@netamps.com')) {
    return json({ success: false, message: 'Forbidden: admin role required' }, 403);
  }

  if (!env.DB || typeof env.DB.prepare !== 'function') {
    return json({ success: false, message: 'User store unavailable.' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, message: 'Invalid request body' }, 400);
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !/^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/.test(email)) {
    return json({ success: false, message: 'A valid email address is required' }, 400);
  }

  const target = await env.DB.prepare('SELECT email, role, status FROM users WHERE email = ?').bind(email).first();
  if (!target) {
    return json({ success: false, message: 'User not found' }, 404);
  }
  if (target.status !== 'suspended') {
    return json({ success: false, message: 'User is not suspended' }, 400);
  }

  await env.DB.prepare('UPDATE users SET status = NULL WHERE email = ?').bind(email).run();
  await auditRestore(env, 'USER_RESTORED', email, caller.email);
  await sendRestoreNotice(env, email, caller.email);

  return json({ success: true });
}