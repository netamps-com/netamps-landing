/**
 * GET /api/timeline?requestId=… — one order's audit trail, for the dashboard.
 *
 * Returns the chronological ladder with the timestamp and actor of each rung,
 * the raw append-only event stream behind it, and the order's email ledger
 * with a count. All three are derived from tables that are only ever INSERTed
 * into, so what this endpoint says happened cannot have been edited afterwards.
 *
 * The buyer's Track page gets the same ladder through /api/track/negotiate
 * (already authenticated for that order) rather than through this route: staff
 * session and buyer token are separate trust domains and must not be
 * interchangeable.
 */

import { verifySession } from './intake/auth';
import { dbReady, ensureNegotiationSchema, getOrderById, readRounds, readActiveNegotiation } from './negotiate/store.mjs';
import { summarize, normalizeStatus, statusRank, CHRONOLOGY } from './negotiate/core.mjs';
import { readOrderEvents, deriveLadder } from './audit/order-events.mjs';
import { readOrderEmails, summarizeOrderEmails } from './audit/order-emails.mjs';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export async function onRequestGet({ request, env }) {
  try {
    const user = await verifySession(env, request);
    if (!user) return json({ success: false, message: 'Unauthorized' }, 401);
    if (!dbReady(env)) return json({ success: false, message: 'Database unavailable.' }, 503);

    const url = new URL(request.url);
    const requestId = String(url.searchParams.get('requestId') || '').trim().slice(0, 64);
    if (!requestId) return json({ success: false, message: 'requestId required' }, 400);

    const order = await getOrderById(env, requestId);
    if (!order) return json({ success: false, message: 'Request not found.' }, 404);

    await ensureNegotiationSchema(env);

    const events = await readOrderEvents(env, requestId);
    const ladder = deriveLadder(events, normalizeStatus(order.status));

    // The live thread supplies the authoritative rung when one exists; the
    // event ladder is the history, the thread is the present. Reported
    // separately so a disagreement is visible rather than averaged away.
    const head = await readActiveNegotiation(env, requestId);
    let current = normalizeStatus(order.status);
    let rounds = [];
    if (head) {
      rounds = await readRounds(env, head.id);
      current = summarize(head, rounds, order).status;
    }

    const emails = await readOrderEmails(env, requestId);
    const counts = (await summarizeOrderEmails(env, [requestId])).get(requestId)
      || { total: 0, byCause: {}, byOutcome: {}, lastAt: null };

    return json({
      success: true,
      requestId,
      intent: order.intent || null,
      status: normalizeStatus(order.status),
      current,
      ladder,
      events,
      chronology: CHRONOLOGY,
      rank: statusRank(current),
      emails: { count: counts.total, byCause: counts.byCause, byOutcome: counts.byOutcome, lastAt: counts.lastAt, items: emails },
      thread: head
        ? { id: head.id, status: current, createdAt: head.created_at, updatedAt: head.updated_at, rounds: rounds.length }
        : null
    });
  } catch (err) {
    console.error('[timeline] GET error:', err);
    return json({ success: false, message: 'Failed to load the timeline.' }, 500);
  }
}
