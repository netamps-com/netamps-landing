import { verifySession } from '../intake/auth';
import { hashNewSecret } from './index.js';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
const ALLOWED_ROLES = new Set(['admin', 'staff', 'user']);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Account notice sender (best-effort, never fails provisioning). Secrets are
// never emailed — activation mail points at sign-in, never carries credentials.
async function sendAccountMail(env, to, subject, lines, tag) {
  try {
    const apiKey = env.RESEND_API_KEY;
    if (!apiKey || !EMAIL_RE.test(to)) return false;
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

    // Admin-role grants require the invite flow (dual-approved invite accepted
    // for this email) — direct creation cannot mint admins unilaterally.
    if (role === 'admin') {
      const inv = await env.DB.prepare(
        "SELECT id FROM invites WHERE email = ?1 AND role = 'admin' AND status = 'accepted'"
      ).bind(email).first().catch(() => null);
      if (!inv) {
        return json({ success: false, message: 'Admin accounts require an approved invitation. Invite first, then create.' }, 403);
      }
    }

    // Stage-tagged failures (same diagnostics contract as modify-password):
    // the KDF stage implicates hashing, db-write implicates storage.
    let createdHash;
    try {
      createdHash = await hashNewSecret(passwordHash);
    } catch (err) {
      console.error('[users] Create KDF failure:', err && err.message ? err.message : err);
      return json({ success: false, message: 'Failed to create account. Please try again shortly.', stage: 'hash-kdf', err: err && err.name ? err.name : typeof err }, 500);
    }
    try {
      await env.DB.prepare('INSERT INTO users (email, hash, role) VALUES (?1, ?2, ?3)').bind(email, createdHash, role).run();
    } catch (err) {
      console.error('[users] Create DB write failure:', err && err.message ? err.message : err);
      return json({ success: false, message: 'Failed to create account. Please try again shortly.', stage: 'db-write', err: err && err.name ? err.name : typeof err }, 500);
    }

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

    // Activation notice to the new user (no secrets — password travels a
    // separate channel). Admin-grant peer notices live in the invite accept
    // path (invites.js): direct admin creation is refused without an
    // accepted invite, so that path has no fellow admins to notify that the
    // invite flow hasn't already told.
    try {
      await sendAccountMail(env, email,
        'Your Netamps staff account was created',
        [`An administrator (${escapeHtml(caller.email)}) created your <strong>${escapeHtml(role)}</strong> account.`,
         `Sign in at netamps.com/login with the password shared with you separately, then change it from User Management.`],
        'account-created');
    } catch {}

    return json({ success: true });
  } catch (err) {
    console.error('[users] Create error:', err);
    return json({ success: false, message: 'Failed to create account. Please try again shortly.', stage: 'unhandled' }, 500);
  }
}
