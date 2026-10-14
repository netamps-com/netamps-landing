/**
 * POST /api/track/request-otp
 *
 * Step 1 of buyer order verification. The visitor supplies an ORDER ID and the
 * email on the order. A code is issued ONLY when both match a real record —
 * fail-closed and non-enumerating (an unknown ID and a wrong email return the
 * same generic message, so this cannot be used to probe which IDs exist).
 *
 * No model, no catalog — a lookup and one email.
 */

import { getOrderById, dbReady } from '../negotiate/store.mjs';
import { issueTrackOtp } from './otp.mjs';

const ID_RE = /^[SB]-[A-Z0-9-]{3,64}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
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
    if (!ID_RE.test(id) || !email || email.length > 254 || !EMAIL_RE.test(email)) {
      return json({ success: false, message: 'A valid tracking ID and email address are required.' }, 400);
    }

    const order = await getOrderById(env, id);
    const onFile = order && order.email ? String(order.email).trim().toLowerCase() : null;
    if (!order || onFile !== email.toLowerCase()) {
      // Same message either way — never confirm which part was wrong.
      return json({ success: false, message: 'No open request matches that ID and email address.' }, 404);
    }

    const issued = await issueTrackOtp(env, { requestId: order.id, email: onFile });
    if (!issued.ok) {
      const status = issued.code === 'rate' || issued.code === 'cooldown' ? 429 : 503;
      return json({ success: false, message: issued.message }, status);
    }

    return json({ success: true, message: 'Verification code sent to your email. It expires in 5 minutes.' });
  } catch (err) {
    console.error('[track] request-otp error:', err);
    return json({ success: false, message: 'Failed to send a verification code. Please try again shortly.' }, 500);
  }
}
