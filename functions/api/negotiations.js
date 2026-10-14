/**
 * /api/negotiations — ADMIN / STAFF side of price negotiation (seller side).
 *
 * Auth: an authenticated dashboard session (verifySession). This is the
 * "separate tab" the operator monitors: every buyer↔seller thread on one screen,
 * with the frozen price version each round was made against and a staleness flag
 * when the order's price has since moved.
 *
 *   GET  ?status=open|agreed|deal|declined|all
 *        → every negotiation + its order summary + thread + staleness
 *   POST { requestId, action: 'open' }
 *        → "Order Accepted for Negotiation": opens (or resumes) the thread and
 *          moves the order to the first rung. The entry point for staff.
 *   POST { negotiationId | requestId, action, totalPaise, note }
 *        → append one STAFF round: offer / counter / accept / reject / approve
 *
 * CHRONOLOGY, enforced server-side and shared with the buyer module:
 *   Pending → Order Accepted for Negotiation → Negotiation in Progress
 *           → Accepted Final Price           → Order Deal Approved
 * `approve` is the ONLY verb that closes a thread for either BUY or SELL. It
 * freezes the accepted price as the immutable FinalPriceSnapshot and appends
 * the single permanent price_history row — intermediate figures live in the
 * thread, never in the audit trail.
 */

import { verifySession } from './intake/auth';
import {
  dbReady, ensureNegotiationSchema, getOrderById, listNegotiations,
  readNegotiation, findOrCreateNegotiation, appendRound, readRounds, finalizeDeal
} from './negotiate/store.mjs';
import { validateRound, applyRound, summarize, capturePriceSnapshot, isNegotiable, isClosed, STATUS } from './negotiate/core.mjs';
import { publicOrder } from './track/verify-otp.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

/** Accepted filter words. Anything else is rejected — a typo never widens the view. */
const STATUSES = new Set([
  'open', 'active', 'agreed', 'accepted', 'deal', 'approved', 'declined', 'rejected', 'withdrawn', 'all'
]);

async function threadFor(env, negotiation, order) {
  const rounds = await readRounds(env, negotiation.id);
  return summarize(negotiation, rounds, order);
}

export async function onRequestGet({ request, env }) {
  try {
    const user = await verifySession(env, request);
    if (!user) return json({ success: false, message: 'Unauthorized' }, 401);
    if (!dbReady(env)) return json({ success: false, message: 'Database unavailable.' }, 503);

    const status = new URL(request.url).searchParams.get('status') || 'open';
    if (!STATUSES.has(String(status).toLowerCase())) {
      return json({ success: false, message: 'Invalid status filter.' }, 400);
    }

    await ensureNegotiationSchema(env);
    const rows = await listNegotiations(env, { status });
    const items = [];
    for (const n of rows) {
      const order = await getOrderById(env, n.request_id);
      const summary = await threadFor(env, n, order);
      items.push({
        ...summary,
        order: order ? publicOrder(order) : null
      });
    }
    return json({ success: true, viewerRole: user.role || 'user', negotiations: items });
  } catch (err) {
    console.error('[negotiations] GET error:', err);
    return json({ success: false, message: 'Failed to load negotiations.' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const user = await verifySession(env, request);
    if (!user) return json({ success: false, message: 'Unauthorized' }, 401);
    if (!dbReady(env)) return json({ success: false, message: 'Database unavailable.' }, 503);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ success: false, message: 'Invalid request body' }, 400);
    }

    await ensureNegotiationSchema(env);
    const action = typeof body.action === 'string' ? body.action : '';

    // ── action:'open' → "Order Accepted for Negotiation" ────────────────────
    // Not a round: nothing has been proposed yet. This is the rung the
    // dashboard's accept button stands on, and the only way a Pending request
    // enters the ladder.
    if (action === 'open') {
      const order = await getOrderById(env, typeof body.requestId === 'string' ? body.requestId : '');
      if (!order) return json({ success: false, message: 'Request not found.' }, 404);
      if (isClosed(order.status)) {
        return json({
          success: false,
          message: order.status === STATUS.DECLINED
            ? 'This request was declined.'
            : 'This request is already deal-approved.'
        }, 409);
      }
      const negotiation = await findOrCreateNegotiation(env, order);
      const summary = await threadFor(env, negotiation, order);
      return json({
        success: true,
        negotiation: { ...summary, order: publicOrder({ ...order, status: STATUS.ACCEPTED }) },
        status: STATUS.ACCEPTED
      });
    }

    const check = validateRound({
      side: 'staff',
      kind: action,
      totalPaise: Number.isInteger(body.totalPaise) ? body.totalPaise : null,
      note: body.note
    });
    if (!check.ok) return json({ success: false, message: check.error }, 400);

    let negotiation = null;
    if (body.negotiationId) {
      negotiation = await readNegotiation(env, String(body.negotiationId));
      if (!negotiation) return json({ success: false, message: 'Negotiation not found.' }, 404);
    } else if (body.requestId) {
      const order = await getOrderById(env, String(body.requestId));
      if (!order) return json({ success: false, message: 'Request not found.' }, 404);
      negotiation = await findOrCreateNegotiation(env, order);
    } else {
      return json({ success: false, message: 'A negotiationId or requestId is required.' }, 400);
    }

    const order = await getOrderById(env, negotiation.request_id);
    if (!order) return json({ success: false, message: 'Request not found.' }, 404);

    // Chronology gate: staff must accept the request for negotiation first.
    if (!isNegotiable(order.status)) {
      return json({
        success: false,
        message: isClosed(order.status)
          ? 'This request is closed — no further negotiation is possible.'
          : 'Accept this request for negotiation first ("Order Accepted for Negotiation").'
      }, 409);
    }

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

    // Freeze the price staff are acting against, right now (pre-approval, so
    // the closing round records the figure that was actually agreed).
    const snapshot = capturePriceSnapshot(order);

    // "Order Deal Approved": persist the decision FIRST — the agreed price is
    // the durable fact; the thread row follows.
    if (check.value.kind === 'approve') {
      await finalizeDeal(env, { order, totalPaise: next.currentTotalPaise, actor: user.email });
    }

    await appendRound(env, negotiation, check.value, snapshot, user.email, next);

    const fresh = await readRounds(env, negotiation.id);
    const settled = check.value.kind === 'approve'
      ? { ...order, status: STATUS.DEAL, finalPrice: { ...(order.finalPrice || {}), version: (order.finalPrice?.version ?? 0) + 1, totalPaise: next.currentTotalPaise, basis: 'negotiated' } }
      : { ...order, status: next.status };
    const summary = summarize(
      { ...negotiation, status: next.status, current_total_paise: next.currentTotalPaise },
      fresh,
      settled
    );
    return json({
      success: true,
      negotiation: { ...summary, order: publicOrder(settled) },
      status: next.status
    });
  } catch (err) {
    console.error('[negotiations] POST error:', err);
    const closed = err && err.code === 'ORDER_CLOSED';
    return json(
      { success: false, message: closed ? err.message : 'Failed to record the response. Please try again.' },
      closed ? 409 : 500
    );
  }
}
