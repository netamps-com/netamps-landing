import { verifySecret, hashNewSecret } from './index.js';

/**
 * POST /api/users/password-reset { action, ... } — self-service reset links
 * for staff/user accounts (no admin involvement, no current password needed).
 *
 * Industry-standard shape, adapted to this stack:
 *  - request: { email } → ALWAYS responds success (no account enumeration),
 *    but only an existing account gets an email. Per-email + per-IP throttles.
 *  - reset: { token, passwordHash } → validates single-use unexpired token,
 *    sets the KDF secret, marks consumed, audits, notifies the holder.
 *
 * Token: 256-bit random, SHA-256-hashed at rest (raw token never stored),
 * 15-minute TTL, single-use consume. The link carries the raw token:
 * netamps.com/login?reset=TOKEN. Reset links authenticate nothing else —
 * they authorize exactly one password write for exactly one mailbox.
 * Minimum password policy enforced client-side (8+) AND server-side below.
 */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

const EMAIL_RE_RESET = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
const RESET_TTL_MS = 15 * 60 * 1000;
const RESET_RL_WINDOW_MS = 60 * 60 * 1000;
const RESET_RL_PER_EMAIL = 3;
const RESET_RL_PER_IP = 20;
const resetRlMap = new Map();
function resetRateLimited(kind, key, max) {
  if (!key || key === 'unknown') return false;
  const now = Date.now();
  const mapKey = `${kind}:${key}`;
  const record = resetRlMap.get(mapKey);
  if (!record || now - record.windowStart > RESET_RL_WINDOW_MS) {
    resetRlMap.set(mapKey, { windowStart: now, count: 1 });
    return false;
  }
  record.count += 1;
  if (resetRlMap.size > 5000) resetRlMap.clear();
  return record.count > max;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function auditReset(env, event, email, extra) {
  try {
    if (!env.DB || typeof env.DB.prepare !== 'function') return;
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, timestamp TEXT, event_type TEXT, page TEXT, details TEXT, username TEXT, ip_address TEXT)'
    ).run();
    await env.DB.prepare(
      'INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
    ).bind(
      crypto.randomUUID(), new Date().toISOString(), event, 'Password Reset',
      JSON.stringify(extra || {}), String(email || 'unknown').slice(0, 254), 'server'
    ).run();
  } catch {}
}

async function sendResetMail(env, to, link) {
  try {
    const apiKey = env.RESEND_API_KEY;
    if (!apiKey || !EMAIL_RE_RESET.test(to)) return false;
    const html = `<h3>Reset your Netamps password</h3>` +
      `<p>Someone requested a password reset for this mailbox. Set a new password (min 8 characters) within 15 minutes:</p>` +
      `<p><a href="${escapeHtml(link)}">Choose a new password</a></p>` +
      `<p style="font-size: 12px; color: #64748b;"><em>Didn't ask for this? Ignore this email — your password is unchanged. We never ask for passwords by email.</em></p>`;
    const text = `Reset your Netamps password\n\nSomeone requested a password reset for this mailbox (15 minutes, single use):\n${link}\n\nDidn't ask for this? Ignore this email.`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          from: 'Netamps Portal <no-reply@netamps.in>',
          to,
          subject: 'Reset your Netamps password',
          html,
          text,
          headers: { 'List-Unsubscribe': '<mailto:contact@netamps.com?subject=Unsubscribe>' },
          tags: [{ name: 'kind', value: 'password-reset' }]
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

export async function onRequestPost({ request, env }) {
  if (!env.DB || typeof env.DB.prepare !== 'function') {
    return json({ success: false, message: 'Verification store misconfigured.' }, 503);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, message: 'Invalid request body' }, 400);
  }
  const action = body && body.action;
  const ip = request.headers.get('cf-connecting-ip') ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';

  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS password_resets (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        used_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ).run();
  } catch {
    return json({ success: false, message: 'Verification store misconfigured.' }, 503);
  }

  // ── request: always success (enumeration-safe); email only if registered ──
  if (action === 'request') {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!EMAIL_RE_RESET.test(email)) {
      // Indistinguishable from the sent path below (no oracle).
      return json({ success: true, message: 'If this mailbox holds an account, a reset link is on its way.' });
    }
    if (resetRateLimited('email', email, RESET_RL_PER_EMAIL) || resetRateLimited('ip', ip, RESET_RL_PER_IP)) {
      return json({ success: true, message: 'If this mailbox holds an account, a reset link is on its way.' });
    }
    try {
      const row = await env.DB.prepare('SELECT email FROM users WHERE email = ?').bind(email).first();
      if (row) {
        const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
        const id = `rst-${Date.now().toString(36)}`;
        await env.DB.prepare(
          'INSERT INTO password_resets (id, email, token_hash, expires_at) VALUES (?1, ?2, ?3, ?4)'
        ).bind(id, email, await sha256hex(token), new Date(Date.now() + RESET_TTL_MS).toISOString()).run();
        await sendResetMail(env, email, `https://netamps.com/login?reset=${token}`);
        await auditReset(env, 'PASSWORD_RESET_ISSUED', email, { id });
      }
      return json({ success: true, message: 'If this mailbox holds an account, a reset link is on its way.' });
    } catch {
      // Identical response on internal failure — existence must not leak.
      return json({ success: true, message: 'If this mailbox holds an account, a reset link is on its way.' });
    }
  }

  // ── reset: single-use token authorizes one password write for one mailbox ──
  if (action === 'reset') {
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const passwordHash = typeof body.passwordHash === 'string' ? body.passwordHash : '';
    if (!token || token.length > 128 || !/^[0-9a-f]{64}$/i.test(passwordHash)) {
      return json({ success: false, message: 'Invalid or expired reset link.' }, 400);
    }
    const tokenHash = await sha256hex(token);
    const row = await env.DB.prepare('SELECT * FROM password_resets WHERE token_hash = ?').bind(tokenHash).first().catch(() => null);
    const usable = row && !row.used_at && row.expires_at && new Date(row.expires_at).getTime() > Date.now();
    if (!usable) {
      return json({ success: false, message: 'Invalid or expired reset link.' }, 400);
    }
    await env.DB.prepare('UPDATE users SET hash = ? WHERE email = ?').bind(await hashNewSecret(passwordHash), row.email).run();
    await env.DB.prepare('UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE id = ?').bind(row.id).run();
    await auditReset(env, 'PASSWORD_RESET_USED', row.email, { id: row.id });
    // Confirmation (distinct template — never the reset link again).
    try {
      const apiKey = env.RESEND_API_KEY;
      if (apiKey) {
        const html = `<h3>Your Netamps password was reset</h3><p>The password on your account was just changed via a reset link. If this was not you, contact your administrator immediately.</p><p style="font-size: 12px; color: #64748b;"><em>We never ask for passwords by email.</em></p>`;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
              from: 'Netamps Portal <no-reply@netamps.in>',
              to: row.email,
              subject: 'Your Netamps password was reset',
              html,
              text: 'Your Netamps password was reset\n\nThe password on your account was just changed via a reset link. If this was not you, contact your administrator immediately.',
              headers: { 'List-Unsubscribe': '<mailto:contact@netamps.com?subject=Unsubscribe>' },
              tags: [{ name: 'kind', value: 'password-reset-used' }]
            }),
            signal: ctrl.signal
          });
        } finally {
          clearTimeout(timer);
        }
      }
    } catch {}
    return json({ success: true });
  }

  return json({ success: false, message: 'Unknown action.' }, 400);
}
