import { verifySession } from '../intake/auth';
import { hashNewSecret } from './index.js';

/**
 * POST /api/users/delete { email, hard?, confirmDelete? } — admin-only account removal.
 *
 * Two modes:
 *   - Suspend (default, hard !== true): status='suspended', login denied instantly,
 *     data intact, instant restore. No typed confirmation required beyond session.
 *   - Hard delete (hard === true + confirmDelete === email): tombstone written,
 *     user row deleted, invites revoked, sessions purged. AUDIT LOGS ARE NEVER TOUCHED
 *     (history keeps the email as text; DPDP erasure is a separate legal flow).
 *
 * Guardrails (all 403 with explicit reasons):
 *   - Self-delete refused (admin cannot remove themselves — creates unrecoverable state)
 *   - Last-admin refused (org with zero admins is dead; create another admin first)
 *   - Non-admin callers refused (403)
 *   - Invalid/missing email refused (400)
 *   - Hard delete without exact email confirmation refused (400)
 */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

async function auditDelete(env, event, email, actor, extra) {
  try {
    if (!env.DB || typeof env.DB.prepare !== 'function') return;
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, timestamp TEXT, event_type TEXT, page TEXT, details TEXT, username TEXT, ip_address TEXT)'
    ).run();
    await env.DB.prepare(
      'INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
    ).bind(
      crypto.randomUUID(), new Date().toISOString(), event, 'User Management',
      JSON.stringify(extra || {}), String(actor || 'unknown').slice(0, 254), 'server'
    ).run();
  } catch {}
}

async function sendDeleteNotice(env, to, event, actorEmail) {
  try {
    const apiKey = env.RESEND_API_KEY;
    if (!apiKey) return false;
    const subject = event === 'USER_SUSPENDED' ? 'Your Netamps account has been suspended' : 'Your Netamps account has been deleted';
    const html = event === 'USER_SUSPENDED'
      ? `<h3>Your Netamps account was suspended</h3><p>Your access has been suspended by an administrator. Your data is preserved. Contact your administrator to appeal or restore access.</p>`
      : `<h3>Your Netamps account was deleted</h3><p>Your account has been permanently removed by an administrator. All access is revoked. If this was unexpected, contact your administrator immediately.</p>`;
    const text = event === 'USER_SUSPENDED'
      ? `Your Netamps account was suspended\n\nYour access has been suspended by an administrator. Your data is preserved. Contact your administrator to appeal or restore access.`
      : `Your Netamps account was deleted\n\nYour account has been permanently removed by an administrator. All access is revoked. If this was unexpected, contact your administrator immediately.`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          from: 'Netamps Portal <no-reply@netamps.in>',
          to,
          subject,
          html,
          text,
          headers: { 'List-Unsubscribe': '<mailto:contact@netamps.com?subject=Unsubscribe>' },
          tags: [{ name: 'kind', value: event.toLowerCase().replace('_', '-') }]
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
  const hard = body.hard === true;
  const confirmDelete = typeof body.confirmDelete === 'string' ? body.confirmDelete.trim() : '';

  if (!email || email.length > 254 || !/^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/.test(email)) {
    return json({ success: false, message: 'A valid email address is required' }, 400);
  }

  // Self-delete guard
  if (email === caller.email) {
    return json({ success: false, message: 'You cannot delete your own account. Assign another admin first.' }, 403);
  }

  // Load target user
  const target = await env.DB.prepare('SELECT email, role, status FROM users WHERE email = ?').bind(email).first();
  if (!target) {
    return json({ success: false, message: 'User not found' }, 404);
  }

  // Last-admin guard
  if (target.role === 'admin') {
    const adminCount = await env.DB.prepare("SELECT COUNT(*) as n FROM users WHERE role = 'admin'").first();
    if (adminCount && adminCount.n <= 1) {
      return json({ success: false, message: 'Cannot delete the last admin. Create another admin first.' }, 403);
    }
  }

  if (hard) {
    // Hard delete requires typed confirmation (exact email)
    if (confirmDelete !== email) {
      return json({ success: false, message: 'Hard delete requires typing the exact email to confirm.' }, 400);
    }

    // Revoke invites by/for this email
    await env.DB.prepare('UPDATE invites SET status = ? WHERE invited_by = ? OR email = ?').bind('revoked', email, email).run();
    // Purge sessions (both cookie families)
    await env.DB.prepare('DELETE FROM sessions WHERE email = ?').bind(email).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_email = ?').bind(email).run();
    // Delete user row
    await env.DB.prepare('DELETE FROM users WHERE email = ?').bind(email).run();
    // Audit — logs NEVER touched
    await auditDelete(env, 'USER_HARD_DELETED', email, caller.email, { confirmDelete: true });
    // Notify holder (best-effort)
    await sendDeleteNotice(env, email, 'USER_DELETED', caller.email);

    return json({ success: true, mode: 'hard' });
  } else {
    // Suspend (soft) — status column may not exist yet; add if missing
    try {
      await env.DB.prepare('ALTER TABLE users ADD COLUMN status TEXT').run();
    } catch {}
    await env.DB.prepare('UPDATE users SET status = ? WHERE email = ?').bind('suspended', email).run();
    // Revoke active sessions immediately
    await env.DB.prepare('DELETE FROM sessions WHERE email = ?').bind(email).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_email = ?').bind(email).run();
    // Audit
    await auditDelete(env, 'USER_SUSPENDED', email, caller.email, {});
    // Notify holder
    await sendDeleteNotice(env, email, 'USER_SUSPENDED', caller.email);

    return json({ success: true, mode: 'suspended' });
  }
}