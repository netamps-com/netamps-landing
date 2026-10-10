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

    // ── Lot breakdown (ported from app/lib/money.ts lotBreakdownOf — keep
    // byte-identical logic; this file cannot import TS. Line totals are
    // qty × base (integers, exact); unsafe results degrade to null. ──
    const bdRows = (Array.isArray(products) ? products : []).map(p => {
      const qty = Number.isInteger(p.quantity) && p.quantity > 0 ? p.quantity : 1;
      const base = asPaiseOrNull(p.basePricePaise);
      let lineTotal = null;
      if (base !== null) {
        const t = qty * base;
        lineTotal = Number.isSafeInteger(t) ? t : null;
      }
      return { qty, basePaise: base, lineTotal, category: p.category, details: p.details };
    });
    const bdStated = bdRows.filter(r => r.lineTotal !== null);
    const bdSum = bdStated.length === 0 ? null : bdStated.reduce((a, r) => a + r.lineTotal, 0);
    const bdVariance = (askTotal === null || bdSum === null) ? null : askTotal - bdSum;
    const bdHasAnyBase = bdRows.some(r => r.basePaise !== null);
    const isLotMode = cons && cons.pricingBasis === 'lot';

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
            <th>Consideration</th>
            <th>Evaluated Price</th>
          </tr>
        </thead>
        <tbody>
          ${(Array.isArray(products) ? products : []).map((p) => `
            <tr>
              <td>${escapeHtml(p.category)} - ${escapeHtml(p.details)}</td>
              <td align="center">${escapeHtml(p.quantity)}</td>
              <td align="right">${askCellOf(p)}</td>
              <td align="right">${fmtPaise(evalUnitOf(p))}</td>
            </tr>
          `).join('') || '<tr><td colspan="4">No products listed.</td></tr>'}
        </tbody>
      </table>
      <p style="font-size: 16px; margin-top: 15px;">
        <strong>Total Asked: ${fmtPaise(askTotal)}</strong>${askPartial ? ' (partial — some lines unstated)' : ''}<br/>
        <strong>Total Evaluated: ${fmtPaise(evalTotal)}</strong>${evalPartial ? ' (partial — some lines unevaluated)' : ''}<br/>
        <strong>Final Agreed Value: ${fp ? `${fmtPaise(fp.totalPaise)} (${escapeHtml(fp.basis)}, v${fp.version})` : '— (awaiting approval snapshot)'}</strong>
      </p>
      ${isLotMode ? `
      <p style="font-size: 14px; margin-top: 15px;"><strong>Lot breakdown</strong></p>
      ${!bdHasAnyBase ? `<p style="font-size: 12px; color: #64748b;">Line breakdown unavailable — captured before per-line pricing.</p>` : `
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 600px;">
        <thead>
          <tr style="background-color: #f8fafc;">
            <th>Product</th>
            <th>Qty × Base</th>
            <th>Line Total</th>
          </tr>
        </thead>
        <tbody>
          ${bdRows.map(r => `
            <tr>
              <td>${escapeHtml(r.category)}${r.details ? ' - ' + escapeHtml(r.details) : ''}</td>
              <td align="center">${r.qty} × ${r.basePaise === null ? '—' : fmtPaise(r.basePaise)}</td>
              <td align="right">${fmtPaise(r.lineTotal)}${r.lineTotal === null && r.basePaise !== null ? ' (unsafe)' : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p style="font-size: 14px; margin-top: 8px;">
        <strong>Sum of lines: ${fmtPaise(bdSum)}</strong>${bdStated.length < bdRows.length ? ' (partial)' : ''}<br/>
        <strong>Variance: ${bdVariance === null ? '—' : bdVariance === 0 ? '✓ Reconciled' : `Differs by ${bdVariance < 0 ? '−' : '+'}${fmtPaise(Math.abs(bdVariance))}`}</strong>
      </p>`}` : ''}
      <p style="font-size: 12px; color: #64748b;">
        <em>* All prices and total values mentioned are exclusive of applicable GST rates.</em>
      </p>
    `;

    const apiKey = env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('[email] RESEND_API_KEY is not configured');
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
        html: htmlContent
      })
    });

    if (!rsRes.ok) {
      console.error('[email] Resend send failed:', rsRes.status, await rsRes.text().catch(() => ''));
      // NOTE: never HTTP 502 — Pages rewrites function 502s into a generic text page.
      return json({ success: false, message: 'Failed to deliver notification email. Please try again shortly.' }, 503);
    }

    return json({ success: true, message: 'Push email sent successfully', emailDeliveryStatus: 'Sent' });
  } catch (err) {
    console.error('[email] Push error:', err);
    return json({ success: false, message: 'Failed to send notification email. Please try again shortly.' }, 500);
  }
}
