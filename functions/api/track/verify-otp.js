/**
 * POST /api/track/verify-otp
 *
 * Step 2 of buyer order verification. On a correct code, mints a short-lived,
 * order-scoped access token (60 min) and returns ONLY that one order. The token
 * authorises negotiation actions (functions/api/track/negotiate.js); it is not a
 * login session and cannot read anything but this order.
 */

import { getOrderById, dbReady, mintOrderToken, ensureNegotiationSchema } from '../negotiate/store.mjs';
import { verifyTrackOtp } from './otp.mjs';

const ID_RE = /^[SB]-[A-Z0-9-]{3,64}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
const CODE_RE = /^[0-9]{6}$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

/** The buyer-visible projection of their own order — never the whole row. */
export function publicOrder(order) {
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

    const id = typeof body.id === 'string' ? body.id.trim().toUpperCase() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!ID_RE.test(id) || !email || email.length > 254 || !EMAIL_RE.test(email) || !CODE_RE.test(code)) {
      return json({ success: false, message: 'A valid tracking ID, email and 6-digit code are required.' }, 400);
    }

    const order = await getOrderById(env, id);
    const onFile = order && order.email ? String(order.email).trim().toLowerCase() : null;
    if (!order || onFile !== email.toLowerCase()) {
      return json({ success: false, message: 'No open request matches that ID and email address.' }, 404);
    }

    const ok = await verifyTrackOtp(env, { requestId: order.id, code });
    if (!ok) {
      return json({ success: false, message: 'Invalid or expired code. Please request a new one.' }, 400);
    }

    await ensureNegotiationSchema(env);
    const { token, expiresAt } = await mintOrderToken(env, { requestId: order.id, email: onFile });

    return json({ success: true, token, expiresAt, order: publicOrder(order) });
  } catch (err) {
    console.error('[track] verify-otp error:', err);
    return json({ success: false, message: 'Failed to verify the code. Please try again shortly.' }, 500);
  }
}
