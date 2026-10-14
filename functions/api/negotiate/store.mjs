/**
 * Negotiation persistence (Cloudflare D1). No KV, no model, no network — pure
 * SQL over the DB binding, so it is exercised verbatim by the Node harness via
 * node:sqlite.
 *
 * Schema is created lazily and idempotently (same posture as the rest of this
 * codebase): a cold database self-heals on first touch.
 */

import { STATUS, capturePriceSnapshot } from './core.mjs';

const ORDER_TOKEN_TTL_SECONDS = 60 * 60; // 60 minutes — one sitting

function nowIso() {
  return new Date().toISOString();
}

export function dbReady(env) {
  return Boolean(env && env.DB && typeof env.DB.prepare === 'function');
}

export async function ensureNegotiationSchema(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS negotiations (
       id TEXT PRIMARY KEY,
       request_id TEXT NOT NULL,
       intent TEXT,
       buyer_email TEXT,
       status TEXT NOT NULL DEFAULT 'open',
       current_total_paise INTEGER,
       price_version INTEGER NOT NULL DEFAULT 0,
       created_at TEXT,
       updated_at TEXT
     )`
  ).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_negotiations_request ON negotiations(request_id)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_negotiations_status ON negotiations(status)').run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS negotiation_rounds (
       id TEXT PRIMARY KEY,
       negotiation_id TEXT NOT NULL,
       seq INTEGER NOT NULL,
       side TEXT NOT NULL,
       actor_email TEXT,
       kind TEXT NOT NULL,
       total_paise INTEGER,
       note TEXT,
       price_version INTEGER,
       price_basis TEXT,
       price_total_paise INTEGER,
       manifest_hash TEXT,
       created_at TEXT
     )`
  ).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_negotiation_rounds_neg ON negotiation_rounds(negotiation_id, seq)').run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS order_access_tokens (
       token TEXT PRIMARY KEY,
       request_id TEXT NOT NULL,
       email TEXT NOT NULL,
       expires_at TEXT NOT NULL,
       created_at TEXT
     )`
  ).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_order_tokens_request ON order_access_tokens(request_id)').run();
}

/* ── Order read model ───────────────────────────────────────────────────── */

const parseJson = (raw, fallback) => {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
};

const parseFinalPrice = (raw) => {
  const fp = parseJson(raw, null);
  if (fp && Number.isInteger(fp.version) && Number.isInteger(fp.totalPaise)) return fp;
  return null;
};

/** Map a `returns` row to the order shape the negotiation core understands. */
export function serializeOrderRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    intent: row.intent,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    products: parseJson(row.products, []),
    attachedFiles: parseJson(row.attachedFiles ?? row.attachedfiles, []),
    status: row.status,
    date: row.date,
    totalAmount: Number(row.totalAmount ?? row.totalamount ?? 0),
    pricingBasis: (row.pricingBasis ?? row.pricingbasis) === 'lot' ? 'lot' : 'per_product',
    lotConsiderationPaise: (() => {
      const v = row.lotConsiderationPaise ?? row.lotconsiderationpaise;
      return Number.isInteger(Number(v)) ? Number(v) : null;
    })(),
    manifest: parseJson(row.manifest, null),
    finalPrice: parseFinalPrice(row.finalPrice ?? row.finalprice)
  };
}

export async function getOrderById(env, id) {
  if (!dbReady(env)) return null;
  const upper = String(id || '').trim().toUpperCase();
  if (!upper) return null;
  try {
    const row = await env.DB.prepare('SELECT * FROM returns WHERE id = ?1').bind(upper).first();
    return serializeOrderRow(row);
  } catch {
    // Pre-deploy databases may lack the table entirely — treat as "not found".
    return null;
  }
}

/* ── Negotiation lifecycle ──────────────────────────────────────────────── */

export async function readNegotiation(env, id) {
  return env.DB.prepare('SELECT * FROM negotiations WHERE id = ?1').bind(id).first();
}

export async function readOpenNegotiation(env, requestId) {
  return env.DB
    .prepare("SELECT * FROM negotiations WHERE request_id = ?1 AND status = 'open' ORDER BY created_at DESC LIMIT 1")
    .bind(requestId)
    .first();
}

/** Reuse the open negotiation for this order, or open a fresh one. */
export async function findOrCreateNegotiation(env, order) {
  const existing = await readOpenNegotiation(env, order.id);
  if (existing) return existing;

  const snapshot = capturePriceSnapshot(order);
  const at = nowIso();
  const row = {
    id: crypto.randomUUID(),
    request_id: order.id,
    intent: order.intent || null,
    buyer_email: order.email ? String(order.email).toLowerCase() : null,
    status: STATUS.OPEN,
    current_total_paise: null,
    price_version: snapshot.version,
    created_at: at,
    updated_at: at
  };
  await env.DB.prepare(
    `INSERT INTO negotiations (id, request_id, intent, buyer_email, status, current_total_paise, price_version, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
  ).bind(
    row.id, row.request_id, row.intent, row.buyer_email, row.status,
    row.current_total_paise, row.price_version, row.created_at, row.updated_at
  ).run();
  return row;
}

export async function readRounds(env, negotiationId) {
  const res = await env.DB
    .prepare('SELECT * FROM negotiation_rounds WHERE negotiation_id = ?1 ORDER BY seq ASC')
    .bind(negotiationId)
    .all();
  return (res && res.results) || [];
}

/**
 * Append one immutable round and advance the negotiation head atomically
 * (two statements, best-effort; a crash between them leaves the round
 * recorded — the head is recomputable from the thread, so it self-heals).
 */
export async function appendRound(env, negotiation, value, snapshot, actorEmail, nextState) {
  const rows = await readRounds(env, negotiation.id);
  const seq = rows.length + 1;
  const at = nowIso();
  const round = {
    id: crypto.randomUUID(),
    negotiation_id: negotiation.id,
    seq,
    side: value.side,
    actor_email: actorEmail ? String(actorEmail).slice(0, 254) : null,
    kind: value.kind,
    total_paise: value.totalPaise,
    note: value.note || '',
    created_at: at
  };
  await env.DB.prepare(
    `INSERT INTO negotiation_rounds
       (id, negotiation_id, seq, side, actor_email, kind, total_paise, note, price_version, price_basis, price_total_paise, manifest_hash, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`
  ).bind(
    round.id, round.negotiation_id, round.seq, round.side, round.actor_email,
    round.kind, round.total_paise, round.note,
    snapshot.version, snapshot.basis, snapshot.totalPaise, snapshot.manifestHash,
    round.created_at
  ).run();

  await env.DB.prepare(
    'UPDATE negotiations SET status = ?1, current_total_paise = ?2, updated_at = ?3 WHERE id = ?4'
  ).bind(nextState.status, nextState.currentTotalPaise, at, negotiation.id).run();

  return { ...round, price_version: snapshot.version, price_basis: snapshot.basis, price_total_paise: snapshot.totalPaise };
}

/** Staff monitor list. `status` is optional ('open' | 'all' | any STATUS). */
export async function listNegotiations(env, { status = 'open', limit = 100 } = {}) {
  const cap = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 100;
  const res = status && status !== 'all'
    ? await env.DB.prepare('SELECT * FROM negotiations WHERE status = ?1 ORDER BY updated_at DESC LIMIT ?2').bind(status, cap).all()
    : await env.DB.prepare('SELECT * FROM negotiations ORDER BY updated_at DESC LIMIT ?1').bind(cap).all();
  return (res && res.results) || [];
}

/** All negotiations for one order, newest first (open first, then history). */
export async function listNegotiationsForOrder(env, requestId, limit = 20) {
  const cap = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 20;
  const res = await env.DB
    .prepare('SELECT * FROM negotiations WHERE request_id = ?1 ORDER BY created_at DESC LIMIT ?2')
    .bind(requestId, cap)
    .all();
  return (res && res.results) || [];
}

/* ── Order-access tokens (buyer side, post-OTP) ─────────────────────────── */

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function mintOrderToken(env, { requestId, email }) {
  const token = randomToken();
  const at = nowIso();
  const expiresAt = new Date(Date.now() + ORDER_TOKEN_TTL_SECONDS * 1000).toISOString();
  await env.DB.prepare(
    'INSERT INTO order_access_tokens (token, request_id, email, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5)'
  ).bind(token, String(requestId).toUpperCase(), String(email).toLowerCase(), expiresAt, at).run();
  // Opportunistic sweep of expired tokens (bounded, best-effort).
  try {
    await env.DB.prepare('DELETE FROM order_access_tokens WHERE expires_at < ?1').bind(at).run();
  } catch {}
  return { token, expiresAt };
}

export async function verifyOrderToken(env, token) {
  if (!token || typeof token !== 'string' || token.length > 128) return null;
  const row = await env.DB.prepare('SELECT * FROM order_access_tokens WHERE token = ?1').bind(token).first();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    try { await env.DB.prepare('DELETE FROM order_access_tokens WHERE token = ?1').bind(token).run(); } catch {}
    return null;
  }
  return { requestId: row.request_id, email: row.email };
}

export { ORDER_TOKEN_TTL_SECONDS };
