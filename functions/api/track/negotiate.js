/**
 * /api/track/negotiate — buyer side of a price negotiation.
 *
 * Auth: an order-access token minted by /api/track/verify-otp (post-OTP), sent
 * as `x-order-token: <token>` (or `Authorization: Bearer <token>`). The token is
 * scoped to exactly one order — it can read and negotiate that order and nothing
 * else.
 *
 *   GET  → the order + every negotiation thread + the current frozen price
 *   POST → append one BUYER round ({ action, totalPaise, note }), freezing the
 *          price the buyer is looking at (price-version capture)
 *
 * The model is never consulted here. Amounts are integer paise.
 */

import { getOrderById, dbReady, ensureNegotiationSchema, listNegotiationsForOrder, findOrCreateNegotiation, appendRound, readRounds, verifyOrderToken } from '../negotiate/store.mjs';
import { validateRound, applyRound, summarize, capturePriceSnapshot } from '../negotiate/core.mjs';
import { publicOrder } from './verify-otp.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function readToken(request) {
  const direct = request.headers.get('x-order-token');
  if (direct) return direct.trim();
  const auth = request.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return m ? m[1].trim() : '';
}

async function loadContext(env, request) {
  if (!dbReady(env)) return { error: json({ success: false, message: 'Tracking is temporarily unavailable.' }, 503) };
  const token = readToken(request);
  const session = await verifyOrderToken(env, token);
  if (!session) return { error: json({ success: false, message: 'Your verification has expired. Please verify again.' }, 401) };
  const order = await getOrderById(env, session.requestId);
  if (!order) return { error: json({ success: false, message: 'Request not found.' }, 404) };
  return { order, email: session.email };
}

async function threadFor(env, negotiation, order) {
  const rounds = await readRounds(env, negotiation.id);
  return summarize(negotiation, rounds, order);
}

export async function onRequestGet({ request, env }) {
  try {
    const ctx = await loadContext(env, request);
    if (ctx.error) return ctx.error;
    const { order } = ctx;

    await ensureNegotiationSchema(env);
    const negotiations = await listNegotiationsForOrder(env, order.id);
    const threads = [];
    for (const n of negotiations) threads.push(await threadFor(env, n, order));

    return json({ success: true, order: publicOrder(order), negotiations: threads });
  } catch (err) {
    console.error('[track] negotiate GET error:', err);
    return json({ success: false, message: 'Failed to load the negotiation.' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const ctx = await loadContext(env, request);
    if (ctx.error) return ctx.error;
    const { order } = ctx;

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ success: false, message: 'Invalid request body' }, 400);
    }

    const check = validateRound({
      side: 'buyer',
      kind: typeof body.action === 'string' ? body.action : '',
      totalPaise: Number.isInteger(body.totalPaise) ? body.totalPaise : null,
      note: body.note
    });
    if (!check.ok) return json({ success: false, message: check.error }, 400);

    await ensureNegotiationSchema(env);
    const negotiation = await findOrCreateNegotiation(env, order);

    const next = applyRound(
      { status: negotiation.status, currentTotalPaise: Number.isInteger(negotiation.current_total_paise) ? negotiation.current_total_paise : null },
      check.value
    );
    if (!next.ok) return json({ success: false, message: next.error }, 409);

    // Freeze the price the buyer is acting against, right now.
    const snapshot = capturePriceSnapshot(order);
    await appendRound(env, negotiation, check.value, snapshot, order.email, next);

    const fresh = await readRounds(env, negotiation.id);
    const summary = summarize(
      { ...negotiation, status: next.status, current_total_paise: next.currentTotalPaise },
      fresh,
      order
    );
    return json({ success: true, negotiation: summary, current: snapshot });
  } catch (err) {
    console.error('[track] negotiate POST error:', err);
    return json({ success: false, message: 'Failed to record the negotiation. Please try again.' }, 500);
  }
}
