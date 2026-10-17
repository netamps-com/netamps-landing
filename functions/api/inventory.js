/**
 * GET/POST /api/inventory — Inventory Management System (IMS) backend API.
 *
 * D1 tables (created via ensureTables, idempotent):
 *   ims_products, ims_opening_stock, ims_stock_in, ims_stock_out, ims_audit
 * Indexes on stock_in/stock_out by (sku, created_at) and txn_id.
 *
 * Auth: every GET/POST requires verifySession(env, request) -> 401 before
 * anything else. OPTIONS preflight is open. All responses use corsJson with
 * default (non-public) opts; there is no public read.
 * Writes: every statement goes through env.DB.batch(...) so all or none apply.
 * Audit: best-effort inserts into ims_audit; logging never fails a request.
 */

import { verifySession } from './intake/auth';
import { corsJson, corsPreflight } from '../_lib/cors.js';

void corsPreflight;

const MAX_SKU_LEN = 64;
const MAX_NAME_LEN = 140;
const MAX_CATEGORY_LEN = 80;
const MAX_UOM_LEN = 20;
const MAX_SUPPLIER_LEN = 140;
const MAX_REF_NOTES_LEN = 1000;

function str(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

export function clampInt(value, min, max, fallback) {
  const n = typeof value === 'number' ? value : parseInt(value, 10);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function isoNow() {
  return new Date().toISOString();
}

export function uid() {
  return crypto.randomUUID();
}

// Parse a money string/number into integer cents. Throws on non-finite or
// negative values; callers convert to 400s.
export function toCents(value) {
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error('Amount must be finite and non-negative.');
  return Math.round(n * 100);
}

function hasDb(env) {
  return !!(env && env.DB && typeof env.DB.prepare === 'function');
}

async function runBatch(env, stmts) {
  if (stmts.length === 0) return;
  if (env.DB.batch && typeof env.DB.batch === 'function') {
    await env.DB.batch(stmts);
  } else {
    for (const st of stmts) await st.run();
  }
}

const BALANCE_SQL = `
SELECT p.id AS sku, p.item_name, p.category, p.uom, p.cost_price_cents,
 p.selling_price_cents, p.supplier_name, p.reorder_trigger_level,
 p.target_max_inventory, COALESCE(o.qty,0) AS opening_qty,
 COALESCE(si.total_in,0) AS total_inflow, COALESCE(so.total_out,0) AS total_outflow,
 (COALESCE(o.qty,0)+COALESCE(si.total_in,0)-COALESCE(so.total_out,0)) AS stock_on_hand,
 ((COALESCE(o.qty,0)+COALESCE(si.total_in,0)-COALESCE(so.total_out,0)) * p.cost_price_cents) AS stock_value_cents,
 CASE WHEN (COALESCE(o.qty,0)+COALESCE(si.total_in,0)-COALESCE(so.total_out,0)) <= p.reorder_trigger_level
      THEN 'RESTOCK REQUIRED' ELSE 'HEALTHY' END AS status
FROM ims_products p
LEFT JOIN ims_opening_stock o ON o.sku=p.id
LEFT JOIN (SELECT sku, SUM(qty) AS total_in FROM ims_stock_in GROUP BY sku) si ON si.sku=p.id
LEFT JOIN (SELECT sku, SUM(qty) AS total_out FROM ims_stock_out GROUP BY sku) so ON so.sku=p.id
ORDER BY p.item_name
`.trim();

export async function ensureTables(env) {
  if (!hasDb(env)) return;
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS ims_products (id TEXT PRIMARY KEY, item_name TEXT NOT NULL, category TEXT NOT NULL, uom TEXT NOT NULL DEFAULT \'pcs\', cost_price_cents INTEGER NOT NULL DEFAULT 0, selling_price_cents INTEGER NOT NULL DEFAULT 0, supplier_name TEXT, reorder_trigger_level INTEGER NOT NULL DEFAULT 0, target_max_inventory INTEGER NOT NULL DEFAULT 0, created_at TEXT, updated_at TEXT)'
  ).run();
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS ims_opening_stock (sku TEXT PRIMARY KEY REFERENCES ims_products(id), qty INTEGER NOT NULL DEFAULT 0, updated_at TEXT)'
  ).run();
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS ims_stock_in (id TEXT PRIMARY KEY, txn_id TEXT UNIQUE NOT NULL, sku TEXT NOT NULL REFERENCES ims_products(id), qty INTEGER NOT NULL CHECK(qty > 0), unit_rate_cents INTEGER NOT NULL DEFAULT 0, ref_notes TEXT, created_at TEXT, created_by TEXT)'
  ).run();
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS ims_stock_out (id TEXT PRIMARY KEY, txn_id TEXT UNIQUE NOT NULL, sku TEXT NOT NULL REFERENCES ims_products(id), qty INTEGER NOT NULL CHECK(qty > 0), unit_rate_cents INTEGER NOT NULL DEFAULT 0, ref_notes TEXT, created_at TEXT, created_by TEXT)'
  ).run();
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS ims_audit (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, channel TEXT, status INTEGER, latency_ms INTEGER, bytes INTEGER, payload TEXT)'
  ).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ims_stock_in_sku ON ims_stock_in(sku, created_at)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ims_stock_out_sku ON ims_stock_out(sku, created_at)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ims_stock_in_txn ON ims_stock_in(txn_id)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ims_stock_out_txn ON ims_stock_out(txn_id)').run();

  // HSN columns are additive: CREATE TABLE IF NOT EXISTS will not add them to a
  // table created before HSN existed, so add them explicitly and tolerate the
  // "already there" case. A failed ALTER is not fatal — the read paths below
  // fall back to null HSN when the column is genuinely absent.
  await ensureColumn(env, 'ims_products', 'hsn_code', 'TEXT');
  await ensureColumn(env, 'ims_products', 'hsn_description', 'TEXT');
}

/** Add a column if the table exists and the column does not. Best-effort. */
async function ensureColumn(env, table, column, type) {
  if (!hasDb(env)) return;
  try {
    await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
  } catch {
    // D1 rejects the statement when the column already exists; that is the
    // expected steady state, so swallowing the error is correct here.
  }
}

/** True when ims_products actually carries the HSN columns. */
export async function hasHsnColumns(env) {
  if (!hasDb(env)) return false;
  try {
    const r = await env.DB.prepare('SELECT hsn_code FROM ims_products LIMIT 1').first();
    return r !== null && r !== undefined;
  } catch {
    return false;
  }
}

export async function readBalance(env) {
  if (!hasDb(env)) return [];
  const res = await env.DB.prepare(BALANCE_SQL).all();
  const rows = res && Array.isArray(res.results) ? res.results : [];
  return rows.map((r) => ({
    sku: typeof r.sku === 'string' ? r.sku : '',
    item_name: typeof r.item_name === 'string' ? r.item_name : '',
    category: typeof r.category === 'string' ? r.category : '',
    uom: typeof r.uom === 'string' ? r.uom : '',
    cost_price_cents: Number.isFinite(Number(r.cost_price_cents)) ? Number(r.cost_price_cents) : 0,
    selling_price_cents: Number.isFinite(Number(r.selling_price_cents)) ? Number(r.selling_price_cents) : 0,
    supplier_name: typeof r.supplier_name === 'string' ? r.supplier_name : null,
    reorder_trigger_level: Number.isFinite(Number(r.reorder_trigger_level)) ? Number(r.reorder_trigger_level) : 0,
    target_max_inventory: Number.isFinite(Number(r.target_max_inventory)) ? Number(r.target_max_inventory) : 0,
    opening_qty: Number.isFinite(Number(r.opening_qty)) ? Number(r.opening_qty) : 0,
    total_inflow: Number.isFinite(Number(r.total_inflow)) ? Number(r.total_inflow) : 0,
    total_outflow: Number.isFinite(Number(r.total_outflow)) ? Number(r.total_outflow) : 0,
    stock_on_hand: Number.isFinite(Number(r.stock_on_hand)) ? Number(r.stock_on_hand) : 0,
    stock_value_cents: Number.isFinite(Number(r.stock_value_cents)) ? Number(r.stock_value_cents) : 0,
    status: typeof r.status === 'string' ? r.status : ''
  }));
}

export async function logEvent(env, { kind, channel, status, latency_ms, bytes, payload } = {}) {
  try {
    if (!hasDb(env)) return null;
    await ensureTables(env);
    const id = uid();
    const ts = isoNow();
    const k = typeof kind === 'string' ? kind.slice(0, 64) : '';
    const ch = typeof channel === 'string' ? channel.slice(0, 200) : '';
    const st = Number.isInteger(status) ? status : null;
    const lat = Number.isInteger(latency_ms) ? latency_ms : null;
    const by = Number.isInteger(bytes)
      ? bytes
      : (typeof payload === 'string' ? new TextEncoder().encode(payload).length : 0);
    let pay = '';
    if (typeof payload === 'string') pay = payload.slice(0, 2000);
    else if (payload !== null && payload !== undefined) {
      try { pay = JSON.stringify(payload).slice(0, 2000); } catch { pay = ''; }
    }
    await env.DB.prepare(
      'INSERT INTO ims_audit (id, ts, kind, channel, status, latency_ms, bytes, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, ts, k, ch, st, lat, by, pay).run();
    return id;
  } catch {
    return null;
  }
}

function mapProductRow(r) {
  return {
    id: typeof r.id === 'string' ? r.id : '',
    item_name: typeof r.item_name === 'string' ? r.item_name : '',
    category: typeof r.category === 'string' ? r.category : '',
    uom: typeof r.uom === 'string' ? r.uom : '',
    cost_price_cents: Number.isFinite(Number(r.cost_price_cents)) ? Number(r.cost_price_cents) : 0,
    selling_price_cents: Number.isFinite(Number(r.selling_price_cents)) ? Number(r.selling_price_cents) : 0,
    supplier_name: typeof r.supplier_name === 'string' ? r.supplier_name : null,
    reorder_trigger_level: Number.isFinite(Number(r.reorder_trigger_level)) ? Number(r.reorder_trigger_level) : 0,
    target_max_inventory: Number.isFinite(Number(r.target_max_inventory)) ? Number(r.target_max_inventory) : 0,
    hsn_code: typeof r.hsn_code === 'string' && r.hsn_code ? r.hsn_code : '',
    hsn_description: typeof r.hsn_description === 'string' && r.hsn_description ? r.hsn_description : '',
    created_at: typeof r.created_at === 'string' ? r.created_at : null,
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : null
  };
}

function uniqueViolation(err) {
  const m = String((err && err.message) || err).toLowerCase();
  return m.includes('unique') || m.includes('constraint');
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return corsPreflight(request, env, {});
  }

  const user = await verifySession(env, request);
  if (!user) {
    return corsJson(request, env, { success: false, message: 'Unauthorized' }, 401);
  }

  if (!hasDb(env)) {
    return corsJson(request, env, { success: false, message: 'Database unavailable.' }, 503);
  }
  await ensureTables(env);

  if (request.method === 'GET') {
    const action = url.searchParams.get('action');

    if (action === 'balance') {
      const skus = await readBalance(env);
      return corsJson(request, env, { success: true, skus, updatedAt: isoNow() });
    }

    if (action === 'restock') {
      const rows = await readBalance(env);
      const items = rows
        .filter((r) => r.status === 'RESTOCK REQUIRED')
        .map((r) => ({
          ...r,
          recommended_qty: Math.max(0, r.target_max_inventory - r.stock_on_hand)
        }));
      return corsJson(request, env, { success: true, items });
    }

    if (action === 'analytics') {
      const rows = await readBalance(env);
      let total_value_cents = 0;
      let total_units = 0;
      let skus_restock_count = 0;
      for (const r of rows) {
        const q = r.stock_on_hand;
        total_units += q;
        total_value_cents += q * r.cost_price_cents;
        if (q <= r.reorder_trigger_level) skus_restock_count += 1;
      }
      const velRes = await env.DB.prepare(
        'SELECT s.sku AS sku, p.item_name AS item_name, SUM(s.qty) AS total_out FROM ims_stock_out s LEFT JOIN ims_products p ON p.id = s.sku GROUP BY s.sku ORDER BY total_out DESC, s.sku LIMIT 3'
      ).all();
      const vel = (velRes && Array.isArray(velRes.results) ? velRes.results : []).map((r) => ({
        sku: typeof r.sku === 'string' ? r.sku : '',
        item_name: typeof r.item_name === 'string' ? r.item_name : '',
        total_out: Number.isFinite(Number(r.total_out)) ? Number(r.total_out) : 0
      }));
      return corsJson(request, env, {
        success: true,
        kpis: { total_value_cents, total_units, skus_restock_count, top_velocity: vel }
      });
    }

    if (action === 'products') {
      await ensureTables(env);
      const withHsn = await hasHsnColumns(env);
      const cols = withHsn
        ? 'id, item_name, category, uom, cost_price_cents, selling_price_cents, supplier_name, reorder_trigger_level, target_max_inventory, hsn_code, hsn_description, created_at, updated_at'
        : 'id, item_name, category, uom, cost_price_cents, selling_price_cents, supplier_name, reorder_trigger_level, target_max_inventory, created_at, updated_at';
      const res = await env.DB.prepare(
        `SELECT ${cols} FROM ims_products ORDER BY item_name`,
      ).all();
      const products = (res && Array.isArray(res.results) ? res.results : []).map(mapProductRow);
      return corsJson(request, env, { success: true, products });
    }

    return corsJson(request, env, { success: false, message: 'Unknown action.' }, 400);
  }

  if (request.method === 'POST') {
    const actionStart = Date.now();
    let body = null;
    try {
      body = await request.json();
    } catch {
      return corsJson(request, env, { success: false, message: 'Invalid request body' }, 400);
    }
    const action = body && typeof body === 'object' ? body.action : null;

    if (action === 'save-product') {
      // The client historically sent the product nested under `product`, the API
      // contract is flat. Accept both so neither caller 400s on a shape mismatch
      // (a nested payload used to read as "sku must be 1-64 characters").
      const src = (body.product && typeof body.product === 'object') ? { ...body, ...body.product } : body;
      const {
        sku, item_name, category, uom, cost_price_cents, selling_price_cents,
        supplier_name, reorder_trigger_level, target_max_inventory,
        hsn_code, hsn_description,
      } = src;
      // Short aliases accepted for the UI field names (cost, selling, supplier,
      // trigger, target_max). Namespaced so they never collide with the cents
      // variables declared below.
      const costRaw = cost_price_cents !== undefined ? cost_price_cents : src.cost;
      const sellRaw = selling_price_cents !== undefined ? selling_price_cents : src.selling;
      const supRaw = supplier_name !== undefined ? supplier_name : src.supplier;
      const reorderRaw = reorder_trigger_level !== undefined ? reorder_trigger_level : src.trigger;
      const targetRaw = target_max_inventory !== undefined ? target_max_inventory : src.target_max;

      if (typeof sku !== 'string' || sku.trim().length === 0 || sku.trim().length > MAX_SKU_LEN) {
        return corsJson(request, env, { success: false, field: 'sku', message: 'sku must be 1-64 characters.' }, 400);
      }
      if (typeof item_name !== 'string' || item_name.length === 0 || item_name.length > MAX_NAME_LEN) {
        return corsJson(request, env, { success: false, message: 'item_name must be 1-140 characters.' }, 400);
      }
      if (category !== undefined && category !== null && (typeof category !== 'string' || category.length > MAX_CATEGORY_LEN)) {
        return corsJson(request, env, { success: false, message: 'category must be at most 80 characters.' }, 400);
      }
      const uomValue = typeof uom === 'string' && uom.length > 0 ? uom : 'pcs';
      if (uomValue.length > MAX_UOM_LEN) {
        return corsJson(request, env, { success: false, message: 'uom must be at most 20 characters.' }, 400);
      }
      const cost = typeof costRaw === 'number' ? costRaw : Number(costRaw);
      const sell = typeof sellRaw === 'number' ? sellRaw : Number(sellRaw);
      if (!Number.isInteger(cost) || cost < 0) {
        return corsJson(request, env, { success: false, field: 'cost', message: 'cost must be an integer >= 0 (paise).' }, 400);
      }
      if (!Number.isInteger(sell) || sell < 0) {
        return corsJson(request, env, { success: false, field: 'selling', message: 'selling must be an integer >= 0 (paise).' }, 400);
      }
      if (sell > 0 && cost > 0 && sell < cost) {
        return corsJson(request, env, { success: false, field: 'selling', message: 'Selling price is below cost price.' }, 400);
      }
      if (supRaw !== undefined && supRaw !== null && (typeof supRaw !== 'string' || supRaw.length > MAX_SUPPLIER_LEN)) {
        return corsJson(request, env, { success: false, field: 'supplier', message: 'supplier must be at most 140 characters.' }, 400);
      }
      const reorder = typeof reorderRaw === 'number' ? reorderRaw : Number(reorderRaw);
      const target = typeof targetRaw === 'number' ? targetRaw : Number(targetRaw);
      if (!Number.isInteger(reorder) || reorder < 0) {
        return corsJson(request, env, { success: false, field: 'trigger', message: 'reorder trigger must be an integer >= 0.' }, 400);
      }
      if (!Number.isInteger(target) || target < 0) {
        return corsJson(request, env, { success: false, field: 'target_max', message: 'target max must be an integer >= 0.' }, 400);
      }
      if (target > 0 && target < reorder) {
        return corsJson(request, env, { success: false, field: 'target_max', message: 'Target max must be greater than or equal to the reorder trigger.' }, 400);
      }
      const skuClean = sku.trim();
      const hsnCode = typeof hsn_code === 'string' ? hsn_code.trim() : '';
      if (hsnCode && !/^[0-9]{2,8}$/.test(hsnCode)) {
        return corsJson(request, env, { success: false, field: 'hsn_code', message: 'HSN code must be 2-8 digits.' }, 400);
      }
      const hsnDesc = str(typeof hsn_description === 'string' ? hsn_description : '', 300);
      try {
        const stamp = isoNow();
        const hasHsn = await hasHsnColumns(env);
        const sql = hasHsn
          ? 'INSERT INTO ims_products (id, item_name, category, uom, cost_price_cents, selling_price_cents, supplier_name, reorder_trigger_level, target_max_inventory, hsn_code, hsn_description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET item_name=excluded.item_name, category=excluded.category, uom=excluded.uom, cost_price_cents=excluded.cost_price_cents, selling_price_cents=excluded.selling_price_cents, supplier_name=excluded.supplier_name, reorder_trigger_level=excluded.reorder_trigger_level, target_max_inventory=excluded.target_max_inventory, hsn_code=excluded.hsn_code, hsn_description=excluded.hsn_description, updated_at=excluded.updated_at'
          : 'INSERT INTO ims_products (id, item_name, category, uom, cost_price_cents, selling_price_cents, supplier_name, reorder_trigger_level, target_max_inventory, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET item_name=excluded.item_name, category=excluded.category, uom=excluded.uom, cost_price_cents=excluded.cost_price_cents, selling_price_cents=excluded.selling_price_cents, supplier_name=excluded.supplier_name, reorder_trigger_level=excluded.reorder_trigger_level, target_max_inventory=excluded.target_max_inventory, updated_at=excluded.updated_at';
        const binds = hasHsn
          ? [skuClean, str(item_name, MAX_NAME_LEN), str(category || '', MAX_CATEGORY_LEN), uomValue, cost, sell, str(supRaw || '', MAX_SUPPLIER_LEN), reorder, target, hsnCode, hsnDesc, stamp, stamp]
          : [skuClean, str(item_name, MAX_NAME_LEN), str(category || '', MAX_CATEGORY_LEN), uomValue, cost, sell, str(supRaw || '', MAX_SUPPLIER_LEN), reorder, target, stamp, stamp];
        await runBatch(env, [env.DB.prepare(sql).bind(...binds)]);
        await logEvent(env, { kind: 'ims_save_product', channel: 'inventory', status: 200, latency_ms: Date.now() - actionStart, bytes: 0, payload: '' });
        return corsJson(request, env, { success: true, sku: skuClean });
      } catch {
        return corsJson(request, env, { success: false, message: 'Failed to save product.' }, 500);
      }
    }

    if (action === 'delete-product') {
      const { sku } = body;
      if (typeof sku !== 'string' || sku.length === 0) {
        return corsJson(request, env, { success: false, message: 'sku is required.' }, 400);
      }
      try {
        const ref = await env.DB.prepare(
          'SELECT 1 AS r FROM ims_opening_stock WHERE sku = ? UNION ALL SELECT 1 FROM ims_stock_in WHERE sku = ? UNION ALL SELECT 1 FROM ims_stock_out WHERE sku = ? LIMIT 1'
        ).bind(sku, sku, sku).first();
        if (ref) {
          return corsJson(request, env, { success: false, message: 'Cannot delete product with existing transactions.' }, 409);
        }
        await runBatch(env, [
          env.DB.prepare('DELETE FROM ims_products WHERE id = ?').bind(sku),
          env.DB.prepare('DELETE FROM ims_opening_stock WHERE sku = ?').bind(sku)
        ]);
        await logEvent(env, { kind: 'ims_delete_product', channel: 'inventory', status: 200, latency_ms: Date.now() - actionStart, bytes: 0, payload: '' });
        return corsJson(request, env, { success: true, sku });
      } catch {
        return corsJson(request, env, { success: false, message: 'Failed to delete product.' }, 500);
      }
    }

    if (action === 'stock-in') {
      const { txn_id, sku, qty, unit_rate_cents, ref_notes } = body;
      if (typeof txn_id !== 'string' || txn_id.length === 0) {
        return corsJson(request, env, { success: false, message: 'txn_id is required.' }, 400);
      }
      const dup = await env.DB.prepare('SELECT 1 FROM ims_stock_in WHERE txn_id = ? LIMIT 1').bind(txn_id).first();
      if (dup) {
        return corsJson(request, env, { success: false, message: 'Duplicate txn_id.' }, 409);
      }
      const prod = await env.DB.prepare('SELECT 1 FROM ims_products WHERE id = ? LIMIT 1').bind(sku).first();
      if (!prod) {
        return corsJson(request, env, { success: false, message: 'Unregistered SKU' }, 400);
      }
      const q = typeof qty === 'number' ? qty : Number(qty);
      if (!Number.isInteger(q) || q <= 0) {
        return corsJson(request, env, { success: false, message: 'qty must be an integer > 0.' }, 400);
      }
      const rate = typeof unit_rate_cents === 'number' ? unit_rate_cents : Number(unit_rate_cents);
      if (!Number.isInteger(rate) || rate < 0) {
        return corsJson(request, env, { success: false, message: 'unit_rate_cents must be an integer >= 0.' }, 400);
      }
      try {
        const stamp = isoNow();
        const notes = typeof ref_notes === 'string' ? ref_notes.slice(0, MAX_REF_NOTES_LEN) : null;
        await runBatch(env, [
          env.DB.prepare(
            'INSERT INTO ims_stock_in (id, txn_id, sku, qty, unit_rate_cents, ref_notes, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(uid(), txn_id, str(sku, MAX_SKU_LEN), q, rate, notes, stamp, user.email)
        ]);
        const payload = JSON.stringify({ txn_id, sku, qty: q, unit_rate_cents: rate, ref_notes: notes });
        await logEvent(env, { kind: 'ims_stock_in', channel: 'inventory', status: 200, latency_ms: Date.now() - actionStart, bytes: new TextEncoder().encode(payload).length, payload });
        return corsJson(request, env, { success: true, txn_id });
      } catch (err) {
        if (uniqueViolation(err)) {
          return corsJson(request, env, { success: false, message: 'Duplicate txn_id.' }, 409);
        }
        return corsJson(request, env, { success: false, message: 'Failed to post stock-in.' }, 500);
      }
    }

    if (action === 'stock-out') {
      const { txn_id, sku, qty, unit_rate_cents, ref_notes } = body;
      if (typeof txn_id !== 'string' || txn_id.length === 0) {
        return corsJson(request, env, { success: false, message: 'txn_id is required.' }, 400);
      }
      const dup = await env.DB.prepare('SELECT 1 FROM ims_stock_out WHERE txn_id = ? LIMIT 1').bind(txn_id).first();
      if (dup) {
        return corsJson(request, env, { success: false, message: 'Duplicate txn_id.' }, 409);
      }
      const prod = await env.DB.prepare('SELECT 1 FROM ims_products WHERE id = ? LIMIT 1').bind(sku).first();
      if (!prod) {
        return corsJson(request, env, { success: false, message: 'Unregistered SKU' }, 400);
      }
      const q = typeof qty === 'number' ? qty : Number(qty);
      if (!Number.isInteger(q) || q <= 0) {
        return corsJson(request, env, { success: false, message: 'qty must be an integer > 0.' }, 400);
      }
      const rate = typeof unit_rate_cents === 'number' ? unit_rate_cents : Number(unit_rate_cents);
      if (!Number.isInteger(rate) || rate < 0) {
        return corsJson(request, env, { success: false, message: 'unit_rate_cents must be an integer >= 0.' }, 400);
      }
      try {
        const oh = await env.DB.prepare(
          'SELECT COALESCE((SELECT qty FROM ims_opening_stock WHERE sku = ?), 0) + COALESCE((SELECT SUM(qty) FROM ims_stock_in WHERE sku = ?), 0) - COALESCE((SELECT SUM(qty) FROM ims_stock_out WHERE sku = ?), 0) AS on_hand'
        ).bind(sku, sku, sku).first();
        const onHand = Number.isFinite(Number(oh && oh.on_hand)) ? Number(oh.on_hand) : 0;
        if (q > onHand) {
          return corsJson(request, env, { success: false, message: `Insufficient stock: on-hand ${onHand} requested ${q}.` }, 400);
        }
        const stamp = isoNow();
        const notes = typeof ref_notes === 'string' ? ref_notes.slice(0, MAX_REF_NOTES_LEN) : null;
        await runBatch(env, [
          env.DB.prepare(
            'INSERT INTO ims_stock_out (id, txn_id, sku, qty, unit_rate_cents, ref_notes, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(uid(), txn_id, str(sku, MAX_SKU_LEN), q, rate, notes, stamp, user.email)
        ]);
        const payload = JSON.stringify({ txn_id, sku, qty: q, unit_rate_cents: rate, ref_notes: notes });
        await logEvent(env, { kind: 'ims_stock_out', channel: 'inventory', status: 200, latency_ms: Date.now() - actionStart, bytes: new TextEncoder().encode(payload).length, payload });
        return corsJson(request, env, { success: true, txn_id });
      } catch (err) {
        if (uniqueViolation(err)) {
          return corsJson(request, env, { success: false, message: 'Duplicate txn_id.' }, 409);
        }
        return corsJson(request, env, { success: false, message: 'Failed to post stock-out.' }, 500);
      }
    }

    if (action === 'opening-stock') {
      const { sku, qty } = body;
      if (typeof sku !== 'string' || sku.length === 0) {
        return corsJson(request, env, { success: false, message: 'sku is required.' }, 400);
      }
      const prod = await env.DB.prepare('SELECT 1 FROM ims_products WHERE id = ? LIMIT 1').bind(sku).first();
      if (!prod) {
        return corsJson(request, env, { success: false, message: 'Unregistered SKU' }, 400);
      }
      const q = typeof qty === 'number' ? qty : Number(qty);
      if (!Number.isInteger(q) || q < 0) {
        return corsJson(request, env, { success: false, message: 'qty must be an integer >= 0.' }, 400);
      }
      try {
        const stamp = isoNow();
        await runBatch(env, [
          env.DB.prepare(
            'INSERT INTO ims_opening_stock (sku, qty, updated_at) VALUES (?, ?, ?) ON CONFLICT(sku) DO UPDATE SET qty=excluded.qty, updated_at=excluded.updated_at'
          ).bind(str(sku, MAX_SKU_LEN), q, stamp)
        ]);
        await logEvent(env, { kind: 'ims_opening_stock', channel: 'inventory', status: 200, latency_ms: Date.now() - actionStart, bytes: 0, payload: JSON.stringify({ sku, qty: q }) });
        return corsJson(request, env, { success: true, sku });
      } catch {
        return corsJson(request, env, { success: false, message: 'Failed to save opening stock.' }, 500);
      }
    }

    if (action === 'targets') {
      const { sku, target_max_inventory } = body;
      if (typeof sku !== 'string' || sku.length === 0) {
        return corsJson(request, env, { success: false, message: 'sku is required.' }, 400);
      }
      const target = typeof target_max_inventory === 'number' ? target_max_inventory : Number(target_max_inventory);
      if (!Number.isInteger(target) || target < 0) {
        return corsJson(request, env, { success: false, message: 'target_max_inventory must be an integer >= 0.' }, 400);
      }
      const prod = await env.DB.prepare('SELECT 1 FROM ims_products WHERE id = ? LIMIT 1').bind(sku).first();
      if (!prod) {
        return corsJson(request, env, { success: false, message: 'Unregistered SKU' }, 400);
      }
      try {
        const stamp = isoNow();
        await runBatch(env, [
          env.DB.prepare('UPDATE ims_products SET target_max_inventory = ?, updated_at = ? WHERE id = ?').bind(target, stamp, sku)
        ]);
        await logEvent(env, { kind: 'ims_targets', channel: 'inventory', status: 200, latency_ms: Date.now() - actionStart, bytes: 0, payload: JSON.stringify({ sku, target_max_inventory: target }) });
        return corsJson(request, env, { success: true, sku });
      } catch {
        return corsJson(request, env, { success: false, message: 'Failed to update targets.' }, 500);
      }
    }

    return corsJson(request, env, { success: false, message: 'Unknown action.' }, 400);
  }

  return corsJson(request, env, { success: false, message: 'Method not allowed' }, 405);
}
