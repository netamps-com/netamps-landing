/**
 * Negotiation persistence (Cloudflare D1). No KV, no model, no network — pure
 * SQL over the DB binding, so it is exercised verbatim by the Node harness via
 * node:sqlite.
 *
 * Schema is created lazily and idempotently (same posture as the rest of this
 * codebase): a cold database self-heals on first touch.
 */

import { STATUS, capturePriceSnapshot, isClosed, normalizeStatus } from './core.mjs';
import { appendOrderEvent } from '../audit/order-events.mjs';

const BUYER_TOKEN_TTL_SECONDS = 60 * 60; // 60 minutes — one sitting
export const ORDER_TOKEN_TTL_SECONDS = BUYER_TOKEN_TTL_SECONDS; // legacy alias (tests/readers)

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
       status TEXT NOT NULL DEFAULT 'Order Accepted for Negotiation',
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

  // Buyer tokens are scoped to an EMAIL, not to one order: proving the mailbox
  // proves every request filed under it, so the Track module can list them all
  // and let the buyer pick which one to negotiate. (Replaces the earlier
  // order_access_tokens table — one order per token.)
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS buyer_tokens (
       token TEXT PRIMARY KEY,
       email TEXT NOT NULL,
       expires_at TEXT NOT NULL,
       created_at TEXT
     )`
  ).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_buyer_tokens_email ON buyer_tokens(email)').run();

  // Orders are looked up by email on every Track verification.
  try {
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_returns_email ON returns(email)').run();
  } catch { /* index is an optimisation only */ }
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

/**
 * EVERY successfully-created request filed under one email address, newest
 * first. This is the Track module's entry point: email alone identifies the
 * buyer, the OTP proves they own the mailbox, and the list is theirs to pick
 * from. Deleted requests never appear (there is no row to find).
 */
export async function listOrdersByEmail(env, email, limit = 50) {
  if (!dbReady(env)) return [];
  const norm = String(email || '').trim().toLowerCase();
  if (!norm) return [];
  const cap = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 50;
  try {
    const res = await env.DB.prepare(
      'SELECT * FROM returns WHERE LOWER(TRIM(email)) = ?1 ORDER BY date DESC LIMIT ?2'
    ).bind(norm, cap).all();
    return ((res && res.results) || []).map(serializeOrderRow).filter(Boolean);
  } catch {
    return [];
  }
}

/* ── Negotiation lifecycle ──────────────────────────────────────────────── */

/**
 * Mirror the thread's status onto the order record so both tell one story.
 *
 * A D1 write can fail transiently. Swallowing that is precisely how an order
 * and its thread end up contradicting each other: the head advances to
 * "Negotiation in Progress" while the order row is left on "Pending", and from
 * then on every negotiation verb refuses against a status the thread has
 * already left — with no error anywhere to explain why.
 *
 * So: retry once, report the outcome to the caller, and log loudly. Read paths
 * re-derive the status from the thread (reconcileOrder), so a failure that
 * survives the retry self-heals on the next load instead of wedging the thread.
 */
export async function setOrderStatus(env, requestId, status) {
  if (!dbReady(env)) return { ok: false, error: 'database unavailable' };
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await env.DB.prepare('UPDATE returns SET status = ?1 WHERE id = ?2').bind(status, requestId).run();
      return { ok: true };
    } catch (err) {
      if (attempt < 2) continue;
      const message = String((err && err.message) || err);
      console.error('[negotiate] order-status mirror FAILED', JSON.stringify({ requestId, status, message }));
      return { ok: false, error: message };
    }
  }
  return { ok: false, error: 'unreachable' };
}

/**
 * Repair the projection from the record.
 *
 * The rounds are append-only, so the thread is the durable account of what
 * happened and the order's status field is a projection of it. Where the two
 * disagree the projection is rewritten to match the thread — one write, always
 * reported (never a silent mutation of captured data), and never applied to a
 * terminal rung: a closed deal or a decline is permanent, so if the order is
 * already closed the drift is surfaced rather than "repaired".
 */
export async function reconcileOrder(env, order, authoritativeStatus) {
  if (!order || !authoritativeStatus) return { order, reconciled: false, drift: false };
  const current = normalizeStatus(order.status);
  if (current === authoritativeStatus) return { order, reconciled: false, drift: false };

  if (isClosed(current)) {
    console.error('[negotiate] status drift (order is terminal, left untouched)', JSON.stringify({
      requestId: order.id, orderStatus: current, threadStatus: authoritativeStatus
    }));
    return { order, reconciled: false, drift: true };
  }

  const res = await setOrderStatus(env, order.id, authoritativeStatus);
  if (!res.ok) return { order, reconciled: false, drift: true };
  // The repair itself goes on the record. A drifted order corrected behind the
  // scenes with no trace would be exactly the "data changed after capture"
  // outcome this trail exists to make impossible to hide.
  await appendOrderEvent(env, {
    requestId: order.id,
    kind: 'reconciled',
    rung: authoritativeStatus,
    actor: 'system',
    detail: { from: current, to: authoritativeStatus, reason: 'order status trailed its negotiation thread' }
  });
  return { order: { ...order, status: authoritativeStatus }, reconciled: true, drift: true };
}

export async function readNegotiation(env, id) {
  return env.DB.prepare('SELECT * FROM negotiations WHERE id = ?1').bind(id).first();
}

/**
 * The live thread for an order: anything not on a terminal rung. Terminal
 * values include the pre-lifecycle words, so an old 'rejected'/'withdrawn'
 * thread is never mistaken for an openable one.
 */
const TERMINAL_HEADS = [STATUS.DEAL, STATUS.DECLINED, 'rejected', 'withdrawn']
  .map((s) => `'${String(s).replace(/'/g, "''")}'`)
  .join(',');

export async function readActiveNegotiation(env, requestId) {
  return env.DB
    .prepare(`SELECT * FROM negotiations WHERE request_id = ?1 AND status NOT IN (${TERMINAL_HEADS}) ORDER BY created_at DESC LIMIT 1`)
    .bind(requestId)
    .first();
}

/** @deprecated use readActiveNegotiation — kept as the historical name. */
export const readOpenNegotiation = readActiveNegotiation;

/**
 * Reuse the live thread for this order, or open a fresh one at the first rung
 * of the ladder ("Order Accepted for Negotiation") — mirroring that rung onto
 * the order itself.
 *
 * Opening is only legal on a non-terminal order: a deal that was approved or
 * declined can only ever get a NEW thread via a new order.
 */
export async function findOrCreateNegotiation(env, order, actor = null) {
  const orderStatus = normalizeStatus(order.status);
  if (isClosed(orderStatus)) {
    const err = new Error(
      orderStatus === STATUS.DECLINED
        ? 'This request was declined — it cannot be negotiated.'
        : 'This request is already deal-approved — it cannot be renegotiated.'
    );
    err.code = 'ORDER_CLOSED';
    throw err;
  }

  const existing = await readActiveNegotiation(env, order.id);
  if (existing) {
    // The thread already exists, so the order's status is a projection of it.
    // Repair the projection with the thread's OWN rung — never with a
    // hard-coded one: an "Order Accepted for Negotiation" mirror written over a
    // thread that has already progressed would rewind the order's history.
    await reconcileOrder(env, order, normalizeStatus(existing.status));
    return existing;
  }

  const snapshot = capturePriceSnapshot(order);
  const at = nowIso();
  const row = {
    id: crypto.randomUUID(),
    request_id: order.id,
    intent: order.intent || null,
    buyer_email: order.email ? String(order.email).toLowerCase() : null,
    status: STATUS.ACCEPTED,
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
  await setOrderStatus(env, order.id, STATUS.ACCEPTED);
  // The rung the dashboard's accept button stands on, entered exactly once:
  // only the creating branch writes it, so reopening a live thread never
  // duplicates the entry.
  await appendOrderEvent(env, {
    requestId: order.id,
    kind: 'accepted',
    rung: STATUS.ACCEPTED,
    // `actor` is the staff member who pressed the accept button. Left null when
    // unknown: a blank attribution reads as "not recorded", whereas naming the
    // buyer would claim THEY performed a staff-only rung.
    actor: actor || null,
    detail: { negotiationId: row.id }
  });
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
 * (two statements; a crash between them leaves the round recorded — the head
 * is recomputable from the thread, so it self-heals).
 *
 * The order record is advanced too, and that write is NOT best-effort-silent:
 * setOrderStatus retries and reports. A missed mirror leaves the dashboard
 * showing a status the thread contradicts, which is why every read path also
 * reconciles the order from the thread.
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

  await setOrderStatus(env, negotiation.request_id, nextState.status);

  // One row per round, carrying the resulting rung — so a staff `accept`
  // (→ "Accepted Final Price") and a staff `approve` (→ "Order Deal Approved")
  // are separate, stamped entries rather than a status column that changed
  // shape after the fact.
  await appendOrderEvent(env, {
    requestId: negotiation.request_id,
    kind: 'round',
    rung: nextState.status,
    actor: actorEmail || null,
    detail: {
      seq,
      verb: value.kind,
      side: value.side,
      totalPaise: value.totalPaise ?? null,
      note: value.note || '',
      negotiationId: negotiation.id
    },
    at
  });

  return { ...round, price_version: snapshot.version, price_basis: snapshot.basis, price_total_paise: snapshot.totalPaise };
}

/**
 * Staff monitor list.
 * `status` accepts: 'open' (any non-terminal thread), 'agreed', 'deal',
 * 'declined', 'all', or a literal lifecycle phrase. Legacy words are mapped
 * rather than rejected so old saved links keep working.
 */
export async function listNegotiations(env, { status = 'open', limit = 100 } = {}) {
  const cap = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 100;
  const NOT_TERMINAL = `status NOT IN (${TERMINAL_HEADS})`;
  const map = {
    open: NOT_TERMINAL,
    active: NOT_TERMINAL,
    inprogress: `status = '${STATUS.IN_PROGRESS}'`,
    accepted: `status = '${STATUS.AGREED}'`,
    agreed: `status = '${STATUS.AGREED}'`,
    deal: `status = '${STATUS.DEAL}'`,
    approved: `status = '${STATUS.DEAL}'`,
    declined: `status = '${STATUS.DECLINED}'`,
    rejected: `status = '${STATUS.DECLINED}'`,
    withdrawn: `status = '${STATUS.DECLINED}'`
  };
  const key = String(status || 'open').toLowerCase();
  let where = null;
  if (status !== 'all') {
    // Unknown word → fall back to "show me the live threads" rather than to
    // "show me everything"; a bad filter must never widen the view.
    where = Object.prototype.hasOwnProperty.call(map, key) ? map[key] : NOT_TERMINAL;
  }
  const sql = where
    ? `SELECT * FROM negotiations WHERE ${where} ORDER BY updated_at DESC LIMIT ?1`
    : 'SELECT * FROM negotiations ORDER BY updated_at DESC LIMIT ?1';
  const res = await env.DB.prepare(sql).bind(cap).all();
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

/* ── Buyer tokens (email-scoped, post-OTP) ──────────────────────────────── */
//
// Email alone identifies a buyer: proving mailbox ownership with an OTP proves
// every request filed under that address. The token therefore carries the
// EMAIL, not one request ID — the Track module lists all of the buyer's orders
// and lets them pick which one to negotiate. Every read still re-checks that
// the requested order belongs to the token's email.

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function mintBuyerToken(env, { email }) {
  const norm = String(email || '').trim().toLowerCase();
  if (!norm) throw new Error('A buyer token requires an email address.');
  const token = randomToken();
  const at = nowIso();
  const expiresAt = new Date(Date.now() + BUYER_TOKEN_TTL_SECONDS * 1000).toISOString();
  await env.DB.prepare(
    'INSERT INTO buyer_tokens (token, email, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)'
  ).bind(token, norm, expiresAt, at).run();
  // Opportunistic sweep of expired tokens (bounded, best-effort).
  try {
    await env.DB.prepare('DELETE FROM buyer_tokens WHERE expires_at < ?1').bind(at).run();
  } catch {}
  return { token, expiresAt, email: norm };
}

export async function verifyBuyerToken(env, token) {
  if (!token || typeof token !== 'string' || token.length > 128) return null;
  const row = await env.DB.prepare('SELECT * FROM buyer_tokens WHERE token = ?1').bind(token).first();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    try { await env.DB.prepare('DELETE FROM buyer_tokens WHERE token = ?1').bind(token).run(); } catch {}
    return null;
  }
  return { email: row.email };
}

/* ── Deal approval (the one price decision that is audited) ─────────────── */

/**
 * Sentinel for the order-level row in `price_history`. Per-line product rows
 * are no longer written (an intermediate evaluation is not a decision) — this
 * row exists ONLY to record the agreed final price when the deal is approved.
 */
export const FINAL_PRICE_ROW = null;

async function ensurePriceHistory(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS price_history (
       id TEXT PRIMARY KEY,
       request_id TEXT,
       product_id TEXT,
       old_paise INTEGER,
       new_paise INTEGER,
       actor TEXT,
       at TEXT
     )`
  ).run();
}

/**
 * Close a negotiation: freeze the accepted price as the immutable
 * FinalPriceSnapshot, move the order to "Order Deal Approved", and append the
 * ONE permanent audit row for this order's price.
 *
 * Every price edit that happened along the way is deliberately NOT recorded
 * here — the audit trail answers "what was agreed", not "what did the admin
 * type". The negotiation thread itself is the trail of intermediate figures.
 */
export async function finalizeDeal(env, { order, totalPaise, actor }) {
  if (!Number.isInteger(totalPaise) || totalPaise < 0) {
    throw new Error('A deal can only be approved at a valid agreed total.');
  }
  const prev = order && order.finalPrice ? order.finalPrice : null;
  const at = nowIso();
  const snapshot = {
    version: (prev && Number.isInteger(prev.version) ? prev.version : 0) + 1,
    decidedAt: at,
    decidedBy: String(actor || 'unknown').slice(0, 254),
    basis: 'negotiated',
    totalPaise,
    lines: (Array.isArray(order.products) ? order.products : []).map((p) => {
      const unit = (p && Number.isInteger(p.pricePaise)) ? p.pricePaise
        : (p && Number.isFinite(p.price) && p.price >= 0 ? Math.round(p.price * 100) : null);
      const qty = p && Number.isInteger(p.quantity) && p.quantity > 0 ? p.quantity : 1;
      return {
        productId: p && p.id ? p.id : '',
        askPaise: p && Number.isInteger(p.lineConsiderationPaise) ? p.lineConsiderationPaise : null,
        evaluatedPaise: unit === null ? null : unit * qty,
        settledPaise: null // negotiated — settled at the order total
      };
    }),
    manifestHashAtApproval: (order && order.manifest && order.manifest.hash) || null
  };

  await env.DB.prepare('UPDATE returns SET status = ?, finalPrice = ? WHERE id = ?')
    .bind(STATUS.DEAL, JSON.stringify(snapshot), order.id).run();

  try {
    await ensurePriceHistory(env);
    await env.DB.prepare(
      'INSERT INTO price_history (id, request_id, product_id, old_paise, new_paise, actor, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
    ).bind(
      crypto.randomUUID(), order.id, FINAL_PRICE_ROW,
      prev && Number.isInteger(prev.totalPaise) ? prev.totalPaise : null,
      totalPaise, snapshot.decidedBy, at
    ).run();
  } catch { /* the approval itself must not fail on the audit append */ }

  return snapshot;
}
