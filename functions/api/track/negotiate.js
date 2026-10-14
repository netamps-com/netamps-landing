/**
 * /api/track/negotiate — buyer side of a price negotiation.
 *
 * Auth: a buyer token minted by /api/track/verify-otp (post-OTP), sent as
 * `x-buyer-token: <token>` (or `Authorization: Bearer <token>`). The token is
 * scoped to an EMAIL, so it authorises every order filed under that address —
 * and NOTHING else: each request re-checks the order's email against the
 * token's. That is what lets the buyer choose which order to negotiate.
 *
 *   GET  ?requestId=B-… → that order + its threads + the current frozen price
 *   GET  (no requestId) → the buyer's order list (re-fetch after verifying)
 *   POST { requestId, action, totalPaise, note }
 *                      → append one BUYER round, freezing the price the buyer
 *                        is looking at (price-version capture)
 *
 * A buyer can offer / counter / accept / withdraw — never "approve the deal",
 * and never before staff have moved the request to "Order Accepted for
 * Negotiation". The model is never consulted here. Amounts are integer paise.
 */

import {
  getOrderById, listOrdersByEmail, dbReady, ensureNegotiationSchema,
  listNegotiationsForOrder, findOrCreateNegotiation, appendRound, readRounds, verifyBuyerToken
} from '../negotiate/store.mjs';
import { validateRound, applyRound, summarize, capturePriceSnapshot, isNegotiable, isClosed, STATUS } from '../negotiate/core.mjs';
import { publicOrder } from './verify-otp.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function readToken(request) {
  const direct = request.headers.get('x-buyer-token') || request.headers.get('x-order-token');
  if (direct) return direct.trim();
  const auth = request.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return m ? m[1].trim() : '';
}

/** Token → { email }. Ownership of the mailbox, nothing more. */
async function loadBuyer(env, request) {
  if (!dbReady(env)) return { error: json({ success: false, message: 'Tracking is temporarily unavailable.' }, 503) };
  const session = await verifyBuyerToken(env, readToken(request));
  if (!session) return { error: json({ success: false, message: 'Your verification has expired. Please verify again.' }, 401) };
  return { email: session.email };
}

/** Load an order the token's email provably owns — otherwise 404 either way. */
async function loadOwnedOrder(env, email, requestId) {
  const order = await getOrderById(env, requestId);
  if (!order) return { error: json({ success: false, message: 'Request not found.' }, 404) };
  const owner = order.email ? String(order.email).trim().toLowerCase() : null;
  if (!owner || owner !== email) {
    // Same message as "does not exist" — this token cannot probe other buyers.
    return { error: json({ success: false, message: 'Request not found.' }, 404) };
  }
  return { order };
}

async function threadFor(env, negotiation, order) {
  const rounds = await readRounds(env, negotiation.id);
  return summarize(negotiation, rounds, order);
}

export async function onRequestGet({ request, env }) {
  try {
    const buyer = await loadBuyer(env, request);
    if (buyer.error) return buyer.error;

    await ensureNegotiationSchema(env);
    const requestId = new URL(request.url).searchParams.get('requestId');

    // No order chosen yet → hand back the buyer's own list.
    if (!requestId) {
      const orders = await listOrdersByEmail(env, buyer.email);
      return json({ success: true, email: buyer.email, orders: orders.map(publicOrder) });
    }

    const owned = await loadOwnedOrder(env, buyer.email, requestId);
    if (owned.error) return owned.error;
    const { order } = owned;

    const negotiations = await listNegotiationsForOrder(env, order.id);
    const threads = [];
    for (const n of negotiations) threads.push(await threadFor(env, n, order));

    return json({
      success: true,
      order: publicOrder(order),
      // Chronological truth for the UI: can this buyer speak yet?
      negotiable: isNegotiable(order.status) && !isClosed(order.status),
      status: order.status || STATUS.PENDING,
      negotiations: threads
    });
  } catch (err) {
    console.error('[track] negotiate GET error:', err);
    return json({ success: false, message: 'Failed to load the negotiation.' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const buyer = await loadBuyer(env, request);
    if (buyer.error) return buyer.error;

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ success: false, message: 'Invalid request body' }, 400);
    }

    const owned = await loadOwnedOrder(env, buyer.email, typeof body.requestId === 'string' ? body.requestId : '');
    if (owned.error) return owned.error;
    const { order } = owned;

    const check = validateRound({
      side: 'buyer',
      kind: typeof body.action === 'string' ? body.action : '',
      totalPaise: Number.isInteger(body.totalPaise) ? body.totalPaise : null,
      note: body.note
    });
    if (!check.ok) return json({ success: false, message: check.error }, 400);

    await ensureNegotiationSchema(env);

    // Chronology gate: until staff press "Order Accepted for Negotiation" the
    // request is still Pending and the buyer has nothing to negotiate against.
    if (!isNegotiable(order.status)) {
      const msg = isClosed(order.status)
        ? 'This request is closed — no further negotiation is possible.'
        : 'Netamps has not accepted this request for negotiation yet.';
      return json({ success: false, message: msg }, 409);
    }

    const negotiation = await findOrCreateNegotiation(env, order);

    const rounds = await readRounds(env, negotiation.id);
    const next = applyRound(
      {
        status: negotiation.status,
        roundCount: rounds.length,
        currentTotalPaise: Number.isInteger(negotiation.current_total_paise) ? negotiation.current_total_paise : null
      },
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
    return json({
      success: true,
      negotiation: summary,
      current: snapshot,
      status: next.status
    });
  } catch (err) {
    console.error('[track] negotiate POST error:', err);
    const message = err && err.code === 'ORDER_CLOSED' ? err.message : 'Failed to record the negotiation. Please try again.';
    return json({ success: false, message }, err && err.code === 'ORDER_CLOSED' ? 409 : 500);
  }
}
