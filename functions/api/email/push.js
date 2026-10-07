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

    const { email, requestId, products, intent } = body;
    if (!email || typeof email !== 'string' || email.length > 254 || !EMAIL_RE.test(email) || !requestId) {
      return json({ success: false, message: 'Email and requestId required' }, 400);
    }

    let totalValue = 0;
    if (products && Array.isArray(products)) {
      products.forEach((p) => {
        totalValue += (Number(p.price) || 0) * (Number(p.quantity) || 1);
      });
    }

    const formattedTotal = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(totalValue);

    const safeRequestId = escapeHtml(requestId);
    const safeIntent = intent === 'sell' ? 'SELL' : 'BUY';

    const htmlContent = `
      <h3>Netamps Request Notification</h3>
      <p>Hello,</p>
      <p>Your ${safeIntent} request <strong>${safeRequestId}</strong> has been updated.</p>
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 600px;">
        <thead>
          <tr style="background-color: #f8fafc;">
            <th>Product</th>
            <th>Qty</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>
          ${products?.map((p) => `
            <tr>
              <td>${escapeHtml(p.category)} - ${escapeHtml(p.details)}</td>
              <td align="center">${escapeHtml(p.quantity)}</td>
              <td align="right">${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(p.price) || 0)}</td>
            </tr>
          `).join('') || '<tr><td colspan="3">No products listed.</td></tr>'}
        </tbody>
      </table>
      <p style="font-size: 16px; margin-top: 15px;">
        <strong>Total Value: ${formattedTotal}</strong>
      </p>
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
      return json({ success: false, message: 'Failed to deliver notification email. Please try again shortly.' }, 502);
    }

    return json({ success: true, message: 'Push email sent successfully', emailDeliveryStatus: 'Sent' });
  } catch (err) {
    console.error('[email] Push error:', err);
    return json({ success: false, message: 'Failed to send notification email. Please try again shortly.' }, 500);
  }
}
