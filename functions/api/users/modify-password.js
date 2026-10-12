import { verifySession } from '../intake/auth';
import { hashNewSecret, verifySecret } from './index.js';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Account-security notice sender (best-effort, never fails the operation).
// No secrets inside — notices describe the event and the appeal path.
async function sendAccountMail(env, to, subject, lines, tag) {
  try {
    const apiKey = env.RESEND_API_KEY;
    if (!apiKey) return false;
    const html = `<h3>${escapeHtml(subject)}</h3>` +
      lines.map((l) => `<p>${l}</p>`).join('') +
      `<p style="font-size: 12px; color: #64748b;"><em>We never ask for passwords by email.</em></p>`;
    const text = `${subject}\n\n` + lines.map((l) => l.replace(/<[^>]+>/g, '')).join('\n');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          from: 'Netamps Portal <no-reply@netamps.in>',
          to,
          subject,
          html,
          text,
          headers: { 'List-Unsubscribe': '<mailto:contact@netamps.com?subject=Unsubscribe>' },
          tags: [{ name: 'kind', value: tag || 'account-notice' }]
        }),
        signal: ctrl.signal
      });
      return res.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

/**
 * POST /api/users/modify-password — password change bound to the caller's session.
 * - Regular callers may change ONLY their own password and must prove the current one.
 * - Admins may reset any account without the current password (audited).
 * No Postgres branch: Workers have no TCP — D1 only.
 */
export async function onRequestPost({ request, env }) {
  // Stage-tagged failures (same diagnostics contract as the OTP module):
  // every 500 carries a `stage` so the next failure names its line instead
  // of ever again producing one opaque banner for five different causes.
  const fail = (stage, errName) =>
    json({ success: false, message: 'Failed to update password. Please try again shortly.', stage, ...(errName ? { err: errName } : {}) }, 500);
  try {
    const caller = await verifySession(env, request).catch(() => null);
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

    // Non-admins must prove the current password; verification handles all
    // stored formats (legacy hex, PBKDF2, Argon2id) — direct string equality
    // used to lock out every migrated user. Admins resetting others are
    // exempt (audited below).
    if (!isAdmin) {
      let row = null;
      try {
        row = await env.DB.prepare('SELECT hash FROM users WHERE email = ?1').bind(email).first();
      } catch {
        return fail('db-read');
      }
      let verified = false;
      try {
        verified = await verifySecret(row && row.hash, currentPasswordHash);
      } catch {
        return fail('verify-kdf');
      }
      if (!row || !verified) {
        return json({ success: false, message: 'Your current password is incorrect. Verification failed.' }, 403);
      }
    } else {
      const row = await env.DB.prepare('SELECT email FROM users WHERE email = ?1').bind(email).first().catch(() => null);
      if (!row) {
        return json({ success: false, message: 'Account not found' }, 404);
      }
    }

    try {
      let newHash;
    try {
      newHash = await hashNewSecret(passwordHash);
    } catch (err) {
      console.error('[users] Modify-password KDF failure:', err && err.message ? err.message : err);
      return fail('hash-kdf', err && err.name ? err.name : typeof err);
    }
    try {
      await env.DB.prepare('UPDATE users SET hash = ?1 WHERE email = ?2').bind(newHash, email).run();
    } catch (err) {
      console.error('[users] Modify-password DB write failure:', err && err.message ? err.message : err);
      return fail('db-write', err && err.name ? err.name : typeof err);
    }
    } catch {
      return fail('db-write');
    }

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

    // Password-change alert to the account holder (breach tripwire: takeover
    // becomes a detection event). Best-effort — never fails the change.
    try {
      await sendAccountMail(env, email,
        'Your Netamps password was changed',
        isAdmin && !isSelf
          ? [`An administrator (${escapeHtml(caller.email)}) reset the password on your account. If you did not request this, contact your administrator immediately.`]
          : [`The password on your account was just changed. If this was not you, contact your administrator immediately.`],
        'password-changed');
    } catch {}

    return json({ success: true });
  } catch (err) {
    console.error('[users] Modify-password error:', err);
    return fail('unhandled');
  }
}
