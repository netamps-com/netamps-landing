/**
 * GET /api/price-history — the Price Tracker.
 *
 * A standalone module for the permanent final-price audit trail: every price
 * decision, with the product names it covered and the time it was made,
 * searchable by order id and date range without touching the order list.
 *
 * WHY IT IS ITS OWN ENDPOINT. The order list used to carry a price-history
 * array on every row. That put a decision trail inside a workflow view (where
 * the user did not want it), cost a join per list load, and invited the two
 * to be edited together. Here the trail is read-only, independent of the
 * product catalog, and joined to nothing mutable: `product_names` was
 * SNAPSHOT when the price was decided, so editing the order's lines today
 * cannot rewrite what yesterday's decision covered.
 *
 * Filters are DETERMINISTIC by design. "Order id", "from", "to" are exact
 * comparisons — a language model asked to decide which rows fall in a date
 * range has no ground truth to check itself against and will confidently
 * return the wrong orders. The semantic/LLM layer, when built, will only ever
 * select from rows this query has already enumerated.
 */

import { verifySession } from './intake/auth';
import { dbReady } from './negotiate/store.mjs';

const MAX_LIMIT = 200;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

/** Accept `2026-01-31` or a full ISO instant; reject anything else. */
function dateBound(raw, endOfDay) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return endOfDay ? `${s}T23:59:59.999Z` : `${s}T00:00:00.000Z`;
}

function parseNames(jsonText) {
  if (!jsonText) return [];
  try {
    const v = JSON.parse(jsonText);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function onRequestGet({ request, env }) {
  try {
    const user = await verifySession(env, request);
    if (!user) return json({ success: false, message: 'Unauthorized' }, 401);
    if (!dbReady(env)) return json({ success: false, message: 'Database unavailable.' }, 503);

    const sp = new URL(request.url).searchParams;
    const requestId = String(sp.get('requestId') || '').trim().slice(0, 64);
    const from = dateBound(sp.get('from'), false);
    const to = dateBound(sp.get('to'), true);
    const rawLimit = Number(sp.get('limit'));
    const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : MAX_LIMIT;
    const offset = Math.max(0, Number(sp.get('offset')) || 0);

    if (sp.get('from') && !from) return json({ success: false, message: 'Invalid "from" date — use YYYY-MM-DD.' }, 400);
    if (sp.get('to') && !to) return json({ success: false, message: 'Invalid "to" date — use YYYY-MM-DD.' }, 400);
    if (from && to && from > to) return json({ success: false, message: '"from" is after "to".' }, 400);

    const where = [];
    const binds = [];
    if (requestId) {
      // Order ids are upper-case throughout; compare case-insensitively so a
      // pasted lowercase id still lands on its rows.
      where.push('UPPER(ph.request_id) = ?');
      binds.push(requestId.toUpperCase());
    }
    if (from) { where.push('ph.at >= ?'); binds.push(from); }
    if (to) { where.push('ph.at <= ?'); binds.push(to); }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const totalRes = await env.DB.prepare(`SELECT COUNT(*) AS n FROM price_history ph ${clause}`)
      .bind(...binds).first().catch(() => ({ n: 0 }));

    const rows = await env.DB.prepare(
      `SELECT ph.id, ph.request_id, ph.product_id, ph.old_paise, ph.new_paise, ph.actor, ph.at,
              ph.product_names, ph.basis,
              r.intent, r.status, r.date, r.email, r.finalprice
         FROM price_history ph
         LEFT JOIN returns r ON r.id = ph.request_id
         ${clause}
        ORDER BY ph.at DESC
        LIMIT ? OFFSET ?`
    ).bind(...binds, limit, offset).all().catch(() => ({ results: [] }));

    const items = (rows.results || []).map((r) => {
      let snapshot = null;
      try {
        snapshot = r.finalprice ? JSON.parse(r.finalprice) : null;
      } catch { snapshot = null; }
      return {
        id: r.id,
        requestId: r.request_id,
        intent: r.intent || null,
        status: r.status || null,
        orderDate: r.date || null,
        productId: r.product_id,
        // Captured at decision time — never resolved from the catalog now.
        products: parseNames(r.product_names),
        oldPaise: r.old_paise === null || r.old_paise === undefined ? null : Number(r.old_paise),
        newPaise: r.new_paise === null || r.new_paise === undefined ? null : Number(r.new_paise),
        basis: r.basis || (snapshot && snapshot.basis) || null,
        version: snapshot && Number.isInteger(snapshot.version) ? snapshot.version : null,
        actor: r.actor || null,
        at: r.at
      };
    });

    return json({
      success: true,
      total: Number((totalRes && totalRes.n) || 0),
      limit,
      offset,
      filters: { requestId: requestId || null, from, to },
      items
    });
  } catch (err) {
    console.error('[price-history] GET error:', err);
    return json({ success: false, message: 'Failed to load price history.' }, 500);
  }
}
