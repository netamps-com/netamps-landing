/**
 * POST /api/track/request-otp
 *
 * Step 1 of buyer verification — EMAIL ONLY.
 *
 * The visitor supplies the email address on their requests. That address is
 * the identity: the OTP is delivered to it, so a correct code proves mailbox
 * ownership and therefore ownership of every request filed under it. No order
 * ID is required (and none is asked for) — the buyer picks their order after
 * verifying.
 *
 * NON-ENUMERATING + UNIFORM: the response is byte-identical whether or not the
 * address has requests on file, and the cooldown/ hourly cap run either way.
 * Only the DELIVERY differs, which an attacker cannot observe from here.
 *
 * No model, no catalog — a lookup and one email.
 */

import { listOrdersByEmail, dbReady } from '../negotiate/store.mjs';
import { issueTrackOtp } from './otp.mjs';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

/** One message, one status, for every address — success or not. */
const GENERIC = 'If that address has requests, a verification code was sent. It expires in 5 minutes.';

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
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
      return json({ success: false, message: 'A valid email address is required.' }, 400);
    }

    const orders = await listOrdersByEmail(env, email);
    const issued = await issueTrackOtp(env, { email, hasOrders: orders.length > 0 });
    if (!issued.ok) {
      const status = issued.code === 'rate' || issued.code === 'cooldown' ? 429 : 503;
      return json({ success: false, message: issued.message }, status);
    }

    return json({ success: true, message: GENERIC });
  } catch (err) {
    console.error('[track] request-otp error:', err);
    return json({ success: false, message: 'Failed to send a verification code. Please try again shortly.' }, 500);
  }
}
