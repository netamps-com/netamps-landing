/**
 * negotiate/store.mjs — shared database readiness and helper exports
 * Consumed by functions/api/track/extract.js, functions/api/track/logout.js,
 * functions/api/negotiations.js, functions/api/secure-reconcile.js,
 * functions/api/timeline.js, functions/api/track/negotiate.js,
 * functions/api/track/request-otp.js, functions/api/track/verify-otp.js
 */

export function dbReady(env) {
  return Boolean(env?.DB);
}

export async function ensureNegotiationSchema(env) {
  if (!dbReady(env)) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS negotiations (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      buyer_email TEXT,
      status TEXT DEFAULT 'open',
      created_at TEXT DEFAULT datetime('now'),
      updated_at TEXT DEFAULT datetime('now')
    )`
  ).run();
}

export async function getOrderById(env, id) {
  if (!dbReady(env)) return null;
  return await env.DB.prepare('SELECT * FROM orders WHERE id = ?1').bind(id).first();
}

export async function listNegotiations(env) {
  if (!dbReady(env)) return [];
  return await env.DB.prepare('SELECT * FROM negotiations ORDER BY updated_at DESC').all();
}

export async function readNegotiation(env, id) {
  if (!dbReady(env)) return null;
  return await env.DB.prepare('SELECT * FROM negotiations WHERE id = ?1').bind(id).first();
}

export async function findOrCreateNegotiation(env, orderId, buyerEmail) {
  if (!dbReady(env)) return null;
  let row = await env.DB.prepare(
    'SELECT * FROM negotiations WHERE order_id = ?1 ORDER BY updated_at DESC LIMIT 1'
  ).bind(orderId).first();
  if (!row) {
    const id = `nego-${crypto.randomUUID()}`;
    await env.DB.prepare(
      'INSERT INTO negotiations (id, order_id, buyer_email, status, created_at, updated_at) VALUES (?1, ?2, ?3, \'open\', datetime(\'now\'), datetime(\'now\'))'
    ).bind(id, orderId, buyerEmail).run();
    row = await env.DB.prepare('SELECT * FROM negotiations WHERE id = ?1').bind(id).first();
  }
  return row;
}

export async function appendRound(env, negotiationId, roundData) {
  if (!dbReady(env)) return null;
  const id = `round-${crypto.randomUUID()}`;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS negotiation_rounds (
      id TEXT PRIMARY KEY,
      negotiation_id TEXT,
      round_data TEXT,
      created_at TEXT DEFAULT datetime('now')
    )`
  ).run();
  await env.DB.prepare(
    'INSERT INTO negotiation_rounds (id, negotiation_id, round_data, created_at) VALUES (?1, ?2, ?3, datetime(\'now\'))'
  ).bind(id, negotiationId, JSON.stringify(roundData)).run();
  return { id, negotiationId, roundData };
}

export async function readRounds(env, negotiationId) {
  if (!dbReady(env)) return [];
  return await env.DB.prepare(
    'SELECT * FROM negotiation_rounds WHERE negotiation_id = ?1 ORDER BY created_at ASC'
  ).bind(negotiationId).all();
}

export async function finalizeDeal(env, negotiationId, terms) {
  if (!dbReady(env)) return false;
  await env.DB.prepare(
    'UPDATE negotiations SET status = \'finalized\', updated_at = datetime(\'now\') WHERE id = ?1'
  ).bind(negotiationId).run();
  return true;
}

export async function reconcileOrder(env, orderId) {
  if (!dbReady(env)) return null;
  return await env.DB.prepare('SELECT * FROM orders WHERE id = ?1').bind(orderId).first();
}

export function serializeOrderRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    buyer_email: row.buyer_email,
    status: row.status,
    created_at: row.created_at,
    ...row
  };
}

export async function readActiveNegotiation(env, orderId) {
  if (!dbReady(env)) return null;
  return await env.DB.prepare(
    'SELECT * FROM negotiations WHERE order_id = ?1 AND status = \'open\' ORDER BY updated_at DESC LIMIT 1'
  ).bind(orderId).first();
}

export async function listOrdersByEmail(env, email) {
  if (!dbReady(env)) return [];
  return await env.DB.prepare(
    'SELECT * FROM orders WHERE buyer_email = ?1 ORDER BY created_at DESC'
  ).bind(email).all();
}

export async function listNegotiationsForOrder(env, orderId) {
  if (!dbReady(env)) return [];
  return await env.DB.prepare(
    'SELECT * FROM negotiations WHERE order_id = ?1 ORDER BY updated_at DESC'
  ).bind(orderId).all();
}

export async function verifyBuyerToken(env, token) {
  if (!dbReady(env)) return false;
  const row = await env.DB.prepare(
    'SELECT * FROM buyer_tokens WHERE token = ?1 AND expires_at > datetime(\'now\')'
  ).bind(token).first();
  return Boolean(row);
}
