import { verifySession } from './intake/auth';
import { hashNewSecret } from './users/index.js';

/**
 * POST /api/invites { action, ... } — invite-only staff provisioning.
 *
 * No self-registration exists: accounts are created either by admin-approved
 * invite acceptance or (legacy) the admin-gated users/add path. Roles come
 * from the stored invite, never from client claims.
 *
 * Actions (all JSON):
 *  - create  (admin): { email, role } → { id, inviteLink }. role=admin
 *    invites start as pending-second-approval (separation of duties).
 *  - approve (admin): { id } → approves a pending admin invite. The approver
 *    must differ from the inviter — self-approval is structurally refused.
 *  - accept  (public): { token, passwordHash } → activates the account.
 *    The token IS the mailbox proof (256-bit, email-bound, expiring,
 *    single-use) — equivalent assurance to an OTP to that mailbox, so no
 *    second ceremony. Unknown and expired tokens deny identically (410/404
 *    collapsed to one message — no enumeration oracle).
 *  - revoke  (admin): { id } → revokes a pending/approved invite + notice.
 *  - list    (admin): pending/approved invites (token hashes never leave).
 *
 * Intimations (best-effort Resend, same hygiene as other senders: text part,
 * tags, 8s cap): issued → invitee; accepted → invitee + inviting admin;
 * revoked → invitee with reason. Expiry reminders/digests need a scheduler
 * (no cron on Pages Functions) and are explicitly deferred, not silently
 * missing.
 */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

const INVITE_TTL_MS = 48 * 3600 * 1000;
const EMAIL_RE_INVITE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
const VALID_ROLES = new Set(['staff', 'admin']);

async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function ensureInvitesTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      invited_by TEXT NOT NULL,
      approved_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      accepted_at DATETIME,
      email_status TEXT,
      email_sent_at DATETIME
    )`
  ).run();
  // Backward-compatible columns for pre-existing tables (activation truth).
  try { await env.DB.prepare('ALTER TABLE invites ADD COLUMN email_status TEXT').run(); } catch {}
  try { await env.DB.prepare('ALTER TABLE invites ADD COLUMN email_sent_at DATETIME').run(); } catch {}
}

async function auditInvite(env, event, invite, actor) {
  try {
    if (!env.DB || typeof env.DB.prepare !== 'function') return;
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, timestamp TEXT, event_type TEXT, page TEXT, details TEXT, username TEXT, ip_address TEXT)'
    ).run();
    await env.DB.prepare(
      'INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
    ).bind(
      crypto.randomUUID(), new Date().toISOString(), event, 'Invite Console',
      JSON.stringify({ id: invite && invite.id, email: invite && invite.email, role: invite && invite.role, status: invite && invite.status }),
      String(actor || 'unknown').slice(0, 254), 'server'
    ).run();
  } catch {}
}

async function sendInviteMail(env, to, subject, lines, tag, inviteId) {
  try {
    const apiKey = env.RESEND_API_KEY;
    if (!apiKey || !EMAIL_RE_INVITE.test(to)) return false;
    const html = `<h3>${escapeHtml(subject)}</h3>` +
      lines.map((l) => `<p>${l}</p>`).join('') +
      `<p style="font-size: 12px; color: #64748b;"><em>Security note: this link expires in 48 hours, works once, and is bound to ${escapeHtml(to)}. We never ask for passwords by email.</em></p>`;
    const text = `${subject}\n\n` + lines.map((l) => l.replace(/<[^>]+>/g, '')).join('\n');
    // Correlation tag: lets /api/email/events flip this invite's email_status
    // on delivered/bounced (activation truth). Absent on old sends — harmless.
    const tags = [{ name: 'kind', value: tag || 'invite' }];
    if (inviteId) tags.push({ name: 'invite', value: String(inviteId).slice(0, 64) });
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
          tags
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

// Server-derived activation truth (keeps the console dumb): 'completed' only
// when the holder accepted; everything else is 'not-completed' with the
// actionable reason. Read-only — never mutates expiry here.
function activationOf(inv) {
  if (inv.status === 'accepted') return { activation: 'completed', detail: 'activated' };
  if (inv.status === 'revoked') return { activation: 'not-completed', detail: 'revoked' };
  if (inv.status === 'expired' || (inv.expires_at && new Date(inv.expires_at).getTime() <= Date.now())) {
    return { activation: 'not-completed', detail: 'expired' };
  }
  if (inv.email_status === 'bounced') return { activation: 'not-completed', detail: 'email-bounced' };
  if (inv.email_status === 'failed') return { activation: 'not-completed', detail: 'email-failed' };
  if (inv.status === 'pending-second') return { activation: 'not-completed', detail: 'pending-approval' };
  return { activation: 'not-completed', detail: 'awaiting-user' };
}

async function requireAdmin(env, request) {
  try {
    const user = await verifySession(env, request);
    if (user && (user.role === 'admin' || user.email === 'admin@netamps.com')) return user;
  } catch {}
  return null;
}

async function getInvite(env, id) {
  const row = await env.DB.prepare('SELECT * FROM invites WHERE id = ?').bind(id).first();
  return row || null;
}

// Normalize legacy 'pending' status (pre-rename schema default) to 'pending-second'.
// Any row inserted before the rename carries 'pending', which the app never wrote —
// leaving it unnormalized makes the Approve button unreachable and the row
// invisible to the Active filter.
function normalizeStatus(row) {
  if (!row) return row;
  if (row.status === 'pending') row.status = 'pending-second';
  return row;
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

  try {
    await ensureInvitesTable(env);
  } catch {
    return json({ success: false, message: 'Verification store misconfigured.' }, 503);
  }

  // ── create (admin) ──
  if (action === 'create') {
    const admin = await requireAdmin(env, request);
    if (!admin) return json({ success: false, message: 'Forbidden' }, 403);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const role = typeof body.role === 'string' ? body.role.trim().toLowerCase() : '';
    if (!EMAIL_RE_INVITE.test(email)) return json({ success: false, message: 'A valid email is required.' }, 400);
    if (!VALID_ROLES.has(role)) return json({ success: false, message: 'Role must be staff or admin.' }, 400);
    const existing = await env.DB.prepare('SELECT email FROM users WHERE email = ?').bind(email).first().catch(() => null);
    if (existing) return json({ success: false, message: 'An account with this email already exists — no invite needed.' }, 409);
    // Duplicate-create guard: one mailbox ⇒ one live row, or the console
    // binary can disagree with itself (accepted twin + pending twin for the
    // same address). Re-send via Resend (rotation) instead of re-creating.
    const liveTwin = await env.DB.prepare(
      "SELECT id FROM invites WHERE email = ? AND status IN ('pending-second','approved') ORDER BY created_at DESC LIMIT 1"
    ).bind(email).first().catch(() => null);
    if (liveTwin) {
      return json({ success: false, message: 'An active invitation already exists for this mailbox — use Resend on the existing row instead.', code: 'DUPLICATE_INVITE', inviteId: liveTwin.id }, 409);
    }
    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
    const id = `inv-${Date.now().toString(36)}`;
    const needsSecond = role === 'admin';
    await env.DB.prepare(
      'INSERT INTO invites (id, email, role, token_hash, status, invited_by, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
    ).bind(id, email, role, await sha256hex(token), needsSecond ? 'pending-second' : 'approved', admin.email, new Date(Date.now() + INVITE_TTL_MS).toISOString()).run();
    const invite = { id, email, role, status: needsSecond ? 'pending-second' : 'approved' };
    await auditInvite(env, 'INVITE_CREATED', invite, admin.email);
    const link = `https://netamps.com/login?invite=${token}`;
    const mailed = await sendInviteMail(env, email, 'Your Netamps staff invitation',
      [`You've been invited to join Netamps as <strong>${escapeHtml(role)}</strong>. Your account <strong>'${escapeHtml(email)}'</strong> will activate on acceptance.`,
       `Accept within 48 hours: <a href="${escapeHtml(link)}">accept invitation</a>.`,
       needsSecond ? 'Admin-role grants additionally require a second admin approval before activation.' : 'No further approval needed — your account activates on acceptance.'], 'invite-issued', id);
    // Persist the send outcome (activation truth starts here — a refused send
    // must never look identical to a delivered one in the console).
    try {
      await env.DB.prepare('UPDATE invites SET email_status = ?, email_sent_at = ? WHERE id = ?')
        .bind(mailed ? 'sent' : 'failed', new Date().toISOString(), id).run();
    } catch {}
    return json({ success: true, id, inviteLink: link, needsSecondApproval: needsSecond, emailSent: mailed });
  }

  // ── approve (admin, second pair of eyes for admin grants) ──
  if (action === 'approve') {
    const admin = await requireAdmin(env, request);
    if (!admin) return json({ success: false, message: 'Forbidden' }, 403);
    const id = typeof body.id === 'string' ? body.id.slice(0, 64) : '';
    const invite = id ? await getInvite(env, id) : null;
    if (!invite || invite.status !== 'pending-second') {
      return json({ success: false, message: 'Invite is not awaiting approval.' }, 400);
    }
    if (invite.invited_by === admin.email) {
      // Bootstrap exception: separation of duties needs TWO admins to exist.
      // A single-admin organization would otherwise deadlock permanently
      // (nobody else can ever approve). Allowed only when no other admin
      // account exists, and audit-flagged as bootstrap.
      let otherAdmins = 0;
      try {
        const found = await env.DB.prepare("SELECT email FROM users WHERE role = 'admin'").all();
        otherAdmins = ((found && found.results) || []).filter((r) => r.email && r.email !== admin.email).length;
      } catch {}
      if (otherAdmins > 0) {
        return json({ success: false, message: 'Separation of duties: a different admin must approve.' }, 403);
      }
      await env.DB.prepare('UPDATE invites SET status = ?, approved_by = ? WHERE id = ?').bind('approved', admin.email + ' (bootstrap self-approval: sole admin)', id).run();
      await auditInvite(env, 'INVITE_APPROVED', { ...invite, status: 'approved', bootstrap: true }, admin.email);
      return json({ success: true, bootstrap: true });
    }
    await env.DB.prepare('UPDATE invites SET status = ?, approved_by = ? WHERE id = ?').bind('approved', admin.email, id).run();
    await auditInvite(env, 'INVITE_APPROVED', { ...invite, status: 'approved' }, admin.email);
    return json({ success: true });
  }

  // ── accept (public, token-bound) ──
  if (action === 'accept') {
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const passwordHash = typeof body.passwordHash === 'string' ? body.passwordHash : '';
    if (!token || token.length > 128 || !/^[0-9a-f]{64}$/i.test(passwordHash)) {
      return json({ success: false, message: 'Invalid invitation.' }, 404);
    }
    const tokenHash = await sha256hex(token);
    const invite = normalizeStatus(await env.DB.prepare('SELECT * FROM invites WHERE token_hash = ?').bind(tokenHash).first().catch(() => null));
    // Unknown, expired, revoked, already-used deny IDENTICALLY — no
    // enumeration oracle. One deliberate exception below: a VALID token for
    // a not-yet-approved invite reveals only "waiting for approval" — the
    // holder already possesses the 256-bit secret, so nothing new leaks,
    // and it ends the exact confusion in the field (genuine link, dead end).
    const now = Date.now();
    const usable = invite && invite.status === 'approved' && invite.expires_at && new Date(invite.expires_at).getTime() > now;
    if (!usable) {
      if (invite && invite.expires_at && new Date(invite.expires_at).getTime() <= now && invite.status !== 'accepted') {
        try {
          await env.DB.prepare('UPDATE invites SET status = ? WHERE id = ?').bind('expired', invite.id).run();
          await auditInvite(env, 'INVITE_EXPIRED', invite, 'system');
        } catch {}
      } else if (invite && invite.status === 'pending-second' && invite.expires_at && new Date(invite.expires_at).getTime() > now) {
        return json({ success: false, message: 'This invitation is waiting for admin approval.', code: 'PENDING_APPROVAL' }, 403);
      }
      return json({ success: false, message: 'Invalid invitation.' }, 404);
    }
    const taken = await env.DB.prepare('SELECT email FROM users WHERE email = ?').bind(invite.email).first().catch(() => null);
    if (taken) {
      return json({ success: false, message: 'An account with this email already exists — sign in instead.' }, 409);
    }
    await env.DB.prepare('INSERT INTO users (email, hash, role) VALUES (?, ?, ?)').bind(invite.email, await hashNewSecret(passwordHash), invite.role).run();
    await env.DB.prepare('UPDATE invites SET status = ?, accepted_at = CURRENT_TIMESTAMP WHERE id = ?').bind('accepted', invite.id).run();
    await auditInvite(env, 'INVITE_ACCEPTED', { ...invite, status: 'accepted' }, invite.email);
    // Holder confirmation: the password was set inside the accept form — no
    // second secret-by-mail channel is ever opened. The reset pointer below
    // reuses the existing single-use reset flow (mirrors the login notice).
    await sendInviteMail(env, invite.email, 'Your Netamps account is active',
      [`Your <strong>${escapeHtml(invite.role)}</strong> account <strong>'${escapeHtml(invite.email)}'</strong> is now active. You set your password during acceptance — sign in at netamps.com/login.`,
       `If this was not you, use <strong>Locked out? Email me a reset link</strong> on the login page immediately.`], 'invite-accepted', invite.id);
    // Acceptance fan-out (approval-aware): inviter always learns; the
    // approver learns when one exists (dual-control outcome visibility);
    // admin grants additionally notify every fellow admin. Recipient list is
    // audited as INVITE_ACCEPT_NOTIFIED so the fan-out itself is provable.
    // Role language only in templates — identities stay in the audit log.
    const notified = [];
    if (invite.invited_by && EMAIL_RE_INVITE.test(invite.invited_by)) {
      await sendInviteMail(env, invite.invited_by, 'Invitation accepted',
        [`${escapeHtml(invite.email)} accepted the invitation (${escapeHtml(invite.role)}).`], 'invite-accepted-admin', invite.id);
      notified.push(invite.invited_by);
    }
    if (invite.approved_by && EMAIL_RE_INVITE.test(invite.approved_by) && !notified.includes(invite.approved_by)) {
      await sendInviteMail(env, invite.approved_by, 'Approved invitation accepted',
        [`${escapeHtml(invite.email)} accepted the invitation you approved (${escapeHtml(invite.role)}).`], 'invite-accepted-admin', invite.id);
      notified.push(invite.approved_by);
    }
    // Admin grants notify FELLOW admins too (dual-control visibility): the
    // direct-create path cannot mint admins, so this is the only birthplace
    // of admin accounts — every peer learns here.
    if (invite.role === 'admin') {
      try {
        const peers = await env.DB.prepare("SELECT email FROM users WHERE role = 'admin'").all();
        for (const row of (peers && peers.results) || []) {
          if (row.email && row.email !== invite.email && EMAIL_RE_INVITE.test(row.email) && !notified.includes(row.email)) {
            await sendInviteMail(env, row.email, `Admin account activated: ${invite.email}`,
              [`${escapeHtml(invite.email)} activated an <strong>admin</strong> account. Review in User Management if unexpected.`], 'admin-grant-notice', invite.id);
            notified.push(row.email);
          }
        }
      } catch {}
    }
    await auditInvite(env, 'INVITE_ACCEPT_NOTIFIED', { ...invite, status: 'accepted', notified }, invite.email);
    return json({ success: true });
  }

  // ── revoke (admin) ──
  if (action === 'revoke') {
    const admin = await requireAdmin(env, request);
    if (!admin) return json({ success: false, message: 'Forbidden' }, 403);
    const id = typeof body.id === 'string' ? body.id.slice(0, 64) : '';
    const invite = id ? await getInvite(env, id) : null;
    if (!invite || (invite.status !== 'pending-second' && invite.status !== 'approved')) {
      return json({ success: false, message: 'Invite cannot be revoked in its current state.' }, 400);
    }
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 280) : 'not stated';
    await env.DB.prepare('UPDATE invites SET status = ? WHERE id = ?').bind('revoked', id).run();
    await auditInvite(env, 'INVITE_REVOKED', { ...invite, status: 'revoked' }, admin.email);
    await sendInviteMail(env, invite.email, 'Your Netamps invitation was withdrawn',
      [`Your pending invitation was withdrawn. Reason: ${escapeHtml(reason)}. Contact your administrator to appeal.`], 'invite-revoked', id);
    return json({ success: true });
  }

  // ── dedupe (admin): collapse duplicate live invites per mailbox ──
  // Legacy twins (created before the duplicate-create guard by re-inviting
  // instead of resending) make the console binary disagree with itself.
  // Keeps the newest live row, revokes the rest. Audited per revoked row.
  if (action === 'dedupe') {
    const admin = await requireAdmin(env, request);
    if (!admin) return json({ success: false, message: 'Forbidden' }, 403);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!EMAIL_RE_INVITE.test(email)) return json({ success: false, message: 'A valid email is required.' }, 400);
    const { results } = await env.DB.prepare(
      "SELECT * FROM invites WHERE email = ? AND status IN ('pending-second','approved') ORDER BY created_at DESC"
    ).bind(email).all().catch(() => ({ results: [] }));
    const rows = results || [];
    if (rows.length <= 1) {
      return json({ success: true, kept: rows.length === 1 ? rows[0].id : null, revoked: [] });
    }
    const revoked = [];
    for (const twin of rows.slice(1)) {
      await env.DB.prepare('UPDATE invites SET status = ? WHERE id = ?').bind('revoked', twin.id).run();
      await auditInvite(env, 'INVITE_REVOKED', { ...twin, status: 'revoked', reason: 'duplicate pruned' }, admin.email);
      revoked.push(twin.id);
    }
    return json({ success: true, kept: rows[0].id, revoked });
  }

  // ── resend (admin): rotate token + fresh 48h window + re-mail ──
  // The raw token is never stored, so a resend cannot replay the old link —
  // it mints a new one (the previous link dies with the rotated hash).
  // Status is preserved: pending-second stays pending (approval is never
  // bypassed by re-sending). Audited as INVITE_RESENT.
  if (action === 'resend') {
    const admin = await requireAdmin(env, request);
    if (!admin) return json({ success: false, message: 'Forbidden' }, 403);
    const id = typeof body.id === 'string' ? body.id.slice(0, 64) : '';
    const invite = id ? await getInvite(env, id) : null;
    if (!invite || (invite.status !== 'pending-second' && invite.status !== 'approved')) {
      return json({ success: false, message: 'Invite cannot be re-sent in its current state.' }, 400);
    }
    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
    const link = `https://netamps.com/login?invite=${token}`;
    await env.DB.prepare('UPDATE invites SET token_hash = ?, expires_at = ? WHERE id = ?')
      .bind(await sha256hex(token), new Date(Date.now() + INVITE_TTL_MS).toISOString(), id).run();
    const mailed = await sendInviteMail(env, invite.email, 'Your Netamps staff invitation (re-sent)',
      [`You've been invited to join Netamps as <strong>${escapeHtml(invite.role)}</strong>. Your account <strong>'${escapeHtml(invite.email)}'</strong> will activate on acceptance.`,
       `This is a fresh link — any previous invitation link no longer works. Accept within 48 hours: <a href="${escapeHtml(link)}">accept invitation</a>.`,
       invite.role === 'admin' ? 'Admin-role grants additionally require a second admin approval before activation.' : 'No further approval needed — your account activates on acceptance.'], 'invite-issued', id);
    try {
      await env.DB.prepare('UPDATE invites SET email_status = ?, email_sent_at = ? WHERE id = ?')
        .bind(mailed ? 'sent' : 'failed', new Date().toISOString(), id).run();
    } catch {}
    await auditInvite(env, 'INVITE_RESENT', { ...invite }, admin.email);
    return json({ success: true, id, inviteLink: link, emailSent: mailed });
  }

  // ── list (admin; token hashes never leave). ?status= narrows the
  // lifecycle view (default: actionable pending + approved). Accepted and
  // expired rows power the done/pending/expired indicators in the console.
  if (action === 'list') {
    const admin = await requireAdmin(env, request);
    if (!admin) return json({ success: false, message: 'Forbidden' }, 403);
    const allowed = new Set(['pending-second', 'approved', 'accepted', 'expired', 'revoked']);
    const wanted = typeof body.status === 'string' && body.status !== '' ? body.status : '';
    const states = wanted === 'all'
      ? ['pending-second', 'approved', 'accepted', 'expired', 'revoked']
      : allowed.has(wanted) ? [wanted] : ['pending-second', 'approved'];
    const placeholders = states.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT id, email, role, status, invited_by, approved_by, created_at, expires_at, accepted_at, email_status, email_sent_at FROM invites WHERE status IN (${placeholders}) ORDER BY created_at DESC`
    ).bind(...states).all();
    // Server-derived activation truth per row (console renders it verbatim).
    // Normalize legacy 'pending' → 'pending-second' so the Approve button
    // remains reachable for pre-rename rows.
    const invites = (results || []).map((inv) => ({ ...normalizeStatus(inv), ...activationOf(inv) }));
    return json({ success: true, invites });
  }

  return json({ success: false, message: 'Unknown action.' }, 400);
}
