/**
 * POST /api/email/escalate
 *
 * Confirmed-match escalation to Sales. Dedicated endpoint (separate from the
 * owner-notification /api/email/push) so the sales template, recipient, and
 * audit semantics never mix with per-request status mail.
 *
 * - Recipient is hardcoded server-side (SALES_ESCALATION_EMAIL). The client
 *   never passes a recipient, so this endpoint cannot be used as an open relay.
 * - Delivery via Resend REST API using the RESEND_API_KEY secret. Plain fetch
 *   only — no SDK dependency.
 * - All interpolated values are HTML-escaped (request/product data is user input).
 * - Money is integer paise end-to-end; null means unstated, never zero.
 * - Fail-closed: 400 validation, 422 irreconcilable figures, 503 delivery/config.
 *   NOTE: never HTTP 502 — Pages rewrites function 502s into a generic text page.
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

// Fixed escalation mailbox. Not client-controlled.
const SALES_ESCALATION_EMAIL = 'sales@netamps.in';

// Deliverability + anti-abuse: per-recipient hourly cap (the fixed recipient
// makes this a global escalation cap), text part, tags for webhook
// correlation. No suppression check here — the recipient is internal and
// constant; suppressing it would silently kill the sales handoff.
const ESC_RL_WINDOW_MS = 60 * 60 * 1000;
const ESC_RL_MAX = 20;
const escRlMap = new Map();
function escRateLimited() {
  const now = Date.now();
  const record = escRlMap.get(SALES_ESCALATION_EMAIL);
  if (!record || now - record.windowStart > ESC_RL_WINDOW_MS) {
    escRlMap.set(SALES_ESCALATION_EMAIL, { windowStart: now, count: 1 });
    return false;
  }
  record.count += 1;
  return record.count > ESC_RL_MAX;
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
const fmtSignedPaise = (v) => {
  if (v === null || v === undefined) return '—';
  const sign = v > 0 ? '+' : '';
  return sign + fmtPaise(v);
};

export async function onRequestPost({ request, env }) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ success: false, message: 'Invalid request body' }, 400);
    }

    const {
      matchId,
      buyerRequestId,
      sellerRequestId,
      productName,
      modelNumber,
      buyer,
      seller,
      buyerLineAskPaise,
      sellerLineAskPaise,
      buyerOrderAskPaise,
      sellerOrderAskPaise,
      sellerOtherLines,
      buyerOtherLines,
      operator
    } = body || {};

    // ── Identity gate: escalation without traceable IDs is refused ──
    for (const [label, v] of [['matchId', matchId], ['buyerRequestId', buyerRequestId], ['sellerRequestId', sellerRequestId]]) {
      if (!v || typeof v !== 'string' || v.length > 128) {
        return json({ success: false, message: `Escalation refused: ${label} is required.` }, 400);
      }
    }
    for (const [label, party] of [['buyer', buyer], ['seller', seller]]) {
      if (!party || typeof party !== 'object') return json({ success: false, message: `Escalation refused: ${label} block is required.` }, 400);
      if (!party.email || typeof party.email !== 'string' || !EMAIL_RE.test(party.email)) {
        return json({ success: false, message: `Escalation refused: ${label} email is invalid.` }, 400);
      }
    }

    const bLine = asPaiseOrNull(buyerLineAskPaise);
    const sLine = asPaiseOrNull(sellerLineAskPaise);
    const bOrder = asPaiseOrNull(buyerOrderAskPaise);
    const sOrder = asPaiseOrNull(sellerOrderAskPaise);
    // A claimed figure that is neither a paise integer nor null/undefined is refused.
    for (const [label, raw, parsed] of [
      ['buyerLineAskPaise', buyerLineAskPaise, bLine],
      ['sellerLineAskPaise', sellerLineAskPaise, sLine],
      ['buyerOrderAskPaise', buyerOrderAskPaise, bOrder],
      ['sellerOrderAskPaise', sellerOrderAskPaise, sOrder]
    ]) {
      if (raw !== null && raw !== undefined && parsed === null) {
        return json({ success: false, message: `Escalation refused: ${label} must be integer paise or null.` }, 422);
      }
    }
    const lineDelta = (bLine !== null && sLine !== null) ? sLine - bLine : null;
    const spreadPct = (lineDelta !== null && bLine > 0)
      ? `${lineDelta >= 0 ? '+' : ''}${((lineDelta / bLine) * 100).toFixed(1)}%`
      : '—';

    const safeMatchId = escapeHtml(matchId);
    const safeBuyerId = escapeHtml(buyerRequestId);
    const safeSellerId = escapeHtml(sellerRequestId);
    const safeProduct = escapeHtml(productName);
    const safeModel = escapeHtml(modelNumber);
    const safeOperator = escapeHtml(operator || 'Unknown');

    const htmlContent = `
      <h3>Netamps Match Escalation — Ready for Fulfillment</h3>
      <p>A buy/sell match was confirmed in the Intake Workbench and escalated for further processing.</p>
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 640px;">
        <tbody>
          <tr><td><strong>Match ID</strong></td><td>${safeMatchId}</td></tr>
          <tr><td><strong>Buyer Request ID</strong></td><td>${safeBuyerId}</td></tr>
          <tr><td><strong>Seller Request ID</strong></td><td>${safeSellerId}</td></tr>
          <tr><td><strong>Product</strong></td><td>${safeProduct} — ${safeModel}</td></tr>
          <tr><td><strong>Buyer</strong></td><td>${escapeHtml(buyer.name)} (${escapeHtml(buyer.email)}), Qty ${escapeHtml(buyer.quantity)}</td></tr>
          <tr><td><strong>Seller</strong></td><td>${escapeHtml(seller.name)} (${escapeHtml(seller.email)}), Qty ${escapeHtml(seller.quantity)}</td></tr>
        </tbody>
      </table>
      <p style="font-size: 16px; margin-top: 15px;">
        <strong>Matched-line ask — Buyer: ${fmtPaise(bLine)} · Seller: ${fmtPaise(sLine)}</strong><br/>
        <strong>Line delta (seller − buyer): ${fmtSignedPaise(lineDelta)} (${escapeHtml(spreadPct)} vs buyer)</strong><br/>
        Order context — Buyer: ${fmtPaise(bOrder)}${buyerOtherLines > 0 ? ` (includes ${escapeHtml(buyerOtherLines)} other line(s))` : ''} ·
        Seller: ${fmtPaise(sOrder)}${sellerOtherLines > 0 ? ` (includes ${escapeHtml(sellerOtherLines)} other line(s))` : ''}
      </p>
      <p>Escalated by: <strong>${safeOperator}</strong> at ${escapeHtml(new Date().toISOString())}</p>
      <p style="font-size: 12px; color: #64748b;">
        <em>* All prices and total values mentioned are exclusive of applicable GST rates.</em>
      </p>
    `;

    const apiKey = env.RESEND_API_KEY;
    // One escalation touches two orders — the BUY side and the SELL side — so
    // it is recorded against BOTH ledgers. Showing it on neither (the old
    // behaviour) hides a real trigger; showing it on only one would tell a
    // half-truth about an event that involves both.
    const ledger = (outcome, detail, messageId = null) => Promise.all([
      logOrderEmail(env, { requestId: buyerRequestId, intent: 'buy', cause: 'escalation', outcome, recipient: SALES_ESCALATION_EMAIL, subject: `Match Escalation ${matchId}`, messageId, detail }),
      logOrderEmail(env, { requestId: sellerRequestId, intent: 'sell', cause: 'escalation', outcome, recipient: SALES_ESCALATION_EMAIL, subject: `Match Escalation ${matchId}`, messageId, detail })
    ]);
    if (!apiKey) {
      console.error('[escalate] RESEND_API_KEY is not configured');
      await ledger('failed', 'email service not configured');
      return json({ success: false, message: 'Email service is not configured. Please contact support.' }, 503);
    }

    if (escRateLimited()) {
      await ledger('failed', 'escalation rate limit reached');
      return json({ success: false, message: 'Too many escalations right now. Try again shortly.' }, 429);
    }

    const rsRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: 'Netamps Portal <no-reply@netamps.in>',
        to: SALES_ESCALATION_EMAIL,
        subject: `Match Escalation ${safeMatchId}: ${safeProduct} ${safeModel} (Buy ${safeBuyerId} / Sell ${safeSellerId})`,
        html: htmlContent,
        text: stripHtmlToText(htmlContent),
        headers: {
          'List-Unsubscribe': '<mailto:contact@netamps.com?subject=Unsubscribe>'
        },
        tags: [
          { name: 'kind', value: 'escalation' },
          { name: 'match', value: String(matchId).slice(0, 64) },
          // Correlate the delivery webhook back to both order ledgers.
          { name: 'request', value: String(buyerRequestId).slice(0, 64) },
          { name: 'seller_request', value: String(sellerRequestId).slice(0, 64) }
        ]
      })
    });

    if (!rsRes.ok) {
      console.error('[escalate] Resend send failed:', rsRes.status, await rsRes.text().catch(() => ''));
      await ledger('failed', `provider rejected the send (HTTP ${rsRes.status})`);
      return json({ success: false, message: 'Failed to deliver escalation email. Please try again shortly.' }, 503);
    }

    let providerId = null;
    try {
      const body = await rsRes.json();
      providerId = body && typeof body.id === 'string' ? body.id : null;
    } catch { /* unparseable body does not negate an accepted send */ }
    await ledger('sent', 'accepted by provider', providerId);

    return json({ success: true, message: 'Escalation email sent to Sales', emailDeliveryStatus: 'Sent' });
  } catch (err) {
    console.error('[escalate] Escalation error:', err);
    return json({ success: false, message: 'Failed to send escalation email. Please try again shortly.' }, 500);
  }
}
