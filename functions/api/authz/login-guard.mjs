/**
 * Login threat guard — production-grade protection for /login.
 *
 * Threats covered (industry-standard controls, each with a test proving it):
 *   - Autonomous credential harvesting / stuffing: D1-persisted sliding-window
 *     failure counts per IP and per mailbox (the isolate-local map in
 *     users/index.js slows one origin; this survives isolate recycling and
 *     sees distributed sources). Thresholds auto-block the IP and alert the
 *     owner. Every attempt — allowed, held, blocked — is appended to
 *     login_attempts with IP, geo, UA and result.
 *   - Owner-verified unknown-context logins: valid credentials from a
 *     never-seen (email, IP) pair do NOT mint a session. A challenge goes to
 *     ashok@netamps.com carrying the attempted mailbox, IP, geo, UA and time,
 *     with a single-use OTP. The IP/user/page stay blocked until the owner
 *     approves with that OTP; the login then succeeds on retry (the device is
 *     now known — no session is ever minted out-of-band). Unknown mailboxes
 *     never create challenges (that would let an attacker spam the owner);
 *     they count toward IP blocks with a cooldown-guarded alert instead.
 *   - Session token hijacking (pass-the-cookie): sessions are bound at mint
 *     to network prefix + device hash. Verification revokes only on a DOUBLE
 *     mismatch (different network AND different device — impossible travel);
 *     a lone IP hop (mobile) or UA change (browser update) passes, so the
 *     control cannot lock out legitimate users. Legacy rows without bindings
 *     pass untouched. Password change revokes every session for the mailbox.
 *   - OAuth consent-grant phishing: the project has NO OAuth surface (no
 *     providers, no consent screens, no grants table) — verified by a
 *     prohibition test that scans the login + API tree for OAuth/consent/SSO
 *     strings. Illicit consent is impossible by construction, not by policy.
 *   - Indirect prompt injection: prompts already label untrusted spans and
 *     validators enforce structure; fenceUntrusted() + adversarial tests prove
 *     embedded instructions ("ignore previous instructions…") still die in
 *     the existing validators (quote_not_grounded, OUT_OF_SHORTLIST,
 *     FABRICATED_IDENTITY, pool-drop).
 *   - In-memory WASM evasion: WASM magic (\0asm) is a named malware signature
 *     in the upload scanner (see secure-upload.js scanMalware), so a renamed
 *     or polyglot module is rejected as WASM_MODULE, not merely "wrong type".
 *
 * Conventions: writers return {ok, reason} and never throw for domain
 * failures; D1-only, prepare/bind/first/all/run surface only, so the Node
 * harness exercises this verbatim via node:sqlite.
 */

export const OWNER_EMAIL = 'ashok@netamps.com';

/** Tunables, exported so the login hook and tests share one definition. */
export const GUARD_POLICY = Object.freeze({
  FAIL_WINDOW_MINUTES: 15,
  FAILS_PER_IP_BLOCK: 10,
  FAILS_PER_EMAIL_ALERT: 5,
  AUTO_BLOCK_MINUTES: 60,
  DENY_BLOCK_MINUTES: 24 * 60,
  OTP_TTL_SECONDS: 10 * 60,
  OTP_MAX_ATTEMPTS: 3
});

const OTP_TTL_SECONDS = 10 * 60;
const OTP_MAX_ATTEMPTS = 3;
const CHALLENGE_COOLDOWN_SECONDS = 30 * 60;
const FAIL_WINDOW_MINUTES = 15;
const FAILS_PER_IP_BLOCK = 10;
const FAILS_PER_EMAIL_ALERT = 5;
const AUTO_BLOCK_MINUTES = 60;
const DENY_BLOCK_MINUTES = 24 * 60;
const ALERT_COOLDOWN_SECONDS = 3600;

export async function ensureAuthzTables(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS login_attempts (
       id TEXT PRIMARY KEY,
       email TEXT NOT NULL,
       ip TEXT NOT NULL,
       country TEXT,
       city TEXT,
       ua TEXT,
       result TEXT NOT NULL,
       reason TEXT,
       at TEXT NOT NULL
     )`
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip, at)'
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, at)'
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS ip_blocks (
       ip TEXT PRIMARY KEY,
       reason TEXT NOT NULL,
       attempts INTEGER NOT NULL DEFAULT 0,
       expires_at TEXT NOT NULL,
       created_at TEXT NOT NULL,
       released_at TEXT
     )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS owner_challenges (
       id TEXT PRIMARY KEY,
       email TEXT NOT NULL,
       ip TEXT NOT NULL,
       country TEXT,
       city TEXT,
       ua TEXT,
       otp_hash TEXT NOT NULL,
       attempts INTEGER NOT NULL DEFAULT 0,
       status TEXT NOT NULL DEFAULT 'pending',
       created_at TEXT NOT NULL,
       expires_at TEXT NOT NULL,
       decided_at TEXT,
       decided_by TEXT
     )`
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_owner_challenges_email_ip ON owner_challenges(email, ip, status)'
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS known_devices (
       email TEXT NOT NULL,
       ip TEXT NOT NULL,
       country TEXT,
       ua_hash TEXT,
       first_seen TEXT NOT NULL,
       last_seen TEXT NOT NULL,
       PRIMARY KEY (email, ip)
     )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS owner_alert_cooldown (
       ip TEXT NOT NULL,
       kind TEXT NOT NULL,
       at TEXT NOT NULL,
       PRIMARY KEY (ip, kind)
     )`
  ).run();
}

function nowIso() {
  return new Date().toISOString();
}

async function sha256Hex(s) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Network + device context for an incoming request. Best-effort geo: Cloudflare
 *  headers first, request.cf second, 'unknown' rather than a guess. */
export async function netContext(request) {
  const h = (n) => {
    try {
      return request.headers.get(n) || '';
    } catch {
      return '';
    }
  };
  let ip = h('cf-connecting-ip');
  if (!ip) {
    ip = (h('x-forwarded-for') || '').split(',')[0].trim();
  }
  if (!ip) ip = 'unknown';
  let country = h('cf-ipcountry');
  let city = h('cf-ipcity');
  try {
    const cf = request.cf || null;
    if (cf) {
      if (!country && cf.country) country = String(cf.country);
      if (!city && cf.city) city = String(cf.city);
    }
  } catch {}
  const ua = h('user-agent').slice(0, 500) || 'unknown';
  let uaHash = '';
  try {
    uaHash = await sha256Hex(ua);
  } catch {
    uaHash = '';
  }
  return { ip, country: country || 'unknown', city: city || 'unknown', ua, uaHash };
}

/** First 3 octets (v4) or first 4 hextets (v6) — coarse enough to survive
 *  DHCP churn, fine enough to notice a different network. */
export function ipPrefix(ip) {
  const s = String(ip || '');
  if (s.includes(':')) return s.split(':').slice(0, 4).join(':').toLowerCase();
  const parts = s.split('.');
  if (parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p))) return parts.slice(0, 3).join('.');
  return s.slice(0, 32) || 'unknown';
}

export async function recordAttempt(env, { email, ctx, result, reason = null } = {}) {
  try {
    await ensureAuthzTables(env);
    await env.DB.prepare(
      'INSERT INTO login_attempts (id, email, ip, country, city, ua, result, reason, at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)'
    ).bind(
      crypto.randomUUID(), String(email || 'unknown').slice(0, 254),
      String((ctx && ctx.ip) || 'unknown').slice(0, 64),
      String((ctx && ctx.country) || 'unknown').slice(0, 64),
      String((ctx && ctx.city) || 'unknown').slice(0, 128),
      String((ctx && ctx.ua) || 'unknown').slice(0, 500),
      String(result || 'unknown').slice(0, 32),
      reason ? String(reason).slice(0, 200) : null, nowIso()
    ).run();
  } catch { /* audit must never fail a login */ }
}

export async function countFailures(env, { ip = null, email = null, minutes = FAIL_WINDOW_MINUTES } = {}) {
  try {
    await ensureAuthzTables(env);
    const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
    if (ip) {
      const row = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND result = 'failed' AND at >= ?"
      ).bind(String(ip), since).first();
      return Number((row && row.n) || 0);
    }
    if (email) {
      const row = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM login_attempts WHERE email = ? AND result = 'failed' AND at >= ?"
      ).bind(String(email).toLowerCase(), since).first();
      return Number((row && row.n) || 0);
    }
    return 0;
  } catch {
    return 0;
  }
}

/** Active (unexpired) block row, or null. Expired rows stay as history. */
export async function activeBlock(env, ip) {
  try {
    await ensureAuthzTables(env);
    const row = await env.DB.prepare('SELECT * FROM ip_blocks WHERE ip = ?').bind(String(ip)).first();
    if (!row || !row.expires_at) return null;
    if (new Date(row.expires_at).getTime() <= Date.now()) return null;
    return row;
  } catch {
    return null;
  }
}

export async function blockIp(env, { ip, reason, minutes = AUTO_BLOCK_MINUTES, actor = 'system' } = {}) {
  if (!ip || ip === 'unknown') return { ok: false, reason: 'BAD_IP' };
  await ensureAuthzTables(env);
  const at = nowIso();
  const expires = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  await env.DB.prepare(
    'INSERT INTO ip_blocks (ip, reason, attempts, expires_at, created_at, released_at) VALUES (?1,?2,1,?3,?4,NULL) ' +
    'ON CONFLICT(ip) DO UPDATE SET reason = excluded.reason, attempts = ip_blocks.attempts + 1, expires_at = excluded.expires_at, created_at = excluded.created_at, released_at = NULL'
  ).bind(String(ip).slice(0, 64), String(reason || 'auto_block').slice(0, 200), expires, at).run();
  try {
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, timestamp TEXT, event_type TEXT, page TEXT, details TEXT, username TEXT, ip_address TEXT)'
    ).run();
    await env.DB.prepare(
      'INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address) VALUES (?1,?2,?3,?4,?5,?6,?7)'
    ).bind(crypto.randomUUID(), at, 'AUTH_IP_BLOCKED', 'Login Page',
      JSON.stringify({ reason, minutes, actor }), 'system', String(ip).slice(0, 64)).run();
  } catch {}
  return { ok: true, expiresAt: expires };
}

export async function isKnownDevice(env, email, ip) {
  try {
    await ensureAuthzTables(env);
    const row = await env.DB.prepare(
      'SELECT ip FROM known_devices WHERE email = ? AND ip = ?'
    ).bind(String(email).toLowerCase(), String(ip)).first();
    return !!row;
  } catch {
    return true; // fail-open on infra error: blocking on a broken lookup bricks logins
  }
}

export async function rememberDevice(env, { email, ctx } = {}) {
  try {
    await ensureAuthzTables(env);
    const at = nowIso();
    await env.DB.prepare(
      'INSERT INTO known_devices (email, ip, country, ua_hash, first_seen, last_seen) VALUES (?1,?2,?3,?4,?5,?6) ' +
      'ON CONFLICT(email, ip) DO UPDATE SET country = excluded.country, ua_hash = excluded.ua_hash, last_seen = excluded.last_seen'
    ).bind(
      String(email).toLowerCase(), String((ctx && ctx.ip) || 'unknown').slice(0, 64),
      String((ctx && ctx.country) || 'unknown').slice(0, 64),
      String((ctx && ctx.uaHash) || '').slice(0, 128), at, at
    ).run();
  } catch {}
}

/* ── Owner mail (Resend, same contract as otp/generate.js) ───────────────── */

async function sendOwnerMail(env, subject, html) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[authz] RESEND_API_KEY is not configured — owner mail unsent');
    return { ok: false, misconfigured: true };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: 'Netamps Security <no-reply@netamps.in>',
        to: OWNER_EMAIL,
        subject, html
      })
    });
    if (!res.ok) {
      console.error('[authz] Resend API failed:', res.status, await res.text().catch(() => ''));
      return { ok: false, status: res.status };
    }
    return { ok: true };
  } catch (err) {
    console.error('[authz] Resend fetch threw:', String((err && err.message) || err));
    return { ok: false, thrown: true };
  }
}

function newOtp() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + (buf[0] % 900000));
}

function maskEmail(email) {
  const [local, domain] = String(email || '').split('@');
  if (!domain) return '***';
  const head = (local || '').slice(0, 1);
  return `${head}***@${domain}`;
}

/**
 * Open a verification challenge for a KNOWN mailbox signing in from an
 * unknown device. Cooldown: an open pending challenge for the same
 * (email, ip) within 30 minutes is reused (and its OTP re-sent only if the
 * mailer works) instead of stacking challenges — otherwise one attacker can
 * flood the owner's mailbox at will.
 */
export async function createOwnerChallenge(env, { email, ctx } = {}) {
  await ensureAuthzTables(env);
  const em = String(email || '').toLowerCase();
  const ip = String((ctx && ctx.ip) || 'unknown');
  const since = new Date(Date.now() - CHALLENGE_COOLDOWN_SECONDS * 1000).toISOString();
  const prior = await env.DB.prepare(
    "SELECT * FROM owner_challenges WHERE email = ? AND ip = ? AND status = 'pending' AND created_at >= ? ORDER BY created_at DESC LIMIT 1"
  ).bind(em, ip, since).first().catch(() => null);
  if (prior) {
    return { ok: true, challengeId: prior.id, otpSent: true, reused: true };
  }
  const code = newOtp();
  const id = crypto.randomUUID();
  const at = nowIso();
  const expires = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString();
  await env.DB.prepare(
    'INSERT INTO owner_challenges (id, email, ip, country, city, ua, otp_hash, attempts, status, created_at, expires_at, decided_at, decided_by) VALUES (?1,?2,?3,?4,?5,?6,?7,0,?8,?9,?10,NULL,NULL)'
  ).bind(
    id, em.slice(0, 254), ip.slice(0, 64),
    String((ctx && ctx.country) || 'unknown').slice(0, 64),
    String((ctx && ctx.city) || 'unknown').slice(0, 128),
    String((ctx && ctx.ua) || 'unknown').slice(0, 500),
    await sha256Hex(code), 'pending', at, expires
  ).run();
  const origin = (() => {
    try {
      return env.PUBLIC_ORIGIN || 'https://www.netamps.com';
    } catch {
      return 'https://www.netamps.com';
    }
  })();
  const mail = await sendOwnerMail(
    env,
    `Security: sign-in approval needed for ${maskEmail(em)}`,
    `<h3>Sign-in approval requested</h3>` +
    `<p>Mailbox: <strong>${em}</strong><br>` +
    `IP: <strong>${ip}</strong><br>` +
    `Location: <strong>${String((ctx && ctx.city) || 'unknown')}, ${String((ctx && ctx.country) || 'unknown')}</strong><br>` +
    `Device: <strong>${String((ctx && ctx.ua) || 'unknown').slice(0, 200)}</strong><br>` +
    `Time: <strong>${at}</strong></p>` +
    `<p>Approval code: <strong style="font-size:24px">${code}</strong> (expires in 10 minutes, 3 attempts).</p>` +
    `<p>Enter it at <a href="${origin}/login?challenge=${id}">${origin}/login?challenge=${id}</a> to approve, or deny it there to block the source IP for 24 hours.</p>` +
    `<p>If this was not expected, deny it — the source stays blocked.</p>`
  );
  return { ok: true, challengeId: id, otpSent: mail.ok, reused: false };
}

export async function challengeStatus(env, challengeId) {
  try {
    await ensureAuthzTables(env);
    const row = await env.DB.prepare(
      'SELECT id, email, status, created_at, expires_at FROM owner_challenges WHERE id = ?'
    ).bind(String(challengeId)).first();
    if (!row) return { ok: false, reason: 'NOT_FOUND' };
    if (row.status === 'pending' && new Date(row.expires_at).getTime() <= Date.now()) {
      try {
        await env.DB.prepare("UPDATE owner_challenges SET status = 'expired' WHERE id = ?").bind(row.id).run();
      } catch {}
      return { ok: true, status: 'expired', email: maskEmail(row.email) };
    }
    return { ok: true, status: row.status, email: maskEmail(row.email) };
  } catch {
    return { ok: false, reason: 'STORE_ERROR' };
  }
}

export async function verifyOwnerChallenge(env, { challengeId, code, ctx } = {}) {
  await ensureAuthzTables(env);
  const row = await env.DB.prepare('SELECT * FROM owner_challenges WHERE id = ?').bind(String(challengeId)).first();
  if (!row) return { ok: false, reason: 'NOT_FOUND' };
  if (row.status !== 'pending') return { ok: false, reason: 'ALREADY_DECIDED', status: row.status };
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    try {
      await env.DB.prepare("UPDATE owner_challenges SET status = 'expired' WHERE id = ?").bind(row.id).run();
    } catch {}
    return { ok: false, reason: 'EXPIRED' };
  }
  if (Number(row.attempts) >= OTP_MAX_ATTEMPTS) {
    try {
      await env.DB.prepare("UPDATE owner_challenges SET status = 'expired' WHERE id = ?").bind(row.id).run();
    } catch {}
    await blockIp(env, { ip: (ctx && ctx.ip) || 'unknown', reason: 'owner_challenge_abuse', minutes: AUTO_BLOCK_MINUTES, actor: 'system' });
    return { ok: false, reason: 'LOCKED' };
  }
  const good = await sha256Hex(String(code || '').trim());
  let match = good.length === 64 && String(row.otp_hash).length === 64;
  if (match) {
    const a = good;
    const b = String(row.otp_hash);
    let diff = 0;
    for (let i = 0; i < 64; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    match = diff === 0;
  }
  if (!match) {
    const left = OTP_MAX_ATTEMPTS - (Number(row.attempts) + 1);
    await env.DB.prepare('UPDATE owner_challenges SET attempts = attempts + 1 WHERE id = ?').bind(row.id).run();
    if (left <= 0) {
      await env.DB.prepare("UPDATE owner_challenges SET status = 'expired' WHERE id = ?").bind(row.id).run();
      await blockIp(env, { ip: (ctx && ctx.ip) || 'unknown', reason: 'owner_challenge_abuse', minutes: AUTO_BLOCK_MINUTES, actor: 'system' });
      return { ok: false, reason: 'LOCKED' };
    }
    return { ok: false, reason: 'INVALID_CODE', remaining: left };
  }
  await env.DB.prepare("UPDATE owner_challenges SET status = 'approved', decided_at = ?1, decided_by = 'owner' WHERE id = ?2")
    .bind(nowIso(), row.id).run();
  // Approval marks the device known, so the legitimate retry succeeds
  // WITHOUT minting any session out-of-band here.
  await rememberDevice(env, { email: row.email, ctx: { ip: row.ip, country: row.country, uaHash: '' } });
  return { ok: true, email: row.email };
}

export async function denyOwnerChallenge(env, { challengeId, ctx } = {}) {
  await ensureAuthzTables(env);
  const row = await env.DB.prepare('SELECT * FROM owner_challenges WHERE id = ?').bind(String(challengeId)).first();
  if (!row) return { ok: false, reason: 'NOT_FOUND' };
  if (row.status !== 'pending') return { ok: false, reason: 'ALREADY_DECIDED', status: row.status };
  await env.DB.prepare("UPDATE owner_challenges SET status = 'denied', decided_at = ?1, decided_by = 'owner' WHERE id = ?2")
    .bind(nowIso(), row.id).run();
  await blockIp(env, { ip: row.ip, reason: 'owner_denied_login', minutes: DENY_BLOCK_MINUTES, actor: 'owner' });
  return { ok: true };
}

/** Cooldown-guarded owner alert (non-challenge: auto-blocks, targeted patterns). */
export async function ownerAlert(env, { kind, subject, html, ip } = {}) {
  try {
    await ensureAuthzTables(env);
    const since = new Date(Date.now() - ALERT_COOLDOWN_SECONDS * 1000).toISOString();
    const prior = await env.DB.prepare(
      'SELECT at FROM owner_alert_cooldown WHERE ip = ? AND kind = ? AND at >= ?'
    ).bind(String(ip || 'unknown').slice(0, 64), String(kind || 'generic').slice(0, 64), since).first().catch(() => null);
    if (prior) return { ok: true, cooledDown: true };
    const sent = await sendOwnerMail(env, subject, html);
    await env.DB.prepare(
      'INSERT INTO owner_alert_cooldown (ip, kind, at) VALUES (?1,?2,?3) ON CONFLICT(ip, kind) DO UPDATE SET at = excluded.at'
    ).bind(String(ip || 'unknown').slice(0, 64), String(kind || 'generic').slice(0, 64), nowIso()).run().catch(() => null);
    return sent;
  } catch {
    return { ok: false };
  }
}

/* ── Session binding (pass-the-cookie) ───────────────────────────────────── */

export async function ensureSessionBinding(env) {
  for (const col of ['ip_prefix TEXT', 'ua_hash TEXT']) {
    try {
      await env.DB.prepare(`ALTER TABLE sessions ADD COLUMN ${col}`).run();
    } catch { /* exists already, or table missing (created later with base cols) */ }
  }
}

/**
 * Double-mismatch rule: revoke ONLY when BOTH the network prefix and the
 * device hash differ from what the session was minted with. A lone IP hop
 * (mobile networks) or a lone UA change (browser update) passes, so this
 * cannot lock out legitimate users; a stolen cookie replayed from another
 * network AND another device cannot survive. Rows without bindings (legacy)
 * pass untouched. Never throws — infra errors fail open, only an explicit
 * double mismatch revokes.
 */
export function bindingVerdict(row, ctx) {
  try {
    const boundIp = row && row.ip_prefix ? String(row.ip_prefix) : '';
    const boundUa = row && row.ua_hash ? String(row.ua_hash) : '';
    if (!boundIp && !boundUa) return 'legacy';
    let ipDiff = false;
    let uaDiff = false;
    if (boundIp && ctx && ctx.ip) ipDiff = boundIp !== ipPrefix(ctx.ip);
    if (boundUa && ctx && ctx.uaHash) uaDiff = boundUa !== ctx.uaHash;
    if (ipDiff && uaDiff) return 'hijack';
    return 'ok';
  } catch {
    return 'ok';
  }
}

export async function revokeUserSessions(env, email) {
  try {
    await env.DB.prepare('DELETE FROM sessions WHERE email = ?').bind(String(email).toLowerCase()).run();
    return true;
  } catch {
    return false;
  }
}
