/**
 * POST /api/track/verify-otp
 *
 * Step 2 of buyer verification — EMAIL ONLY.
 *
 * On a correct code (verified FIRST, so the brute-force budget is spent even
 * for addresses with no requests), mints a short-lived EMAIL-scoped token
 * (60 min) and returns EVERY successfully-created request filed under that
 * address. The buyer then chooses which one to negotiate.
 *
 * The token is not a login session and grants nothing else: every subsequent
 * read re-checks that the requested order belongs to this email.
 */

import { listOrdersByEmail, dbReady, mintBuyerToken, ensureNegotiationSchema } from '../negotiate/store.mjs';
import { verifyTrackOtp } from './otp.mjs';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
const CODE_RE = /^[0-9]{6}$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

/** One message, one status — for a wrong code and for an address with nothing on file. */
const GENERIC_FAIL = 'Invalid or expired code. Please request a new one.';

/** The buyer-visible projection of their own order — never the whole row. */
export function publicOrder(order) {
  if (!order) return null;
  return {
    id: order.id,
    intent: order.intent,
    name: order.name,
    company: order.company,
    date: order.date,
    status: order.status,
    products: order.products,
    pricingBasis: order.pricingBasis,
    lotConsiderationPaise: order.lotConsiderationPaise,
    finalPrice: order.finalPrice,
    manifest: order.manifest ? { hash: order.manifest.hash, generatedAt: order.manifest.generatedAt } : null
  };
}

export async function onRequestPost({ request, env }) {
  try {
    if (!dbReady(env)) {
      return json({ success: false, message: 'Tracking is temporarily unavailable.' }, 503);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ success: false, message: 'Invalid request body' }, 400);
    }

    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!email || email.length > 254 || !EMAIL_RE.test(email) || !CODE_RE.test(code)) {
      return json({ success: false, message: 'A valid email address and 6-digit code are required.' }, 400);
    }

    // Consume the code FIRST: a wrong guess costs an attempt whether or not
    // this address has requests, so success/failure never leaks that fact.
    const ok = await verifyTrackOtp(env, { email, code });
    if (!ok) return json({ success: false, message: GENERIC_FAIL }, 400);

    const orders = await listOrdersByEmail(env, email);
    if (orders.length === 0) return json({ success: false, message: GENERIC_FAIL }, 400);

    await ensureNegotiationSchema(env);
    const { token, expiresAt, email: scoped } = await mintBuyerToken(env, { email });

    return json({
      success: true,
      token,
      expiresAt,
      email: scoped,
      orders: orders.map(publicOrder)
    });
  } catch (err) {
    console.error('[track] verify-otp error:', err);
    return json({ success: false, message: 'Failed to verify the code. Please try again shortly.' }, 500);
  }
}
