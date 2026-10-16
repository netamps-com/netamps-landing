/**
 * Stock ledger — buy & sell inventory connected through an append-only
 * movement ledger (industry-standard goods-receipt / reservation / goods-issue
 * practice, adapted to the Netamps order lifecycle).
 *
 * ── WHY A LEDGER, NOT A QUANTITY COLUMN ─────────────────────────────────────
 * A `qty_available` column that writers mutate in place cannot answer "who
 * took the last 3 units, and against which BUY?" after the fact — and two
 * concurrent writers can both read 5, both subtract 3, and leave 2 instead of
 * -1-with-an-error. Every change here is an appended movement row carrying its
 * actor, reason and buyer reference; balances are DERIVED (receipts − issues −
 * outstanding reserves + adjustments). The ledger is the audit trail, so there
 * is no second book to drift.
 *
 * ── FLOWS (all gated by the `stock_enabled` flag, default OFF) ─────────────
 *   SELL DEAL approved  → RECEIPT  (one lot per sell line; idempotent)
 *   candidate accepted  → RESERVE  (soft-hold against the buy line; guarded by
 *                                    availability; one outstanding per lot+ref)
 *   BUY DEAL approved   → ISSUE    (consumes the reservation first, then FIFO
 *                                    direct-issue for any remainder; shortfall
 *                                    is reported, never silent)
 *   order declined/withdrawn → RELEASE (outstanding holds for that buy order)
 *   order deleted       → VOID     (open lots closed; outstanding auto-released)
 *   recount/damage      → ADJUST   (signed, reasoned, never below zero)
 *
 * ── WHAT THIS DOES NOT TOUCH ────────────────────────────────────────────────
 * The greedy matcher (`match.js`) and its claim semantics are unchanged. This
 * module is the parallel qty-aware layer: writers run best-effort from the
 * lifecycle hooks and never fail the host operation; readers (`availableByKey`)
 * power the stock board without altering what the matcher returns.
 *
 * Conventions (same as matching/ranker.js): writers return
 * {ok:boolean, reason?...} and never throw for domain failures; `crypto`
 * and ISO timestamps are the only platform dependencies so the Node harness
 * exercises this verbatim via node:sqlite. D1-only (like the ranker); every
 * statement uses the prepare/bind/first/all/run surface the test shim covers.
 */

const LOT_OPEN = 'OPEN';
const LOT_CLOSED = 'CLOSED';
const LOT_VOID = 'VOID';

const KIND_RECEIPT = 'RECEIPT';
const KIND_RESERVE = 'RESERVE';
const KIND_RELEASE = 'RELEASE';
const KIND_ISSUE = 'ISSUE';
const KIND_ADJUST = 'ADJUST';

export const STOCK_KINDS = Object.freeze([KIND_RECEIPT, KIND_RESERVE, KIND_RELEASE, KIND_ISSUE, KIND_ADJUST]);
export const SELL_DEAL_STATUSES = Object.freeze(['Order Deal Approved', 'Approved']);

function nowIso() {
  return new Date().toISOString();
}

function uid() {
  return crypto.randomUUID();
}

const posInt = (v) => Number.isInteger(v) && v > 0;

export async function ensureStockTables(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS stock_lots (
       id TEXT PRIMARY KEY,
       sell_order_id TEXT NOT NULL,
       sell_line_idx INTEGER NOT NULL,
       norm_name TEXT NOT NULL,
       norm_model TEXT NOT NULL,
       raw_cat TEXT NOT NULL,
       raw_det TEXT NOT NULL,
       qty_total INTEGER NOT NULL,
       status TEXT NOT NULL DEFAULT 'OPEN',
       created_at TEXT NOT NULL,
       closed_at TEXT,
       UNIQUE (sell_order_id, sell_line_idx)
     )`
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_stock_lots_key ON stock_lots(norm_name, norm_model, status)'
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_stock_lots_sell ON stock_lots(sell_order_id)'
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS stock_movements (
       id TEXT PRIMARY KEY,
       lot_id TEXT NOT NULL,
       kind TEXT NOT NULL,
       qty INTEGER NOT NULL,
       ref_buy_order TEXT,
       ref_buy_line INTEGER,
       actor TEXT,
       reason TEXT,
       at TEXT NOT NULL
     )`
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_stock_mov_lot ON stock_movements(lot_id)'
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_stock_mov_ref ON stock_movements(ref_buy_order, ref_buy_line)'
  ).run();
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS stock_meta (key TEXT PRIMARY KEY, value TEXT)'
  ).run();
}

async function auditStock(env, event, details, actor) {
  try {
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, timestamp TEXT, event_type TEXT, page TEXT, details TEXT, username TEXT, ip_address TEXT)'
    ).run();
    await env.DB.prepare(
      'INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
    ).bind(
      uid(), nowIso(), event, 'Stock Ledger',
      JSON.stringify(details || {}), String(actor || 'system').slice(0, 254), 'server'
    ).run();
  } catch { /* audit must never fail stock movement */ }
}

/** Kill switch: absent or anything-but-'1' means OFF. Never throws. */
export async function stockEnabled(env) {
  try {
    if (!env || !env.DB || typeof env.DB.prepare !== 'function') return false;
    const row = await env.DB.prepare("SELECT value FROM stock_meta WHERE key = 'enabled'").first();
    return !!row && row.value === '1';
  } catch {
    return false; // cold DB (no tables yet) reads as disabled — hooks no-op, zero DDL
  }
}

export async function setStockEnabled(env, on) {
  await ensureStockTables(env);
  await env.DB.prepare(
    "INSERT INTO stock_meta (key, value) VALUES ('enabled', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).bind(on ? '1' : '0').run();
  return { ok: true, enabled: !!on };
}

/** Derived balance for one lot. Pure read — the ledger is the source of truth. */
export async function lotBalance(env, lotId) {
  const { results } = await env.DB.prepare(
    'SELECT kind, COALESCE(SUM(qty), 0) AS t FROM stock_movements WHERE lot_id = ? GROUP BY kind'
  ).bind(lotId).all();
  const sums = { RECEIPT: 0, RESERVE: 0, RELEASE: 0, ISSUE: 0, ADJUST: 0 };
  for (const r of results || []) {
    if (Object.prototype.hasOwnProperty.call(sums, r.kind)) sums[r.kind] = Number(r.t) || 0;
  }
  const outstanding = sums.RESERVE - sums.RELEASE;
  const available = sums.RECEIPT + sums.ADJUST - sums.ISSUE - outstanding;
  return { ...sums, outstanding, available };
}

/** Outstanding hold for one (lot, buy ref). Non-positive can never occur on a
 *  healthy ledger; callers treat <= 0 as "nothing held". */
export async function outstandingForRef(env, lotId, buyOrderId, buyLineIdx) {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(CASE WHEN kind = 'RESERVE' THEN qty WHEN kind = 'RELEASE' THEN -qty ELSE 0 END), 0) AS o
       FROM stock_movements WHERE lot_id = ? AND ref_buy_order = ? AND ref_buy_line = ?`
  ).bind(lotId, buyOrderId, buyLineIdx).first();
  return Number((row && row.o) || 0);
}

async function getLot(env, sellOrderId, sellLineIdx) {
  return env.DB.prepare(
    'SELECT * FROM stock_lots WHERE sell_order_id = ? AND sell_line_idx = ?'
  ).bind(sellOrderId, sellLineIdx).first();
}

async function writeMovement(env, { lotId, kind, qty, refBuyOrder = null, refBuyLine = null, actor = 'system', reason = null }) {
  const id = uid();
  const at = nowIso();
  await env.DB.prepare(
    'INSERT INTO stock_movements (id, lot_id, kind, qty, ref_buy_order, ref_buy_line, actor, reason, at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)'
  ).bind(id, lotId, kind, qty, refBuyOrder, buyLineNum(refBuyLine), String(actor || 'system').slice(0, 254), reason ? String(reason).slice(0, 500) : null, at).run();
  return { id, at };
}

function buyLineNum(v) {
  return Number.isInteger(v) ? v : null;
}

/**
 * Matchable lines for one order's product list. Deliberately LOCAL rather
 * than imported from match.js `indexLinesFor`: that module's extensionless
 * `./intake/auth` import resolves on Workers but NOT under node ESM, and this
 * ledger must stay loadable by the Node harness verbatim. The normalization
 * is identical by construction (trim → UPPER → 200-char cap; blank lines
 * skipped) — if match.js ever changes its key, this comment names the two
 * places to reconcile.
 */
function stockLinesFor(products) {
  const fold = (v) => String(v ?? '').trim().toUpperCase();
  const out = [];
  (Array.isArray(products) ? products : []).forEach((p, lineIdx) => {
    const name = fold(p && p.category);
    const model = fold(p && p.details);
    if (!name || !model) return;
    out.push({
      line_idx: lineIdx,
      norm_name: name.slice(0, 200),
      norm_model: model.slice(0, 200),
      raw_cat: String((p && p.category) ?? '').slice(0, 200),
      raw_det: String((p && p.details) ?? '').slice(0, 200),
      qty: Number(p.quantity) || 1
    });
  });
  return out;
}

/**
 * SELL DEAL → RECEIPT. One lot per sell line; re-firing for the same
 * (order, line) returns the existing lot without double-receiving, so deal
 * webhooks and backfills are safe to retry.
 */
export async function receiveSellOrder(env, { orderId, products = [], actor = 'system' } = {}) {
  if (!await stockEnabled(env)) return { ok: false, reason: 'DISABLED' };
  if (!orderId || typeof orderId !== 'string') return { ok: false, reason: 'BAD_INPUT' };
  await ensureStockTables(env);
  const lines = stockLinesFor(products);
  const lots = [];
  let received = 0;
  let existing = 0;
  for (const ln of lines) {
    const prior = await env.DB.prepare(
      'SELECT id FROM stock_lots WHERE sell_order_id = ? AND sell_line_idx = ?'
    ).bind(orderId, ln.line_idx).first();
    if (prior) {
      existing += 1;
      lots.push({ lotId: prior.id, received: 0, existing: true });
      continue;
    }
    const lotId = uid();
    const at = nowIso();
    await env.DB.prepare(
      `INSERT INTO stock_lots (id, sell_order_id, sell_line_idx, norm_name, norm_model, raw_cat, raw_det, qty_total, status, created_at, closed_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'OPEN',?9,NULL)`
    ).bind(lotId, orderId, ln.line_idx, ln.norm_name, ln.norm_model, ln.raw_cat, ln.raw_det, ln.qty, at).run();
    await writeMovement(env, { lotId, kind: KIND_RECEIPT, qty: ln.qty, actor, reason: `sell_deal:${orderId}` });
    received += 1;
    lots.push({ lotId, received: ln.qty, existing: false });
  }
  try {
    await auditStock(env, 'STOCK_RECEIPT', { orderId, received, existing }, actor);
  } catch {}
  return { ok: true, received, existing, lots };
}

/**
 * Candidate accept → RESERVE. Soft-holds `qty` units of one OPEN lot against
 * one buy line. Guarded by availability (fail-closed with the number), and
 * idempotent per outstanding (lot, ref): a re-fired accept for an already-held
 * ref returns the existing hold instead of double-holding.
 */
export async function reserveStock(env, { sellOrderId, sellLineIdx, buyOrderId, buyLineIdx, qty, actor = 'system' } = {}) {
  if (!await stockEnabled(env)) return { ok: false, reason: 'DISABLED' };
  if (!sellOrderId || !Number.isInteger(sellLineIdx) || !buyOrderId || !Number.isInteger(buyLineIdx)) {
    return { ok: false, reason: 'BAD_INPUT' };
  }
  if (!posInt(qty)) return { ok: false, reason: 'BAD_QTY' };
  await ensureStockTables(env);
  const lot = await getLot(env, sellOrderId, sellLineIdx);
  if (!lot) return { ok: false, reason: 'LOT_NOT_FOUND' };
  if (lot.status !== LOT_OPEN) return { ok: false, reason: 'LOT_NOT_OPEN' };
  const held = await outstandingForRef(env, lot.id, buyOrderId, buyLineIdx);
  if (held > 0) {
    return { ok: true, lotId: lot.id, reserved: held, duplicate: true };
  }
  const bal = await lotBalance(env, lot.id);
  if (qty > bal.available) {
    return { ok: false, reason: 'INSUFFICIENT_AVAILABLE', available: bal.available, requested: qty };
  }
  const mv = await writeMovement(env, {
    lotId: lot.id, kind: KIND_RESERVE, qty, refBuyOrder: buyOrderId, refBuyLine: buyLineIdx, actor, reason: 'candidate_accepted'
  });
  try {
    await auditStock(env, 'STOCK_RESERVE', { lotId: lot.id, buyOrderId, buyLineIdx, qty }, actor);
  } catch {}
  return { ok: true, lotId: lot.id, reserved: qty, movementId: mv.id, duplicate: false };
}

/**
 * Release a hold (withdraw / decline / manual). Defaults to the full
 * outstanding for the ref; a partial qty may be given. Never releases more
 * than is held.
 */
export async function releaseStock(env, { sellOrderId, sellLineIdx, buyOrderId, buyLineIdx, qty = null, actor = 'system', reason = 'released' } = {}) {
  if (!await stockEnabled(env)) return { ok: false, reason: 'DISABLED' };
  if (!sellOrderId || !Number.isInteger(sellLineIdx) || !buyOrderId || !Number.isInteger(buyLineIdx)) {
    return { ok: false, reason: 'BAD_INPUT' };
  }
  await ensureStockTables(env);
  const lot = await getLot(env, sellOrderId, sellLineIdx);
  if (!lot) return { ok: false, reason: 'LOT_NOT_FOUND' };
  const held = await outstandingForRef(env, lot.id, buyOrderId, buyLineIdx);
  if (held <= 0) return { ok: false, reason: 'NOTHING_RESERVED' };
  const rel = qty === null || qty === undefined ? held : qty;
  if (!posInt(rel)) return { ok: false, reason: 'BAD_QTY' };
  if (rel > held) return { ok: false, reason: 'EXCEEDS_RESERVED', outstanding: held };
  const mv = await writeMovement(env, {
    lotId: lot.id, kind: KIND_RELEASE, qty: rel, refBuyOrder: buyOrderId, refBuyLine: buyLineIdx, actor, reason
  });
  try {
    await auditStock(env, 'STOCK_RELEASE', { lotId: lot.id, buyOrderId, buyLineIdx, qty: rel, reason }, actor);
  } catch {}
  return { ok: true, lotId: lot.id, released: rel, movementId: mv.id };
}

/**
 * Release every outstanding hold for one buy order (decline/withdraw hook).
 * Iterates distinct (lot, line) refs with a positive outstanding — never
 * touches other buyers' holds.
 */
export async function releaseOrderReservations(env, { buyOrderId, actor = 'system', reason = 'order_declined' } = {}) {
  if (!await stockEnabled(env)) return { ok: false, reason: 'DISABLED' };
  if (!buyOrderId || typeof buyOrderId !== 'string') return { ok: false, reason: 'BAD_INPUT' };
  await ensureStockTables(env);
  const { results } = await env.DB.prepare(
    `SELECT lot_id, ref_buy_line,
            COALESCE(SUM(CASE WHEN kind = 'RESERVE' THEN qty WHEN kind = 'RELEASE' THEN -qty ELSE 0 END), 0) AS o
       FROM stock_movements WHERE ref_buy_order = ? GROUP BY lot_id, ref_buy_line`
  ).bind(buyOrderId).all();
  const released = [];
  for (const r of results || []) {
    if (Number(r.o) <= 0) continue;
    const mv = await writeMovement(env, {
      lotId: r.lot_id, kind: KIND_RELEASE, qty: Number(r.o), refBuyOrder: buyOrderId, refBuyLine: r.ref_buy_line, actor, reason
    });
    released.push({ lotId: r.lot_id, buyLineIdx: r.ref_buy_line, released: Number(r.o), movementId: mv.id });
  }
  if (released.length > 0) {
    try {
      await auditStock(env, 'STOCK_RELEASE', { buyOrderId, reason, released: released.length }, actor);
    } catch {}
  }
  return { ok: true, released };
}

/**
 * Issue `qty` units from one lot against one buy ref. Consumes the ref's own
 * outstanding hold first, then direct-issues any remainder from availability —
 * so a partially-reserved line still fulfills when stock allows. Reports any
 * shortfall instead of failing the host flow (hooks are best-effort).
 */
export async function issueStock(env, { sellOrderId, sellLineIdx, buyOrderId, buyLineIdx, qty, actor = 'system', reason = 'buy_deal' } = {}) {
  if (!await stockEnabled(env)) return { ok: false, reason: 'DISABLED' };
  if (!sellOrderId || !Number.isInteger(sellLineIdx) || !buyOrderId || !Number.isInteger(buyLineIdx)) {
    return { ok: false, reason: 'BAD_INPUT' };
  }
  if (!posInt(qty)) return { ok: false, reason: 'BAD_QTY' };
  await ensureStockTables(env);
  const lot = await getLot(env, sellOrderId, sellLineIdx);
  if (!lot) return { ok: false, reason: 'LOT_NOT_FOUND' };
  if (lot.status !== LOT_OPEN) return { ok: false, reason: 'LOT_NOT_OPEN' };
  const bal = await lotBalance(env, lot.id);
  const own = await outstandingForRef(env, lot.id, buyOrderId, buyLineIdx);
  const fulfillable = bal.available + own;
  if (fulfillable <= 0) {
    return { ok: false, reason: 'NO_AVAILABLE', available: bal.available };
  }
  const issuing = Math.min(qty, fulfillable);
  const consume = Math.min(own, issuing);
  if (consume > 0) {
    await writeMovement(env, {
      lotId: lot.id, kind: KIND_RELEASE, qty: consume, refBuyOrder: buyOrderId, refBuyLine: buyLineIdx, actor, reason: 'consumed_by_issue'
    });
  }
  const mv = await writeMovement(env, {
    lotId: lot.id, kind: KIND_ISSUE, qty: issuing, refBuyOrder: buyOrderId, refBuyLine: buyLineIdx, actor, reason
  });
  try {
    await auditStock(env, 'STOCK_ISSUE', { lotId: lot.id, buyOrderId, buyLineIdx, requested: qty, issued: issuing, shortfall: qty - issuing }, actor);
  } catch {}
  return { ok: true, lotId: lot.id, requested: qty, issued: issuing, shortfall: qty - issuing, movementId: mv.id };
}

/** OPEN lots for one normalized key, FIFO (oldest receipt first). */
export async function openLotsByKey(env, normName, normModel) {
  await ensureStockTables(env);
  const { results } = await env.DB.prepare(
    `SELECT * FROM stock_lots WHERE norm_name = ? AND norm_model = ? AND status = 'OPEN' ORDER BY created_at ASC, id ASC`
  ).bind(String(normName || ''), String(normModel || '')).all();
  return results || [];
}

/**
 * BUY DEAL → ISSUE. For each buy line: consume that line's reservations
 * first, then FIFO direct-issue the remainder across OPEN lots of the same
 * key. Lines with no stock anywhere report a shortfall — the deal itself is
 * never blocked (hooks are best-effort), but the shortfall is explicit and
 * audited rather than silent.
 */
export async function issueBuyOrder(env, { orderId, products = [], actor = 'system' } = {}) {
  if (!await stockEnabled(env)) return { ok: false, reason: 'DISABLED' };
  if (!orderId || typeof orderId !== 'string') return { ok: false, reason: 'BAD_INPUT' };
  await ensureStockTables(env);
  const lines = stockLinesFor(products);
  const out = [];
  let totalIssued = 0;
  let totalShortfall = 0;
  for (const ln of lines) {
    let need = ln.qty;
    let issued = 0;
    // 1) consume this line's own reservations, oldest lot first
    const { results } = await env.DB.prepare(
      `SELECT DISTINCT lot_id FROM stock_movements WHERE ref_buy_order = ? AND ref_buy_line = ?`
    ).bind(orderId, ln.line_idx).all();
    for (const r of results || []) {
      if (need <= 0) break;
      const lot = await env.DB.prepare('SELECT * FROM stock_lots WHERE id = ?').bind(r.lot_id).first();
      if (!lot || lot.status !== LOT_OPEN) continue;
      if (lot.norm_name !== ln.norm_name || lot.norm_model !== ln.norm_model) continue;
      const res = await issueStock(env, {
        sellOrderId: lot.sell_order_id, sellLineIdx: lot.sell_line_idx,
        buyOrderId: orderId, buyLineIdx: ln.line_idx, qty: need, actor, reason: 'buy_deal'
      });
      if (res.ok) {
        issued += res.issued;
        need -= res.issued;
      }
    }
    // 2) FIFO direct-issue any remainder across OPEN lots of the same key
    if (need > 0) {
      const lots = await openLotsByKey(env, ln.norm_name, ln.norm_model);
      for (const lot of lots) {
        if (need <= 0) break;
        const res = await issueStock(env, {
          sellOrderId: lot.sell_order_id, sellLineIdx: lot.sell_line_idx,
          buyOrderId: orderId, buyLineIdx: ln.line_idx, qty: need, actor, reason: 'buy_deal'
        });
        if (res.ok) {
          issued += res.issued;
          need -= res.issued;
        }
      }
    }
    out.push({ buyLineIdx: ln.line_idx, requested: ln.qty, issued, shortfall: need });
    totalIssued += issued;
    totalShortfall += need;
  }
  return { ok: true, lines: out, totalIssued, totalShortfall };
}

/**
 * Order deleted → VOID. Open lots of the sell order are closed and every
 * outstanding hold is auto-released (reason `lot_voided`) so the ledger stays
 * balanced; closed lots accept no further movements and vanish from
 * availability. Idempotent: re-voiding finds no OPEN lots.
 */
export async function voidSellOrder(env, { sellOrderId, actor = 'system', reason = 'order_deleted' } = {}) {
  if (!await stockEnabled(env)) return { ok: false, reason: 'DISABLED' };
  if (!sellOrderId || typeof sellOrderId !== 'string') return { ok: false, reason: 'BAD_INPUT' };
  await ensureStockTables(env);
  const { results } = await env.DB.prepare(
    "SELECT * FROM stock_lots WHERE sell_order_id = ? AND status = 'OPEN'"
  ).bind(sellOrderId).all();
  const at = nowIso();
  const voided = [];
  for (const lot of results || []) {
    const { results: refs } = await env.DB.prepare(
      `SELECT ref_buy_order, ref_buy_line,
              COALESCE(SUM(CASE WHEN kind = 'RESERVE' THEN qty WHEN kind = 'RELEASE' THEN -qty ELSE 0 END), 0) AS o
         FROM stock_movements WHERE lot_id = ? GROUP BY ref_buy_order, ref_buy_line`
    ).bind(lot.id).all();
    for (const r of refs || []) {
      if (Number(r.o) <= 0 || !r.ref_buy_order) continue;
      await writeMovement(env, {
        lotId: lot.id, kind: KIND_RELEASE, qty: Number(r.o),
        refBuyOrder: r.ref_buy_order, refBuyLine: r.ref_buy_line, actor, reason: 'lot_voided'
      });
    }
    await env.DB.prepare("UPDATE stock_lots SET status = 'VOID', closed_at = ? WHERE id = ?").bind(at, lot.id).run();
    voided.push(lot.id);
  }
  if (voided.length > 0) {
    try {
      await auditStock(env, 'STOCK_VOID', { sellOrderId, reason, voided: voided.length }, actor);
    } catch {}
  }
  return { ok: true, voided };
}

/**
 * Manual correction (recount, damage, found stock). Signed delta with a
 * mandatory reason; fail-closed so an adjustment can never drive a lot
 * negative — receive first, then write down.
 */
export async function adjustStock(env, { sellOrderId, sellLineIdx, delta, actor = 'system', reason = '' } = {}) {
  if (!await stockEnabled(env)) return { ok: false, reason: 'DISABLED' };
  if (!sellOrderId || !Number.isInteger(sellLineIdx)) return { ok: false, reason: 'BAD_INPUT' };
  if (!Number.isInteger(delta) || delta === 0) return { ok: false, reason: 'BAD_QTY' };
  if (!String(reason || '').trim()) return { ok: false, reason: 'REASON_REQUIRED' };
  await ensureStockTables(env);
  const lot = await getLot(env, sellOrderId, sellLineIdx);
  if (!lot) return { ok: false, reason: 'LOT_NOT_FOUND' };
  if (lot.status !== LOT_OPEN) return { ok: false, reason: 'LOT_NOT_OPEN' };
  const bal = await lotBalance(env, lot.id);
  if (bal.available + delta < 0) {
    return { ok: false, reason: 'WOULD_GO_NEGATIVE', available: bal.available };
  }
  const mv = await writeMovement(env, {
    lotId: lot.id, kind: KIND_ADJUST, qty: delta, actor, reason: String(reason).slice(0, 500)
  });
  try {
    await auditStock(env, 'STOCK_ADJUST', { lotId: lot.id, delta, reason }, actor);
  } catch {}
  return { ok: true, lotId: lot.id, delta, available: bal.available + delta, movementId: mv.id };
}

/* ── Readers (parallel availability layer — the matcher itself is untouched) */

/** Availability aggregated by normalized key across OPEN lots. Zero-stock keys
 *  are noise on a stock board, so they are excluded unless asked for. */
export async function availableByKey(env, { includeEmpty = false, limit = 500 } = {}) {
  await ensureStockTables(env);
  const cap = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 2000) : 500;
  const { results } = await env.DB.prepare(
    `SELECT l.norm_name AS norm_name, l.norm_model AS norm_model,
            COUNT(DISTINCT l.id) AS lots,
            COALESCE(SUM(CASE WHEN m.kind = 'RECEIPT' THEN m.qty
                              WHEN m.kind = 'ADJUST' THEN m.qty
                              WHEN m.kind = 'ISSUE' THEN -m.qty
                              WHEN m.kind = 'RESERVE' THEN -m.qty
                              WHEN m.kind = 'RELEASE' THEN m.qty ELSE 0 END), 0) AS available,
            COALESCE(SUM(CASE WHEN m.kind = 'RECEIPT' THEN m.qty ELSE 0 END), 0) AS received
       FROM stock_lots l LEFT JOIN stock_movements m ON m.lot_id = l.id
      WHERE l.status = 'OPEN'
      GROUP BY l.norm_name, l.norm_model
      ORDER BY available DESC
      LIMIT ?`
  ).bind(cap).all();
  const rows = results || [];
  return includeEmpty ? rows : rows.filter((r) => Number(r.available) > 0);
}

/** Full ledger for one lot (newest last — the ledger reads as a story), or
 *  every movement touching one buy order. Paged, capped. */
export async function movementsFor(env, { lotId = null, buyOrderId = null, limit = 200 } = {}) {
  await ensureStockTables(env);
  const cap = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 1000) : 200;
  if (lotId) {
    const { results } = await env.DB.prepare(
      'SELECT * FROM stock_movements WHERE lot_id = ? ORDER BY at ASC, id ASC LIMIT ?'
    ).bind(String(lotId), cap).all();
    return results || [];
  }
  if (buyOrderId) {
    const { results } = await env.DB.prepare(
      'SELECT * FROM stock_movements WHERE ref_buy_order = ? ORDER BY at ASC, id ASC LIMIT ?'
    ).bind(String(buyOrderId), cap).all();
    return results || [];
  }
  return [];
}

/** Outstanding holds for one buy order, with their lots attached. */
export async function reservationsForBuy(env, buyOrderId) {
  await ensureStockTables(env);
  const { results } = await env.DB.prepare(
    `SELECT m.lot_id AS lot_id, m.ref_buy_line AS buy_line_idx, l.sell_order_id AS sell_order_id,
            l.sell_line_idx AS sell_line_idx, l.raw_cat AS raw_cat, l.raw_det AS raw_det,
            COALESCE(SUM(CASE WHEN m.kind = 'RESERVE' THEN m.qty WHEN m.kind = 'RELEASE' THEN -m.qty ELSE 0 END), 0) AS outstanding
       FROM stock_movements m JOIN stock_lots l ON l.id = m.lot_id
      WHERE m.ref_buy_order = ? AND l.status = 'OPEN'
      GROUP BY m.lot_id, m.ref_buy_line, l.sell_order_id, l.sell_line_idx, l.raw_cat, l.raw_det`
  ).bind(String(buyOrderId)).all();
  return (results || []).filter((r) => Number(r.outstanding) > 0);
}

/** OPEN lots for one sell order, each with its derived balance. */
export async function lotsForSellOrder(env, sellOrderId) {
  await ensureStockTables(env);
  const { results } = await env.DB.prepare(
    'SELECT * FROM stock_lots WHERE sell_order_id = ? ORDER BY sell_line_idx ASC'
  ).bind(String(sellOrderId)).all();
  const out = [];
  for (const lot of results || []) {
    out.push({ ...lot, balance: await lotBalance(env, lot.id) });
  }
  return out;
}
