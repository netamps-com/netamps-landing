import { verifySession } from '../intake/auth';

/**
 * Submission confirmation mailer + resend endpoint.
 *
 * Ordering guarantee: confirmation sends ONLY for persisted requests —
 * returns.js calls sendConfirmationEmail() after a validated insert, and the
 * resend route loads the stored row by ID. A refused insert (422) can never
 * produce an email (asserted in tests: zero Resend calls).
 *
 * - Best-effort with an 8s cap: mail failure never fails the submission.
 * - Outcome persisted per request (confirmemailstatus/confirmemailat) so the
 *   dashboard badge + resend action always reflect reality, not hope.
 * - Suppression honored (a prior bounce/complaint blocks re-mail).
 * - Per-address hourly cap (isolate-local, documented limitation).
 * - Template renders from STORED rows only; no credentials, OTPs, or links
 *   beyond the tracking page (unphishable-by-construction).
 */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

const EMAIL_RE_CONFIRM = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

const CONFIRM_RL_WINDOW_MS = 60 * 60 * 1000;
const CONFIRM_RL_PER_ADDRESS = 10;
const confirmRlMap = new Map();
function confirmRateLimited(email) {
  const now = Date.now();
  const key = String(email || '').toLowerCase();
  if (!key) return false;
  const record = confirmRlMap.get(key);
  if (!record || now - record.windowStart > CONFIRM_RL_WINDOW_MS) {
    confirmRlMap.set(key, { windowStart: now, count: 1 });
    return false;
  }
  record.count += 1;
  if (confirmRlMap.size > 5000) confirmRlMap.clear();
  return record.count > CONFIRM_RL_PER_ADDRESS;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtmlToText(html) {
  return String(html || '')
    .replace(/<(br|p|div|tr|h[1-6]|li)[^>]*>/gi, '\n')
    .replace(/<\/t[dr]>/gi, '  ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const asPaiseOrNull = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
const fmtPaise = (v) => (v === null || v === undefined)
  ? '—'
  : '₹' + (v / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function askTotalOfStored(req) {
  if (req.pricingBasis === 'lot') return asPaiseOrNull(req.lotConsiderationPaise);
  const lines = Array.isArray(req.products) ? req.products : [];
  let sum = 0;
  let any = false;
  for (const p of lines) {
    const v = asPaiseOrNull(p && p.lineConsiderationPaise);
    if (v === null) continue;
    any = true;
    sum += v;
  }
  return any ? sum : null;
}

function buildConfirmationHtml(req) {
  const ask = askTotalOfStored(req);
  const lines = Array.isArray(req.products) ? req.products : [];
  const rows = lines.map((p) => `
    <tr>
      <td>${escapeHtml(p.category)} - ${escapeHtml(p.details)}</td>
      <td align="center">${escapeHtml(p.quantity)}</td>
      <td align="right">${fmtPaise(asPaiseOrNull(p.basePricePaise))}</td>
      <td align="right">${req.pricingBasis === 'lot' ? '—' : fmtPaise(asPaiseOrNull(p.lineConsiderationPaise))}</td>
    </tr>`).join('') || '<tr><td colspan="4">No products listed.</td></tr>';
  return `
    <h3>Your Netamps request is recorded</h3>
    <p>Hello ${escapeHtml(req.name)},</p>
    <p>Your ${req.intent === 'sell' ? 'SELL' : 'BUY'} request <strong>${escapeHtml(req.id)}</strong> was submitted on ${escapeHtml(req.date)} and is now in our review queue.</p>
    ${req.pricingBasis === 'lot' ? `<p>Lot consideration (whole request): <strong>${fmtPaise(ask)}</strong></p>` : ''}
    <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 600px;">
      <thead>
        <tr style="background-color: #f8fafc;">
          <th>Product</th>
          <th>Qty</th>
          <th>Base Price (Per Unit)</th>
          <th>Line Consideration (Upfront Discount)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size: 16px; margin-top: 15px;"><strong>Total ${req.intent === 'sell' ? 'Asked' : 'Budgeted'}: ${fmtPaise(ask)}</strong></p>
    <p>Track it any time with your tracking ID <strong>${escapeHtml(req.id)}</strong>. Our team reviews every request and will revert with confirmed options; approvals and evaluated prices appear on the tracking page.</p>
    <p style="font-size: 12px; color: #64748b;">
      <em>Security note: we never ask for passwords or OTP codes by email. All prices are exclusive of applicable GST rates.</em>
    </p>`;
}

async function isSuppressed(env, email) {
  try {
    if (!env.DB || typeof env.DB.prepare !== 'function') return false;
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS email_suppressions (email TEXT PRIMARY KEY, reason TEXT, created_at TEXT)'
    ).run();
    const row = await env.DB.prepare('SELECT email FROM email_suppressions WHERE email = ?').bind(String(email).toLowerCase()).first();
    return !!row;
  } catch {
    return false;
  }
}

async function auditConfirm(env, event, requestId, email, extra) {
  try {
    if (!env.DB || typeof env.DB.prepare !== 'function') return;
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, timestamp TEXT, event_type TEXT, page TEXT, details TEXT, username TEXT, ip_address TEXT)'
    ).run();
    await env.DB.prepare(
      'INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
    ).bind(
      crypto.randomUUID(), new Date().toISOString(), event, 'Submission Confirm',
      JSON.stringify({ requestId, ...(extra || {}) }), String(email || 'unknown').slice(0, 254), 'server'
    ).run();
  } catch {}
}

function confirmColumns(env) {
  // Best-effort schema guard (same ALTER pattern as the returns table).
  const stmts = [
    'ALTER TABLE returns ADD COLUMN confirmemailstatus TEXT',
    'ALTER TABLE returns ADD COLUMN confirmemailat TEXT'
  ];
  return (async () => {
    try {
      if (env.DB && typeof env.DB.prepare === 'function') {
        for (const s of stmts) {
          try {
            await env.DB.prepare(s).run();
          } catch {}
        }
      }
    } catch {}
  })();
}

async function persistConfirmStatus(env, requestId, status) {
  try {
    if (env.DB && typeof env.DB.prepare === 'function') {
      await confirmColumns(env);
      await env.DB.prepare('UPDATE returns SET confirmemailstatus = ?, confirmemailat = ? WHERE id = ?')
        .bind(status, new Date().toISOString(), requestId).run();
    } else if (env.DATABASE_URL) {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      try {
        try {
          await client.query('ALTER TABLE returns ADD COLUMN IF NOT EXISTS confirmemailstatus TEXT');
          await client.query('ALTER TABLE returns ADD COLUMN IF NOT EXISTS confirmemailat TEXT');
        } catch {}
        await client.query('UPDATE returns SET confirmemailstatus = $1, confirmemailat = $2 WHERE id = $3', [status, new Date().toISOString(), requestId]);
      } finally {
        await client.end();
      }
    }
  } catch {}
}

// Core sender: stored request in, outcome out. Never throws — callers treat
// any failure as status 'failed', never as a submission failure.
export async function sendConfirmationEmail(env, req) {
  const requestId = req && typeof req.id === 'string' ? req.id : '';
  const email = req && typeof req.email === 'string' ? req.email : '';
  if (!requestId || !EMAIL_RE_CONFIRM.test(email)) {
    return { status: 'failed', error: 'Invalid request identity.' };
  }
  if (confirmRateLimited(email)) {
    await auditConfirm(env, 'CONFIRM_EMAIL_FAILED', requestId, email, { reason: 'rate-limited' });
    await persistConfirmStatus(env, requestId, 'failed');
    return { status: 'failed', error: 'Rate limited.' };
  }
  if (await isSuppressed(env, email)) {
    await auditConfirm(env, 'CONFIRM_EMAIL_FAILED', requestId, email, { reason: 'suppressed' });
    await persistConfirmStatus(env, requestId, 'failed');
    return { status: 'failed', error: 'Recipient suppressed.' };
  }
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[confirm] RESEND_API_KEY is not configured');
    await auditConfirm(env, 'CONFIRM_EMAIL_FAILED', requestId, email, { reason: 'unconfigured' });
    await persistConfirmStatus(env, requestId, 'failed');
    return { status: 'failed', error: 'Email service is not configured.' };
  }
  const html = buildConfirmationHtml(req);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    let rsRes;
    try {
      rsRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          from: 'Netamps Portal <no-reply@netamps.in>',
          to: email,
          subject: `Your Netamps request ${requestId} is recorded`,
          html,
          text: stripHtmlToText(html),
          headers: { 'List-Unsubscribe': '<mailto:contact@netamps.com?subject=Unsubscribe>' },
          tags: [
            { name: 'kind', value: 'confirmation' },
            { name: 'request', value: String(requestId).slice(0, 64) }
          ]
        }),
        signal: ctrl.signal
      });
    } finally {
      clearTimeout(timer);
    }
    if (!rsRes.ok) {
      await auditConfirm(env, 'CONFIRM_EMAIL_FAILED', requestId, email, { reason: `resend-${rsRes.status}` });
      await persistConfirmStatus(env, requestId, 'failed');
      return { status: 'failed', error: 'Delivery failed.' };
    }
    await auditConfirm(env, 'CONFIRM_EMAIL_SENT', requestId, email, {});
    await persistConfirmStatus(env, requestId, 'sent');
    return { status: 'sent' };
  } catch (err) {
    await auditConfirm(env, 'CONFIRM_EMAIL_FAILED', requestId, email, { reason: 'error' });
    await persistConfirmStatus(env, requestId, 'failed');
    return { status: 'failed', error: 'Delivery failed.' };
  }
}

function mapStoredRow(row) {
  // Accepts D1 (camelCase) and PG (lowercase) shapes — see returns.js.
  const g = (camel, lower) => (row[camel] !== undefined ? row[camel] : row[lower]);
  let products = [];
  try {
    products = JSON.parse(g('products', 'products') || '[]');
  } catch {
    products = [];
  }
  if (!Array.isArray(products)) products = [];
  return {
    id: row.id,
    intent: g('intent', 'intent') === 'buy' ? 'buy' : 'sell',
    name: g('name', 'name') || '',
    company: g('company', 'company') || '',
    email: g('email', 'email') || '',
    phone: g('phone', 'phone') || '',
    products,
    pricingBasis: g('pricingBasis', 'pricingbasis') === 'lot' ? 'lot' : 'per_product',
    lotConsiderationPaise: Number.isInteger(g('lotConsiderationPaise', 'lotconsiderationpaise'))
      ? g('lotConsiderationPaise', 'lotconsiderationpaise') : null,
    date: g('date', 'date') || '',
    status: g('status', 'status') || ''
  };
}

async function loadStoredRequest(env, requestId) {
  if (env.DB && typeof env.DB.prepare === 'function') {
    const row = await env.DB.prepare('SELECT * FROM returns WHERE id = ?').bind(requestId).first();
    return row ? mapStoredRow(row) : null;
  }
  if (env.DATABASE_URL) {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: env.DATABASE_URL });
    await client.connect();
    try {
      const res = await client.query('SELECT * FROM returns WHERE id = $1', [requestId]);
      if (res.rows.length === 0) return null;
      return mapStoredRow(res.rows[0]);
    } finally {
      await client.end();
    }
  }
  return null;
}

// POST /api/email/confirm { requestId } — admin resend for failed
// confirmations. Session-gated; renders from the STORED row only.
export async function onRequestPost({ request, env }) {
  try {
    const user = await verifySession(env, request);
    if (!user) {
      return json({ success: false, message: 'Unauthorized' }, 401);
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ success: false, message: 'Invalid request body' }, 400);
    }
    const requestId = body && typeof body.requestId === 'string' ? body.requestId.trim().slice(0, 128) : '';
    if (!requestId) {
      return json({ success: false, message: 'requestId required' }, 400);
    }
    const stored = await loadStoredRequest(env, requestId);
    if (!stored) {
      return json({ success: false, message: 'Request not found.' }, 404);
    }
    const result = await sendConfirmationEmail(env, stored);
    if (result.status !== 'sent') {
      // NOTE: never HTTP 502 — Pages rewrites function 502s into a generic text page.
      return json({ success: false, message: result.error || 'Delivery failed.' }, 503);
    }
    return json({ success: true, message: 'Confirmation email sent.' });
  } catch (err) {
    console.error('[confirm] Resend error:', err);
    return json({ success: false, message: 'Failed to send confirmation email.' }, 500);
  }
}
