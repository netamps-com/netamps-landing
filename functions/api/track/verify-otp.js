/**
 * POST /api/track/verify-otp
 *
 * Step 2 of buyer verification — EMAIL ONLY.
 *
 * On a correct code (verified FIRST, so the brute-force budget is spent even
 * for addresses with no requests), mint a cryptographic session ID, store it
 * server-side in D1 with an expiry, and set an httpOnly cookie so the browser
 * never exposes it to script. Every subsequent API call validates the cookie
 * instead of relying on a token in the request body.
 *
 * Contract: { success, sessionId, expiresAt, email, orders[] }
 */

import { verifyTrackOtp } from './otp.mjs';
import { dbReady, listOrdersByEmail } from '../negotiate/store.mjs';

const COOKIE_NAME = 'netamps_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const IDLE_TTL_MS = 20 * 60 * 60 * 1000; // 20 min idle
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h absolute

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      // Set httpOnly session cookie
      'Set-Cookie': `${COOKIE_NAME}=${body.sessionId}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${Math.round(SESSION_TTL_MS / 1000)}`
    }
  });
}

function errorJson(message, status = 400) {
  return json({ success: false, message }, status);
}

export async function onRequestPost({ request, env }) {
  try {
    if (!dbReady(env)) {
      return errorJson('Tracking is temporarily unavailable.', 503);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return errorJson('Invalid request body.', 400);
    }

    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
    const CODE_RE = /^[0-9]{6}$/;

    if (!email || email.length > 254 || !EMAIL_RE.test(email) || !CODE_RE.test(code)) {
      return errorJson('A valid email address and 6-digit code are required.', 400);
    }

    // Consume the code FIRST: a wrong guess costs an attempt whether or not
    // this address has requests, so success/failure never leaks that fact.
    const ok = await verifyTrackOtp(env, { email, code });
    if (!ok) return errorJson('Invalid or expired code. Please request a new one.', 400);

    // List orders for this email
    const orders = await listOrdersByEmail(env, email);
    if (orders.length === 0) return errorJson('No tracked requests found for this email.', 400);

    // ---- mint cryptographic session ----
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

    // Store session in D1 with email, expiry, and idle tracker
    await env.DB.prepare(
      `INSERT OR REPLACE INTO sessions (id, email, expires_at, created_at, last_accessed) VALUES (?1,?2,?3,?4,?5)`
    ).bind(sessionId, email, expiresAt, now, now).run();

    // Fetch orders with public projection
    const publicOrders = orders.map((o) => ({
      id: o.id,
      intent: o.intent,
      name: o.name,
      company: o.company,
      date: o.date,
      status: o.status,
      products: o.products,
      pricingBasis: o.pricingBasis,
      lotConsiderationPaise: o.lotConsiderationPaise,
      finalPrice: o.finalPrice,
      manifest: o.manifest ? { hash: o.manifest.hash, generatedAt: o.manifest.generatedAt } : null
    }));

    return json({
      success: true,
      sessionId,
      expiresAt,
      email,
      orders: publicOrders
    });
  } catch (err) {
    console.error('[track] verify-otp error:', err);
    return errorJson('Failed to verify the code. Please try again shortly.', 500);
  }
}