/**
 * /api/negotiations — ADMIN / STAFF side of price negotiation (seller side).
 *
 * Auth: an authenticated dashboard session (verifySession). This is the
 * "separate tab" the operator monitors: every buyer↔seller thread on one screen,
 * with the frozen price version each round was made against and a staleness flag
 * when the order's price has since moved.
 *
 *   GET  ?status=open|all|accepted|rejected|withdrawn
 *        → every negotiation + its order summary + thread + staleness
 *   POST { negotiationId | requestId, action, totalPaise, note }
 *        → append one STAFF round (open a thread for an order if none exists)
 *
 * Buying a service to staff never changes the order's price snapshot: it records
 * a proposal. The approval snapshot (returns PUT) remains the only thing that
 * moves the priced figure, and only with the staleness guard in view.
 */

import { verifySession } from './intake/auth';
import {
  dbReady, ensureNegotiationSchema, getOrderById, listNegotiations,
  readNegotiation, findOrCreateNegotiation, appendRound, readRounds
} from './negotiate/store.mjs';
import { validateRound, applyRound, summarize, capturePriceSnapshot } from './negotiate/core.mjs';
import { publicOrder } from './track/verify-otp.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

const STATUSES = new Set(['open', 'accepted', 'rejected', 'withdrawn', 'all']);

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
    if (!STATUSES.has(status)) return json({ success: false, message: 'Invalid status filter.' }, 400);

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

    const check = validateRound({
      side: 'staff',
      kind: typeof body.action === 'string' ? body.action : '',
      totalPaise: Number.isInteger(body.totalPaise) ? body.totalPaise : null,
      note: body.note
    });
    if (!check.ok) return json({ success: false, message: check.error }, 400);

    await ensureNegotiationSchema(env);

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

    const next = applyRound(
      { status: negotiation.status, currentTotalPaise: Number.isInteger(negotiation.current_total_paise) ? negotiation.current_total_paise : null },
      check.value
    );
    if (!next.ok) return json({ success: false, message: next.error }, 409);

    const snapshot = capturePriceSnapshot(order);
    await appendRound(env, negotiation, check.value, snapshot, user.email, next);

    const fresh = await readRounds(env, negotiation.id);
    const summary = summarize(
      { ...negotiation, status: next.status, current_total_paise: next.currentTotalPaise },
      fresh,
      order
    );
    return json({ success: true, negotiation: { ...summary, order: publicOrder(order) } });
  } catch (err) {
    console.error('[negotiations] POST error:', err);
    return json({ success: false, message: 'Failed to record the response. Please try again.' }, 500);
  }
}
