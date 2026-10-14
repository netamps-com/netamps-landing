/**
 * POST /api/email/push
 *
 * Order-status notification email. Workers-compatible:
 *  - Delivery via Resend REST API (https://api.resend.com/emails) using the
 *    RESEND_API_KEY secret. Plain fetch only — no SDK dependency.
 *    The old nodemailer/SMTP branch could never work from Workers (no TCP)
 *    and the env-password scavenger risked grabbing the wrong secret — both removed.
 *  - All interpolated values are HTML-escaped (request/product data is user input).
 *
 * NOTE: Sender domain netamps.in is verified in Resend. FROM uses
 * 'Netamps Portal <no-reply@netamps.in>' — do not revert to the
 * onboarding@resend.dev test sender (it only delivers to the account owner).
 */

import { logOrderEmail } from '../audit/order-emails.mjs';

function json(body, status = 200) {
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

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

// ── Deliverability + anti-abuse controls (spam handling) ──
// Every send below carries: List-Unsubscribe (mailto, known contact address),
// a text part (spam-score hygiene), Resend tags for webhook correlation.
// Per-recipient rate caps stop reputation burn via automation (isolate-local,
// same posture as the login throttle — distributed floods need KV limits).
// Suppression (hard bounces/complaints recorded by /api/email/events) is
// checked pre-send: re-mailing the dead burns the domain for everyone.
const PUSH_RL_WINDOW_MS = 60 * 60 * 1000;
const PUSH_RL_PER_RECIPIENT = 5;
const pushRlMap = new Map();
function pushRateLimited(email) {
  const now = Date.now();
  const key = String(email || '').toLowerCase();
  if (!key) return false;
  const record = pushRlMap.get(key);
  if (!record || now - record.windowStart > PUSH_RL_WINDOW_MS) {
    pushRlMap.set(key, { windowStart: now, count: 1 });
    return false;
  }
  record.count += 1;
  if (pushRlMap.size > 5000) pushRlMap.clear();
  return record.count > PUSH_RL_PER_RECIPIENT;
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

export async function onRequestPost({ request, env }) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ success: false, message: 'Invalid request body' }, 400);
    }

    const { email, requestId, products, intent, consideration, askTotalPaise, finalPrice } = body;
    if (!email || typeof email !== 'string' || email.length > 254 || !EMAIL_RE.test(email) || !requestId) {
      return json({ success: false, message: 'Email and requestId required' }, 400);
    }

    // Abuse brake first: >5 pushes/hour to one address is automation, not ops.
    if (pushRateLimited(email)) {
      return json({ success: false, message: 'Too many notifications for this address. Try again later.' }, 429);
    }
    // Suppression brake: never re-mail a hard bounce or complaint.
    if (await isSuppressed(env, email)) {
      console.error('[email] Suppressed recipient refused:', email);
      return json({ success: false, message: 'Notifications to this address are paused (delivery failures on record).' }, 403);
    }

    // ── Paise-integer money math (null = unstated, never 0) ──
    const asPaiseOrNull = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
    const fmtPaise = (v) => (v === null || v === undefined)
      ? '—'
      : '₹' + (v / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const evalUnitOf = (p) => {
      if (Number.isInteger(p.pricePaise) && p.pricePaise >= 0) return p.pricePaise;
      const legacy = Number(p.price);
      if (!Number.isFinite(legacy) || legacy < 0) return null;
      return Math.round(legacy * 100);
    };

    // ── Ask total: re-derived server-side from the consideration block.
    // A client-claimed askTotalPaise that disagrees is refused (fail-closed).
    const cons = consideration && typeof consideration === 'object' ? consideration : null;
    let askTotal = null;
    let askPartial = false;
    if (cons && cons.pricingBasis === 'lot') {
      askTotal = asPaiseOrNull(cons.lotConsiderationPaise);
    } else {
      const byId = new Map();
      if (cons && Array.isArray(cons.lines)) {
        for (const l of cons.lines) {
          if (l && typeof l.productId === 'string') byId.set(l.productId, asPaiseOrNull(l.lineConsiderationPaise));
        }
      }
      const list = Array.isArray(products) ? products : [];
      let sum = 0, anyStated = false, anyUnstated = false;
      for (const p of list) {
        const v = byId.has(p.id) ? byId.get(p.id) : asPaiseOrNull(p.lineConsiderationPaise);
        if (v === null) { anyUnstated = true; } else { anyStated = true; sum += v; }
      }
      askTotal = anyStated ? sum : null;
      askPartial = anyStated && anyUnstated;
    }
    if (askTotalPaise !== null && askTotalPaise !== undefined) {
      if (!Number.isInteger(askTotalPaise) || askTotalPaise < 0 || askTotalPaise !== askTotal) {
        console.error('[email] Ask-total mismatch: claimed', askTotalPaise, 'recomputed', askTotal);
        return json({ success: false, message: 'Consideration figures do not reconcile. Email refused — please re-open the request and retry.' }, 422);
      }
    }

    // ── Evaluated total (per-unit × qty, existing semantics, now paise) ──
    const evalLines = (Array.isArray(products) ? products : []).map(p => {
      const unit = evalUnitOf(p);
      return unit === null ? null : unit * (Number(p.quantity) || 1);
    });
    const evalTotal = evalLines.every(v => v === null) ? null : evalLines.reduce((a, v) => a + (v ?? 0), 0);
    const evalPartial = evalTotal !== null && evalLines.some(v => v === null);

    // ── Final: the transmitted snapshot wins; never a live recompute ──
    const fp = finalPrice && typeof finalPrice === 'object' &&
      Number.isInteger(finalPrice.version) && finalPrice.version >= 1 &&
      Number.isInteger(finalPrice.totalPaise) && finalPrice.totalPaise >= 0 &&
      ['evaluated', 'consideration', 'negotiated'].includes(finalPrice.basis)
      ? finalPrice : null;

    const safeRequestId = escapeHtml(requestId);
    const safeIntent = intent === 'sell' ? 'SELL' : 'BUY';
    const askCellOf = (p) => {
      if (cons && cons.pricingBasis === 'lot') return '—';
      const byIdV = cons && Array.isArray(cons.lines)
        ? (() => { const f = cons.lines.find(l => l && l.productId === p.id); return f ? asPaiseOrNull(f.lineConsiderationPaise) : undefined; })()
        : undefined;
      const v = byIdV !== undefined ? byIdV : asPaiseOrNull(p.lineConsiderationPaise);
      return fmtPaise(v);
    };
    const baseCellOf = (p) => fmtPaise(asPaiseOrNull(p.basePricePaise));

    // ── Per-line final (ported from app/lib/money.ts lineFinalOf — keep
    // byte-identical logic; this file cannot import TS. qty × base, exact;
    // unsafe results degrade to null. ──
    const lineFinalOfEmail = (qtyRaw, base) => {
      const qty = Number.isInteger(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
      if (base === null || base === undefined) return null;
      const t = qty * base;
      return Number.isSafeInteger(t) ? t : null;
    };

    const htmlContent = `
      <h3>Netamps Request Notification</h3>
      <p>Hello,</p>
      <p>Your ${safeIntent} request <strong>${safeRequestId}</strong> has been updated.</p>
      ${cons && cons.pricingBasis === 'lot' ? `<p>Lot consideration (whole request): <strong>${fmtPaise(askTotal)}</strong></p>` : ''}
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 600px;">
        <thead>
          <tr style="background-color: #f8fafc;">
            <th>Product</th>
            <th>Qty</th>
            <th>Base Price (Per Unit)</th>
            <th>Line Consideration (Upfront Discount)</th>
            <th>Line Final</th>
            <th>Evaluated (Per Unit)</th>
          </tr>
        </thead>
        <tbody>
          ${(Array.isArray(products) ? products : []).map((p) => `
            <tr>
              <td>${escapeHtml(p.category)} - ${escapeHtml(p.details)}</td>
              <td align="center">${escapeHtml(p.quantity)}</td>
              <td align="right">${baseCellOf(p)}</td>
              <td align="right">${askCellOf(p)}</td>
              <td align="right">${fmtPaise(lineFinalOfEmail(p.quantity, asPaiseOrNull(p.basePricePaise)))}</td>
              <td align="right">${fmtPaise(evalUnitOf(p))}</td>
            </tr>
          `).join('') || '<tr><td colspan="6">No products listed.</td></tr>'}
        </tbody>
      </table>
      <p style="font-size: 16px; margin-top: 15px;">
        <strong>Total Asked: ${fmtPaise(askTotal)}</strong>${askPartial ? ' (partial — some lines unstated)' : ''}<br/>
        <strong>Total Evaluated: ${fmtPaise(evalTotal)}</strong>${evalPartial ? ' (partial — some lines unevaluated)' : ''}<br/>
        <strong>Final Agreed Value: ${fp ? `${fmtPaise(fp.totalPaise)} (${escapeHtml(fp.basis)}, v${fp.version})` : '— (awaiting approval snapshot)'}</strong>
      </p>
      <p style="font-size: 12px; color: #64748b;">
        <em>* All prices and total values mentioned are exclusive of applicable GST rates.</em>
      </p>
    `;

    const apiKey = env.RESEND_API_KEY;
    const ledger = (outcome, detail, messageId = null) => logOrderEmail(env, {
      // Raw id, not the HTML-escaped display copy: this is a foreign key back
      // to the order row, and escaping it would silently break the join.
      requestId,
      intent: safeIntent.toLowerCase(),
      cause: 'staff_notification',
      outcome,
      recipient: email,
      subject: `Update on Request ${safeRequestId}`,
      messageId,
      detail
    });
    if (!apiKey) {
      console.error('[email] RESEND_API_KEY is not configured');
      await ledger('failed', 'email service not configured');
      return json({ success: false, message: 'Email service is not configured. Please contact support.' }, 503);
    }

    const rsRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: 'Netamps Portal <no-reply@netamps.in>',
        to: email,
        subject: `Update on Request ${safeRequestId}`,
        html: htmlContent,
        text: stripHtmlToText(htmlContent),
        headers: {
          // List-Unsubscribe (mailto fallback — no HTTPS endpoint exists, so
          // no One-Click header; the contact address below is real).
          'List-Unsubscribe': '<mailto:contact@netamps.com?subject=Unsubscribe>'
        },
        // Tags echo back in webhooks (/api/email/events) to close the loop
        // from accepted → delivered/bounced per request.
        tags: [
          { name: 'kind', value: 'owner-push' },
          { name: 'request', value: String(requestId).slice(0, 64) }
        ]
      })
    });

    if (!rsRes.ok) {
      console.error('[email] Resend send failed:', rsRes.status, await rsRes.text().catch(() => ''));
      await ledger('failed', `provider rejected the send (HTTP ${rsRes.status})`);
      // NOTE: never HTTP 502 — Pages rewrites function 502s into a generic text page.
      return json({ success: false, message: 'Failed to deliver notification email. Please try again shortly.' }, 503);
    }

    let providerId = null;
    try {
      const body = await rsRes.json();
      providerId = body && typeof body.id === 'string' ? body.id : null;
    } catch { /* unparseable body does not negate an accepted send */ }
    await ledger('sent', 'accepted by provider', providerId);

    return json({ success: true, message: 'Push email sent successfully', emailDeliveryStatus: 'Sent' });
  } catch (err) {
    console.error('[email] Push error:', err);
    return json({ success: false, message: 'Failed to send notification email. Please try again shortly.' }, 500);
  }
}
