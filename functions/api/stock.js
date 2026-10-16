import { verifySession } from './intake/auth';

/**
 * POST /api/stock — buy & sell inventory over the append-only stock ledger.
 *
 * Reads (any authenticated session; rows carry operator emails, same posture
 * as /api/match):
 *   levels       availability by normalized key across OPEN lots
 *   movements    ledger rows for one lot, or everything touching one buy order
 *   reservations outstanding holds for one buy order
 *   lots         open lots (+balances) for one sell order
 * Writes (admin only — every movement is an audited, guarded ledger append):
 *   receive reserve release issue adjust void
 * Ops (admin only):
 *   flag         read/set the `stock_enabled` kill switch (default OFF)
 *   backfill     receive every SELL order already at DEAL (idempotent)
 *
 * The greedy matcher is untouched: this is the parallel qty-aware layer.
 * Zero npm imports.
 */

import {
  ensureStockTables, stockEnabled, setStockEnabled,
  receiveSellOrder, reserveStock, releaseStock, releaseOrderReservations,
  issueStock, issueBuyOrder, voidSellOrder, adjustStock,
  availableByKey, movementsFor, reservationsForBuy, lotsForSellOrder,
} from './stock/ledger.mjs';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

const isAdmin = (user) => !!user && (user.role === 'admin' || user.email === 'admin@netamps.com');

const posIntOr = (v, dflt) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : dflt;
};

function parseProducts(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch { return []; }
  }
  return [];
}

export async function onRequestPost({ request, env }) {
  try {
    const user = await verifySession(env, request);
    if (!user) {
      return json({ success: false, message: 'Unauthorized' }, 401);
    }
    if (!env.DB || typeof env.DB.prepare !== 'function') {
      return json({ success: false, message: 'Returns database is not attached.' }, 503);
    }

    let body = {};
    try {
      body = await request.json() || {};
    } catch {
      return json({ success: false, message: 'Invalid request body' }, 400);
    }
    const action = String(body.action || 'levels');
    const ALLOWED = new Set([
      'levels', 'movements', 'reservations', 'lots',
      'receive', 'reserve', 'release', 'release-order', 'issue', 'adjust', 'void',
      'flag', 'backfill'
    ]);
    if (!ALLOWED.has(action)) {
      return json({ success: false, message: 'Unknown action.' }, 400);
    }

    // ── reads ──
    if (action === 'levels') {
      const levels = await availableByKey(env, {
        includeEmpty: body.includeEmpty === true,
        limit: posIntOr(body.limit, 500)
      });
      const enabled = await stockEnabled(env);
      return json({ success: true, enabled, levels });
    }
    if (action === 'movements') {
      const rows = await movementsFor(env, {
        lotId: typeof body.lotId === 'string' ? body.lotId : null,
        buyOrderId: typeof body.buyOrderId === 'string' ? body.buyOrderId : null,
        limit: posIntOr(body.limit, 200)
      });
      return json({ success: true, movements: rows });
    }
    if (action === 'reservations') {
      if (typeof body.buyOrderId !== 'string' || !body.buyOrderId) {
        return json({ success: false, message: '`buyOrderId` is required.' }, 400);
      }
      return json({ success: true, reservations: await reservationsForBuy(env, body.buyOrderId) });
    }
    if (action === 'lots') {
      if (typeof body.sellOrderId !== 'string' || !body.sellOrderId) {
        return json({ success: false, message: '`sellOrderId` is required.' }, 400);
      }
      return json({ success: true, lots: await lotsForSellOrder(env, body.sellOrderId) });
    }

    // ── writes + ops: admin only ──
    if (!isAdmin(user)) {
      return json({ success: false, message: 'Forbidden' }, 403);
    }
    const actor = user.email || 'unknown';

    if (action === 'flag') {
      if (body.enabled === undefined || body.enabled === null) {
        await ensureStockTables(env);
        return json({ success: true, enabled: await stockEnabled(env) });
      }
      if (typeof body.enabled !== 'boolean') {
        return json({ success: false, message: '`enabled` must be a boolean.' }, 400);
      }
      return json({ success: true, ...(await setStockEnabled(env, body.enabled)) });
    }

    if (action === 'receive') {
      if (typeof body.orderId !== 'string' || !body.orderId) {
        return json({ success: false, message: '`orderId` is required.' }, 400);
      }
      const r = await receiveSellOrder(env, { orderId: body.orderId, products: parseProducts(body.products), actor });
      return json({ success: r.ok, ...r }, r.ok ? 200 : 400);
    }
    if (action === 'reserve') {
      const r = await reserveStock(env, {
        sellOrderId: body.sellOrderId, sellLineIdx: body.sellLineIdx,
        buyOrderId: body.buyOrderId, buyLineIdx: body.buyLineIdx,
        qty: posIntOr(body.qty, NaN), actor
      });
      return json({ success: r.ok, ...r }, r.ok ? 200 : 400);
    }
    if (action === 'release') {
      const r = await releaseStock(env, {
        sellOrderId: body.sellOrderId, sellLineIdx: body.sellLineIdx,
        buyOrderId: body.buyOrderId, buyLineIdx: body.buyLineIdx,
        qty: body.qty === undefined || body.qty === null ? null : posIntOr(body.qty, NaN),
        actor, reason: typeof body.reason === 'string' && body.reason.trim() ? body.reason : 'manual_release'
      });
      return json({ success: r.ok, ...r }, r.ok ? 200 : 400);
    }
    if (action === 'release-order') {
      if (typeof body.buyOrderId !== 'string' || !body.buyOrderId) {
        return json({ success: false, message: '`buyOrderId` is required.' }, 400);
      }
      const r = await releaseOrderReservations(env, {
        buyOrderId: body.buyOrderId, actor,
        reason: typeof body.reason === 'string' && body.reason.trim() ? body.reason : 'manual_release'
      });
      return json({ success: r.ok, ...r });
    }
    if (action === 'issue') {
      // Direct single-lot issue. For a full buy order prefer the dashboard
      // flow (accept → reserve, deal → auto-issue via finalizeDeal).
      if (typeof body.buyOrderId === 'string' && (body.sellOrderId === undefined || body.sellOrderId === null)) {
        const r = await issueBuyOrder(env, { orderId: body.buyOrderId, products: parseProducts(body.products), actor });
        return json({ success: r.ok, ...r }, r.ok ? 200 : 400);
      }
      const r = await issueStock(env, {
        sellOrderId: body.sellOrderId, sellLineIdx: body.sellLineIdx,
        buyOrderId: body.buyOrderId, buyLineIdx: body.buyLineIdx,
        qty: posIntOr(body.qty, NaN), actor,
        reason: typeof body.reason === 'string' && body.reason.trim() ? body.reason : 'manual_issue'
      });
      return json({ success: r.ok, ...r }, r.ok ? 200 : 400);
    }
    if (action === 'adjust') {
      const delta = Number(body.delta);
      const r = await adjustStock(env, {
        sellOrderId: body.sellOrderId, sellLineIdx: body.sellLineIdx,
        delta: Number.isInteger(delta) ? delta : NaN,
        actor, reason: typeof body.reason === 'string' ? body.reason : ''
      });
      return json({ success: r.ok, ...r }, r.ok ? 200 : 400);
    }
    if (action === 'void') {
      if (typeof body.sellOrderId !== 'string' || !body.sellOrderId) {
        return json({ success: false, message: '`sellOrderId` is required.' }, 400);
      }
      const r = await voidSellOrder(env, {
        sellOrderId: body.sellOrderId, actor,
        reason: typeof body.reason === 'string' && body.reason.trim() ? body.reason : 'manual_void'
      });
      return json({ success: r.ok, ...r });
    }

    // ── backfill (admin): receive every SELL order already at DEAL ──
    // Idempotent per (order, line): safe to re-run after new deals land.
    if (action === 'backfill') {
      const CAP = 2000;
      const { results } = await env.DB.prepare(
        `SELECT id, products FROM returns
          WHERE LOWER(intent) = 'sell' AND status IN ('Order Deal Approved', 'Approved')
          ORDER BY date ASC LIMIT ?`
      ).bind(CAP).all();
      let received = 0;
      let existing = 0;
      let orders = 0;
      for (const row of results || []) {
        const r = await receiveSellOrder(env, { orderId: row.id, products: parseProducts(row.products), actor });
        if (r.ok) {
          orders += 1;
          received += r.received;
          existing += r.existing;
        }
      }
      return json({ success: true, orders, received, existing });
    }

    return json({ success: false, message: 'Unknown action.' }, 400);
  } catch (err) {
    console.error('[stock] Internal error:', err);
    return json({ success: false, message: 'Stock request failed. Please try again shortly.' }, 500);
  }
}
