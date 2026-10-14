import { verifySession } from './intake/auth';

/**
 * POST /api/match — server-side exact stock matcher (Phase 0 + Phase-1 index).
 *
 * Same semantics as the original workbench matcher, moved off the browser:
 *  - Greedy order-level claims: one BUY consumes at most one SELL and vice
 *    versa, newest orders first (matches the legacy client pass order).
 *  - Key = trim().toUpperCase() of (category, details) — case/space folded,
 *    otherwise byte-exact. Empty name/model lines never compete.
 *  - ALL product lines compete (the legacy client read only products[0]).
 *
 * Scaling posture (Phase 1: persisted per-line index on D1):
 *  - match_lines mirrors every order's matchable lines (maintained by returns
 *    POST with compensation, purged by returns DELETE, backfilled by the
 *    admin backfill action). match_meta.ready gates the indexed path; any
 *    partial state takes the legacy full scan — mixed states never silently
 *    miss. PG keeps the legacy scan (documented; D1 is primary).
 *  - Indexed path: id/intent/date list (50k) + persisted lines (100k), then
 *    hydrate only rendered ids. Legacy path: ROW_SCAN_CAP full parse.
 *    Either way the response flags truncated:true instead of dying mid-scan.
 *  - Browser receives top-N pages only (limit/offset on matches AND
 *    unmatched) plus totals — never the full table.
 *
 * Auth: any authenticated session (rows carry PII); backfill is admin-only.
 * Zero npm imports.
 */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

const ROW_SCAN_CAP = 20000;
const DEFAULT_PAGE = 100;
const MAX_PAGE = 500;

const norm = (v) => String(v ?? '').trim().toUpperCase();
const lineKeyOf = (p) => {
  const name = norm(p && p.category);
  const model = norm(p && p.details);
  if (!name || !model) return null;
  return `${name}\x00${model}`;
};

function serializeOrder(row, products) {
  return {
    id: row.id,
    intent: row.intent,
    name: row.name,
    company: row.company ?? null,
    email: row.email,
    phone: row.phone ?? null,
    products,
    date: row.date,
    status: row.status,
    pricingBasis: row.pricingBasis === 'lot' ? 'lot' : 'per_product',
    lotConsiderationPaise: Number.isInteger(row.lotConsiderationPaise) ? row.lotConsiderationPaise : null
  };
}

function parseProducts(raw) {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// Pure greedy core: buy order ids in priority order, line inputs keyed by
// order, seller queues keyed by match key. Returns id-level pairs + the
// matched set. Both the legacy full-scan path and the persisted-index path
// below run through this one function — identical claims either way.
export function greedyMatchCore(buyIds, linesByOrder, sellQueues) {
  const matchedIds = new Set();
  const pairs = [];
  for (const buyId of buyIds) {
    if (matchedIds.has(buyId)) continue;
    const lines = linesByOrder.get(buyId) || [];
    for (const ln of lines) {
      if (!ln.key) continue;
      const q = sellQueues.get(ln.key);
      if (!q) continue;
      let claim = null;
      while (q.length > 0) {
        const cand = q.shift();
        if (!matchedIds.has(cand.orderId)) {
          claim = cand;
          break;
        }
      }
      if (!claim) continue;
      matchedIds.add(buyId);
      matchedIds.add(claim.orderId);
      pairs.push({
        buyId,
        sellId: claim.orderId,
        productName: ln.rawCat,
        modelNumber: ln.rawDet,
        buyerQty: ln.qty,
        sellerQty: claim.qty
      });
      break; // one claim per BUY order
    }
  }
  return { pairs, matchedIds };
}

function lineInput(p, lineIdx) {
  const name = norm(p && p.category);
  const model = norm(p && p.details);
  if (!name || !model) return null;
  return {
    key: `${name}\x00${model}`,
    qty: Number(p.quantity) || 1,
    rawCat: p.category,
    rawDet: p.details,
    lineIdx
  };
}

// Pure matcher: orders in (already deterministic order), pages out.
// Exported for tests; the handler only supplies rows + paging.
export function runMatchPass(orders, { limit, offset, unmatchedLimit, unmatchedOffset }) {
  const buys = [];
  const linesByOrder = new Map();
  const sellQueues = new Map(); // key -> [{ orderId, qty, rawCat, rawDet }] in scan order
  for (const o of orders) {
    const side = String(o.intent || '').toLowerCase();
    if (side !== 'buy' && side !== 'sell') continue;
    const inputs = [];
    (o.products || []).forEach((p, lineIdx) => {
      const ln = lineInput(p, lineIdx);
      if (ln) inputs.push(ln);
    });
    linesByOrder.set(o.id, inputs);
    if (side === 'buy') {
      buys.push(o.id);
    } else {
      for (const ln of inputs) {
        const q = sellQueues.get(ln.key) || [];
        q.push({ orderId: o.id, qty: ln.qty, rawCat: ln.rawCat, rawDet: ln.rawDet });
        sellQueues.set(ln.key, q);
      }
    }
  }

  const now = new Date().toISOString();
  const { pairs, matchedIds } = greedyMatchCore(buys, linesByOrder, sellQueues);
  const byId = new Map(orders.map((o) => [o.id, o]));
  const matches = pairs.map((pr) => ({
    id: `match-${pr.buyId}-${pr.sellId}`,
    buyer: byId.get(pr.buyId),
    seller: byId.get(pr.sellId),
    productName: pr.productName,
    modelNumber: pr.modelNumber,
    buyerQty: pr.buyerQty,
    sellerQty: pr.sellerQty,
    timestamp: now
  }));

  const unmatched = orders.filter((o) => !matchedIds.has(o.id));
  return {
    matches: matches.slice(offset, offset + limit),
    totalMatches: matches.length,
    unmatched: unmatched.slice(unmatchedOffset, unmatchedOffset + unmatchedLimit),
    totalUnmatched: unmatched.length
  };
}

// ── Persistent per-line index (Phase 1) ──
// match_lines mirrors every order's matchable lines so matching never parses
// product JSON at query time. Maintained synchronously by returns POST (with
// compensation) and purged by returns DELETE; legacy rows arrive via the
// admin backfill below. match_meta.ready gates the indexed path — mixed
// states (some orders indexed, some not) always take the legacy full scan,
// so partial adoption can never silently miss.
export async function ensureMatchTables(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS match_lines (
      order_id TEXT NOT NULL,
      line_idx INTEGER NOT NULL,
      side TEXT NOT NULL,
      norm_name TEXT NOT NULL,
      norm_model TEXT NOT NULL,
      raw_cat TEXT NOT NULL,
      raw_det TEXT NOT NULL,
      qty INTEGER NOT NULL,
      ask_paise INTEGER,
      PRIMARY KEY (order_id, line_idx)
    )`
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_match_lines_key ON match_lines(side, norm_name, norm_model)'
  ).run();
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS match_meta (key TEXT PRIMARY KEY, value TEXT)'
  ).run();
}

async function matchIndexReady(env) {
  try {
    const row = await env.DB.prepare("SELECT value FROM match_meta WHERE key = 'ready'").bind().first();
    return !!row && row.value === '1';
  } catch {
    return false;
  }
}

// Line inputs for one order (shared by returns POST maintenance, backfill,
// and tests). Same normalization as the matcher — one definition, no drift.
export function indexLinesFor(order) {
  const side = String(order.intent || '').toLowerCase();
  if (side !== 'buy' && side !== 'sell') return [];
  const lot = order.pricingBasis === 'lot';
  const out = [];
  (order.products || []).forEach((p, lineIdx) => {
    const name = norm(p && p.category);
    const model = norm(p && p.details);
    if (!name || !model) return;
    out.push({
      order_id: order.id,
      line_idx: lineIdx,
      side,
      norm_name: name.slice(0, 200),
      norm_model: model.slice(0, 200),
      raw_cat: String((p && p.category) ?? '').slice(0, 200),
      raw_det: String((p && p.details) ?? '').slice(0, 200),
      qty: Number(p.quantity) || 1,
      ask_paise: !lot && Number.isInteger(p.lineConsiderationPaise) && p.lineConsiderationPaise >= 0 ? p.lineConsiderationPaise : null
    });
  });
  return out;
}

// Indexed pass, split for hydration: build inputs → id-level core → attach
// full orders only for the ids the pages reference.
export function buildIndexedInputs(orderMeta, indexRows) {
  const sideOf = new Map(orderMeta.map((m) => [m.id, String(m.intent || '').toLowerCase()]));
  const linesByOrder = new Map();
  const sellQueues = new Map();
  for (const r of indexRows) {
    const side = sideOf.get(r.order_id);
    if (!side || (side !== 'buy' && side !== 'sell')) continue;
    if (r.side !== side) continue; // index/intent drift guard
    const ln = { key: `${r.norm_name}\x00${r.norm_model}`, qty: r.qty, rawCat: r.raw_cat, rawDet: r.raw_det };
    if (!linesByOrder.has(r.order_id)) linesByOrder.set(r.order_id, []);
    linesByOrder.get(r.order_id).push(ln);
    if (side === 'sell') {
      const q = sellQueues.get(ln.key) || [];
      q.push({ orderId: r.order_id, qty: ln.qty, rawCat: ln.rawCat, rawDet: ln.rawDet });
      sellQueues.set(ln.key, q);
    }
  }
  const buys = orderMeta.filter((m) => sideOf.get(m.id) === 'buy').map((m) => m.id);
  const metaIds = orderMeta.map((m) => m.id);
  return { buys, linesByOrder, sellQueues, metaIds };
}

export function attachIndexedPage(pairs, matchedIds, metaIds, fullById, { limit, offset, unmatchedLimit, unmatchedOffset }) {
  const now = new Date().toISOString();
  const matches = [];
  for (const pr of pairs) {
    const buyer = fullById.get(pr.buyId);
    const seller = fullById.get(pr.sellId);
    if (!buyer || !seller) continue; // hydration miss — drop, never half-render
    matches.push({
      id: `match-${pr.buyId}-${pr.sellId}`,
      buyer, seller,
      productName: pr.productName,
      modelNumber: pr.modelNumber,
      buyerQty: pr.buyerQty,
      sellerQty: pr.sellerQty,
      timestamp: now
    });
  }
  const unmatchedIds = metaIds.filter((id) => !matchedIds.has(id));
  return {
    matches: matches.slice(offset, offset + limit),
    totalMatches: pairs.length,
    unmatched: unmatchedIds.slice(unmatchedOffset, unmatchedOffset + unmatchedLimit).map((id) => fullById.get(id)).filter(Boolean),
    totalUnmatched: unmatchedIds.length
  };
}

// Legacy-compatible wrapper (same paging shape): full pass with hydration
// for every id (small-scale correctness path + tests).
export function runMatchPassIndexed(orderMeta, indexRows, fullById, paging) {
  const { buys, linesByOrder, sellQueues, metaIds } = buildIndexedInputs(orderMeta, indexRows);
  const { pairs, matchedIds } = greedyMatchCore(buys, linesByOrder, sellQueues);
  return attachIndexedPage(pairs, matchedIds, metaIds, fullById, paging);
}

async function hydrateOrders(env, ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const placeholders = chunk.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT id, intent, name, company, email, phone, products, date, status, pricingBasis, lotConsiderationPaise FROM returns WHERE id IN (${placeholders})`
    ).bind(...chunk).all();
    for (const row of results || []) {
      out.set(row.id, serializeOrder(row, parseProducts(row.products)));
    }
  }
  return out;
}

function pageParams(body) {
  const num = (v, dflt, max) => {
    if (v === 0) return 0; // page size 0 = totals only, no rows (per-pane paging)
    const n = parseInt(v, 10);
    if (!Number.isInteger(n) || n < 0) return dflt;
    return Math.min(n, max);
  };
  const limit = body.limit === undefined ? DEFAULT_PAGE : num(body.limit, DEFAULT_PAGE, MAX_PAGE);
  const offset = body.offset === undefined ? 0 : num(body.offset, 0, 1000000);
  const unmatchedLimit = body.unmatchedLimit === undefined ? DEFAULT_PAGE : num(body.unmatchedLimit, DEFAULT_PAGE, MAX_PAGE);
  const unmatchedOffset = body.unmatchedOffset === undefined ? 0 : num(body.unmatchedOffset, 0, 1000000);
  return { limit, offset, unmatchedLimit, unmatchedOffset };
}

export async function onRequestPost({ request, env }) {
  try {
    const user = await verifySession(env, request);
    if (!user) {
      return json({ success: false, message: 'Unauthorized' }, 401);
    }

    let body = {};
    try {
      body = await request.json() || {};
    } catch {
      return json({ success: false, message: 'Invalid request body' }, 400);
    }
    const { limit, offset, unmatchedLimit, unmatchedOffset } = pageParams(body);
    const action = !body.action || body.action === 'match' ? 'match' : String(body.action);
    const ALLOWED_ACTIONS = new Set(['match', 'backfill', 'candidates', 'accept', 'candidates-backfill', 'candidates-flag']);
    if (!ALLOWED_ACTIONS.has(action)) {
      return json({ success: false, message: 'Unknown action.' }, 400);
    }

    // ── candidates (read): cached best-match suggestions for BUY order(s).
    // Read-only and cache-only — this path NEVER calls a model. Any session may
    // read (candidates carry no price; the order rows themselves carry PII and
    // are already auth-gated). ──
    if (action === 'candidates') {
      if (!env.DB || typeof env.DB.prepare !== 'function') {
        return json({ success: false, message: 'Returns database is not attached.' }, 503);
      }
      const { readCandidates } = await import('./matching/ranker.js');
      const ids = Array.isArray(body.buyOrderIds)
        ? body.buyOrderIds.slice(0, 200).filter((x) => typeof x === 'string' && x)
        : (typeof body.buyOrderId === 'string' && body.buyOrderId ? [body.buyOrderId] : []);
      if (ids.length === 0) return json({ success: true, results: {} });
      if (ids.length === 1) {
        const one = await readCandidates(env, { buyOrderId: ids[0] });
        // notBuy is a definitive answer, not an empty list: it tells the panel
        // to render nothing at all rather than "no comparable stock", which
        // would be a false statement about a SELL request.
        return json({ success: true, ...one });
      }
      const results = {};
      for (const id of ids) results[id] = await readCandidates(env, { buyOrderId: id });
      return json({ success: true, results });
    }

    // ── candidates-backfill (admin): regenerate the candidate cache for BUY
    // orders. With `buyOrderId` → regenerate just that order (dashboard
    // "Regenerate” button); without → sweep every BUY order (after a SELL-book
    // change makes caches stale). ──
    if (action === 'candidates-backfill') {
      if (user.role !== 'admin' && user.email !== 'admin@netamps.com') {
        return json({ success: false, message: 'Forbidden' }, 403);
      }
      if (!env.DB || typeof env.DB.prepare !== 'function') {
        return json({ success: false, message: 'Returns database is not attached.' }, 503);
      }
      const { generateCandidatesForOrder, sellBookVersion } = await import('./matching/ranker.js');

      // Single-order regenerate: explicit admin action, run inline so the
      // refresh immediately after has fresh data to render.
      const one = typeof body.buyOrderId === 'string' && body.buyOrderId ? body.buyOrderId : null;
      if (one) {
        const summary = await generateCandidatesForOrder(env, { requestId: one });
        return json({ success: true, orderId: one, summary, sellBookVersion: await sellBookVersion(env) });
      }

      const { results } = await env.DB
        .prepare("SELECT id FROM returns WHERE LOWER(intent) = 'buy' ORDER BY date DESC LIMIT 500")
        .all();
      let processed = 0;
      for (const row of results || []) {
        await generateCandidatesForOrder(env, { requestId: row.id });
        processed++;
      }
      return json({ success: true, processed, sellBookVersion: await sellBookVersion(env) });
    }

    // ── candidates-flag (admin): read or set the best-match kill switch.
    // The ranker's `candidates_enabled` gate, flipped without a deploy. Absent
    // `enabled` → read current state. This is the deliberate "internal first"
    // switch: ON runs the deterministic blocking + LLM re-rank and renders the
    // advisory panel; OFF (default) leaves the feature dark. ──
    if (action === 'candidates-flag') {
      if (user.role !== 'admin' && user.email !== 'admin@netamps.com') {
        return json({ success: false, message: 'Forbidden' }, 403);
      }
      if (!env.DB || typeof env.DB.prepare !== 'function') {
        return json({ success: false, message: 'Returns database is not attached.' }, 503);
      }
      await ensureMatchTables(env);
      if (body.enabled === undefined || body.enabled === null) {
        const row = await env.DB
          .prepare("SELECT value FROM match_meta WHERE key = 'candidates_enabled'")
          .bind()
          .first();
        return json({ success: true, candidatesEnabled: !!row && row.value === '1' });
      }
      if (typeof body.enabled !== 'boolean') {
        return json({ success: false, message: '`enabled` must be a boolean.' }, 400);
      }
      await env.DB
        .prepare("INSERT INTO match_meta (key, value) VALUES ('candidates_enabled', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .bind(body.enabled ? '1' : '0')
        .run();
      return json({ success: true, candidatesEnabled: body.enabled });
    }

    // ── accept (admin): a human accepts a candidate as a real match. The only
    // path that writes match_lines, and it reuses the existing exact-match
    // semantics (aligns the BUY key to the SELL key). Audited. ──
    if (action === 'accept') {
      if (user.role !== 'admin' && user.email !== 'admin@netamps.com') {
        return json({ success: false, message: 'Forbidden' }, 403);
      }
      if (!env.DB || typeof env.DB.prepare !== 'function') {
        return json({ success: false, message: 'Returns database is not attached.' }, 503);
      }
      const { acceptCandidate } = await import('./matching/ranker.js');
      const toInt = (v) => (Number.isInteger(v) ? v : (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : NaN));
      const r = await acceptCandidate(env, {
        buyOrderId: body.buyOrderId,
        buyLineIdx: toInt(body.buyLineIdx),
        sellOrderId: body.sellOrderId,
        sellLineIdx: toInt(body.sellLineIdx),
        actor: user.email || 'unknown'
      });
      if (!r.ok) return json({ success: false, message: r.reason || 'Accept failed.' }, 400);
      return json({ success: true });
    }

    // ── backfill (admin): rebuild the line index from stored orders ──
    // Paged, idempotent (DELETE + INSERT per order repairs drift), audited.
    // Sets match_meta.ready only after a complete pass — partial runs leave
    // the legacy path in force, never a half-index.
    if (action === 'backfill') {
      if (!user || (user.role !== 'admin' && user.email !== 'admin@netamps.com')) {
        return json({ success: false, message: 'Forbidden' }, 403);
      }
      if (!env.DB || typeof env.DB.prepare !== 'function') {
        return json({ success: false, message: 'Returns database is not attached.' }, 503);
      }
      await ensureMatchTables(env);
      const PAGE = 1000;
      const MAX_ORDERS = 200000;
      let scanned = 0;
      let backfilledOrders = 0;
      let backfilledLines = 0;
      let complete = true;
      for (let off = 0; ; off += PAGE) {
        if (scanned >= MAX_ORDERS) {
          complete = false;
          break;
        }
        const { results } = await env.DB.prepare(
          'SELECT id, intent, products, pricingBasis FROM returns ORDER BY date ASC LIMIT ? OFFSET ?'
        ).bind(PAGE, off).all();
        const rows = results || [];
        if (rows.length === 0) break;
        scanned += rows.length;
        for (const row of rows) {
          let products = [];
          try {
            products = JSON.parse(row.products || '[]');
            if (!Array.isArray(products)) products = [];
          } catch {
            products = [];
          }
          const lines = indexLinesFor({ id: row.id, intent: row.intent, products, pricingBasis: row.pricingBasis });
          await env.DB.prepare('DELETE FROM match_lines WHERE order_id = ?').bind(row.id).run();
          for (const ln of lines) {
            await env.DB.prepare(
              'INSERT INTO match_lines (order_id, line_idx, side, norm_name, norm_model, raw_cat, raw_det, qty, ask_paise) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)'
            ).bind(ln.order_id, ln.line_idx, ln.side, ln.norm_name, ln.norm_model, ln.raw_cat, ln.raw_det, ln.qty, ln.ask_paise).run();
          }
          backfilledOrders += 1;
          backfilledLines += lines.length;
        }
        if (rows.length < PAGE) break;
      }
      if (complete) {
        await env.DB.prepare("INSERT INTO match_meta (key, value) VALUES ('ready', '1') ON CONFLICT(key) DO UPDATE SET value='1'").run();
      }
      try {
        await env.DB.prepare(
          'CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, timestamp TEXT, event_type TEXT, page TEXT, details TEXT, username TEXT, ip_address TEXT)'
        ).run();
        await env.DB.prepare(
          'INSERT INTO audit_logs (id, timestamp, event_type, page, details, username, ip_address) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
        ).bind(
          crypto.randomUUID(), new Date().toISOString(), 'MATCH_BACKFILL', 'Stock Match Overview',
          JSON.stringify({ backfilledOrders, backfilledLines, complete }), String(user.email || 'unknown').slice(0, 254), 'server'
        ).run();
      } catch {}
      return json({ success: true, backfilledOrders, backfilledLines, complete });
    }

    if (env.DB && typeof env.DB.prepare === 'function') {
      try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_returns_intent ON returns(intent)').run(); } catch {}
      await ensureMatchTables(env);

      // Indexed fast path: id/intent/date list + persisted lines, then
      // hydrate only the ids the pages reference. Caps bound one worker
      // pass; truncation is flagged, never silent.
      if (await matchIndexReady(env)) {
        const ORDER_ID_CAP = 50000;
        const LINE_CAP = 100000;
        const metaRes = await env.DB.prepare('SELECT id, intent, date FROM returns ORDER BY date DESC LIMIT ?').bind(ORDER_ID_CAP).all();
        const meta = metaRes.results || [];
        const lineRes = await env.DB.prepare(
          'SELECT order_id, line_idx, side, norm_name, norm_model, raw_cat, raw_det, qty, ask_paise FROM match_lines LIMIT ?'
        ).bind(LINE_CAP).all();
        const inScope = new Set(meta.map((m) => m.id));
        const lines = (lineRes.results || []).filter((r) => inScope.has(r.order_id));
        const { buys, linesByOrder, sellQueues, metaIds } = buildIndexedInputs(meta, lines);
        const { pairs, matchedIds } = greedyMatchCore(buys, linesByOrder, sellQueues);
        // Hydration set: pair orders on this page + unmatched ids on page.
        const matchSlice = pairs.slice(offset, offset + limit);
        const unmatchedIds = metaIds.filter((id) => !matchedIds.has(id));
        const unmatchedSlice = unmatchedIds.slice(unmatchedOffset, unmatchedOffset + unmatchedLimit);
        const needIds = [...new Set([...matchSlice.flatMap((pr) => [pr.buyId, pr.sellId]), ...unmatchedSlice])];
        const fullById = await hydrateOrders(env, needIds);
        const page = attachIndexedPage(pairs, matchedIds, metaIds, fullById, { limit, offset, unmatchedLimit, unmatchedOffset });
        return json({
          success: true,
          ...page,
          indexed: true,
          truncated: meta.length >= ORDER_ID_CAP || (lineRes.results || []).length >= LINE_CAP,
          limit, offset, unmatchedLimit, unmatchedOffset
        });
      }

      const { results } = await env.DB.prepare(
        'SELECT id, intent, name, company, email, phone, products, date, status, pricingBasis, lotConsiderationPaise FROM returns ORDER BY date DESC LIMIT ?'
      ).bind(ROW_SCAN_CAP).all();
      const rows = results || [];
      const orders = rows.map((row) => serializeOrder(row, parseProducts(row.products)));
      const page = runMatchPass(orders, { limit, offset, unmatchedLimit, unmatchedOffset });
      return json({
        success: true,
        ...page,
        truncated: rows.length >= ROW_SCAN_CAP,
        limit, offset, unmatchedLimit, unmatchedOffset
      });
    }

    if (env.DATABASE_URL) {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      try {
        try { await client.query('CREATE INDEX IF NOT EXISTS idx_returns_intent ON returns(intent)'); } catch {}
        const g = (row, camel, lower) => (row[camel] !== undefined ? row[camel] : row[lower]);
        const res = await client.query(
          'SELECT id, intent, name, company, email, phone, products, date, status, pricingbasis, lotconsiderationpaise FROM returns ORDER BY date DESC LIMIT $1',
          [ROW_SCAN_CAP]
        );
        const orders = res.rows.map((row) => serializeOrder({
          id: row.id,
          intent: row.intent,
          name: row.name,
          company: row.company,
          email: row.email,
          phone: row.phone,
          date: row.date,
          status: row.status,
          pricingBasis: g(row, 'pricingBasis', 'pricingbasis'),
          lotConsiderationPaise: (() => {
            const v = g(row, 'lotConsiderationPaise', 'lotconsiderationpaise');
            return Number.isInteger(v) ? v : (Number.isInteger(Number(v)) ? Number(v) : null);
          })()
        }, parseProducts(row.products)));
        const page = runMatchPass(orders, { limit, offset, unmatchedLimit, unmatchedOffset });
        return json({
          success: true,
          ...page,
          truncated: res.rows.length >= ROW_SCAN_CAP,
          limit, offset, unmatchedLimit, unmatchedOffset
        });
      } finally {
        await client.end();
      }
    }

    return json({ success: false, message: 'Returns database is not attached.' }, 503);
  } catch (err) {
    console.error('[match] Internal error:', err);
    return json({ success: false, message: 'Matching failed. Please try again shortly.' }, 500);
  }
}
