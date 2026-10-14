/**
 * Append-only per-order email ledger.
 *
 * WHAT IT ANSWERS. For any order — BUY or SELL — the question "how many emails
 * went out for this, why, and when?" without opening Resend, without grepping
 * audit_logs, and without trusting a single mutable status column on the order
 * row. The order row can only hold ONE `confirmemailstatus`; a real order
 * accumulates a confirmation, a staff notification, a resend and a delivery
 * webhook, and the user needs all of them with their own causes and stamps.
 *
 * MODEL. One row per SEND or provider EVENT, never an update to a previous row.
 * A send records `sent`/`failed`; Resend's webhook later records `delivered`,
 * `bounced` or `complained` as additional rows referencing the same message id.
 * That is event sourcing over email: the count is `COUNT(*)`, the history is
 * the rows, and nothing is ever rewritten after capture.
 *
 * CAUSES (closed vocabulary, so a count is meaningful):
 *   order_confirmation — the buyer's own receipt for their request
 *   order_confirmation_resend — dashboard resend of that receipt
 *   staff_notification — a new/updated order pushed to the ops inbox
 *   escalation — an escalated order raised to ops
 *   delivery_result   — a provider webhook (delivered/bounced/complained)
 *
 * A closed set matters: an open string would let two spellings of one cause
 * split a count, which is exactly the kind of quiet lie this table exists to
 * prevent.
 */

export const EMAIL_CAUSES = Object.freeze([
  'order_confirmation',
  'order_confirmation_resend',
  'staff_notification',
  'escalation',
  'delivery_result'
]);

export const EMAIL_OUTCOMES = Object.freeze(['sent', 'failed', 'delivered', 'bounced', 'complained']);

let ensured = { d1: false, pg: false };

const DDL_D1 = `
  CREATE TABLE IF NOT EXISTS order_emails (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    intent TEXT,
    cause TEXT NOT NULL,
    outcome TEXT NOT NULL,
    recipient TEXT,
    subject TEXT,
    message_id TEXT,
    detail TEXT,
    at TEXT NOT NULL
  )`;
const DDL_INDEXES_D1 = [
  'CREATE INDEX IF NOT EXISTS idx_order_emails_req ON order_emails(request_id)',
  'CREATE INDEX IF NOT EXISTS idx_order_emails_msg ON order_emails(message_id)'
];
const DDL_PG = `
  CREATE TABLE IF NOT EXISTS order_emails (
    id VARCHAR(64) PRIMARY KEY,
    request_id VARCHAR(64) NOT NULL,
    intent VARCHAR(16),
    cause VARCHAR(48) NOT NULL,
    outcome VARCHAR(32) NOT NULL,
    recipient VARCHAR(254),
    subject VARCHAR(512),
    message_id VARCHAR(128),
    detail TEXT,
    at TIMESTAMPTZ NOT NULL
  )`;
const DDL_INDEX_PG = 'CREATE INDEX IF NOT EXISTS idx_order_emails_req ON order_emails(request_id)';

function hasD1(env) {
  return Boolean(env && env.DB && typeof env.DB.prepare === 'function');
}

async function ensureSchema(env) {
  if (hasD1(env)) {
    if (!ensured.d1) {
      await env.DB.prepare(DDL_D1).run();
      for (const stmt of DDL_INDEXES_D1) await env.DB.prepare(stmt).run();
      ensured.d1 = true;
    }
    return;
  }
  if (env && env.DATABASE_URL && !ensured.pg) {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: env.DATABASE_URL });
    await client.connect();
    try {
      await client.query(DDL_PG);
      await client.query(DDL_INDEX_PG);
    } finally {
      await client.end();
    }
    ensured.pg = true;
  }
}

/** Reset the memoised DDL guard — used by the test harness on a fresh DB. */
export function resetOrderEmailsMemo() {
  ensured = { d1: false, pg: false };
}

/**
 * Record one email send or provider event.
 *
 * Best-effort BY DESIGN, and deliberately unlike appendOrderEvent: this is
 * called from inside send paths, where a failed audit INSERT must never turn a
 * delivered email into a 500 for the user. The failure is logged so it is
 * visible in Workers output rather than invisible, which is the difference
 * between "best effort" and "silently swallowed".
 *
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
export async function logOrderEmail(env, {
  requestId, intent = null, cause, outcome, recipient = null,
  subject = null, messageId = null, detail = null, at = null
}) {
  if (!requestId || !EMAIL_CAUSES.includes(cause) || !EMAIL_OUTCOMES.includes(outcome)) {
    return { ok: false, error: 'invalid email log entry' };
  }
  try {
    await ensureSchema(env);
    const row = {
      id: crypto.randomUUID(),
      request_id: String(requestId).slice(0, 64),
      intent: intent ? String(intent).toLowerCase().slice(0, 16) : null,
      cause,
      outcome,
      recipient: recipient ? String(recipient).slice(0, 254) : null,
      subject: subject ? String(subject).slice(0, 512) : null,
      message_id: messageId ? String(messageId).slice(0, 128) : null,
      detail: detail
        ? (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 2000)
        : null,
      at: at || new Date().toISOString()
    };

    if (hasD1(env)) {
      await env.DB.prepare(
        'INSERT INTO order_emails (id, request_id, intent, cause, outcome, recipient, subject, message_id, detail, at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)'
      ).bind(row.id, row.request_id, row.intent, row.cause, row.outcome, row.recipient, row.subject, row.message_id, row.detail, row.at).run();
      return { ok: true };
    }

    if (env && env.DATABASE_URL) {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      try {
        await client.query(
          'INSERT INTO order_emails (id, request_id, intent, cause, outcome, recipient, subject, message_id, detail, at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [row.id, row.request_id, row.intent, row.cause, row.outcome, row.recipient, row.subject, row.message_id, row.detail, row.at]
        );
        return { ok: true };
      } finally {
        await client.end();
      }
    }

    return { ok: false, error: 'no database attached' };
  } catch (err) {
    const message = String((err && err.message) || err);
    console.error('[order-emails] append FAILED', JSON.stringify({ requestId, cause, outcome, message }));
    return { ok: false, error: message };
  }
}

function shape(r) {
  let detail = r.detail || null;
  if (detail && typeof detail === 'string' && detail.startsWith('{')) {
    try { detail = JSON.parse(detail); } catch { /* keep the raw string */ }
  }
  return {
    cause: String(r.cause),
    outcome: String(r.outcome),
    intent: r.intent || null,
    recipient: r.recipient || null,
    subject: r.subject || null,
    messageId: r.message_id || null,
    detail,
    at: r.at
  };
}

/**
 * Every email tied to one order, newest first (the dashboard reads it as a
 * running feed; the count sits above it).
 */
export async function readOrderEmails(env, requestId) {
  if (!requestId) return [];
  try {
    await ensureSchema(env);
    if (hasD1(env)) {
      const res = await env.DB.prepare(
        'SELECT * FROM order_emails WHERE request_id = ?1 ORDER BY at DESC, rowid DESC'
      ).bind(String(requestId).slice(0, 64)).all();
      return (res.results || []).map(shape);
    }
    if (env && env.DATABASE_URL) {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      try {
        const res = await client.query(
          'SELECT * FROM order_emails WHERE request_id = $1 ORDER BY at DESC, id DESC',
          [String(requestId).slice(0, 64)]
        );
        return (res.rows || []).map(shape);
      } finally {
        await client.end();
      }
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Count + breakdown for an order in one query, so a list view can show
 * "4 emails" on every row without loading the bodies.
 * Returns { total, byCause, byOutcome, lastAt }.
 */
export async function summarizeOrderEmails(env, requestIds) {
  const ids = (Array.isArray(requestIds) ? requestIds : [])
    .filter((x) => typeof x === 'string' && x)
    .slice(0, 500);
  const out = new Map();
  if (ids.length === 0) return out;

  const blank = () => ({ total: 0, byCause: {}, byOutcome: {}, lastAt: null });
  for (const id of ids) out.set(id, blank());

  try {
    await ensureSchema(env);
    if (hasD1(env)) {
      for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50);
        const res = await env.DB.prepare(
          `SELECT request_id, cause, outcome, at FROM order_emails WHERE request_id IN (${chunk.map(() => '?').join(',')}) ORDER BY at ASC`
        ).bind(...chunk).all();
        for (const r of (res.results || [])) fold(out, r.request_id, r);
      }
    } else if (env && env.DATABASE_URL) {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      try {
        const res = await client.query(
          `SELECT request_id, cause, outcome, at FROM order_emails WHERE request_id = ANY($1) ORDER BY at ASC`,
          [ids]
        );
        for (const r of (res.rows || [])) fold(out, r.request_id, r);
      } finally {
        await client.end();
      }
    }
  } catch {
    // Counts are a display nicety; a missing table leaves the blanks already
    // seeded above rather than failing the list request.
  }
  return out;
}

function fold(out, requestId, r) {
  const acc = out.get(requestId) || (out.set(requestId, blankNow()), out.get(requestId));
  acc.total += 1;
  acc.byCause[r.cause] = (acc.byCause[r.cause] || 0) + 1;
  acc.byOutcome[r.outcome] = (acc.byOutcome[r.outcome] || 0) + 1;
  if (!acc.lastAt || r.at > acc.lastAt) acc.lastAt = r.at;
}

function blankNow() {
  return { total: 0, byCause: {}, byOutcome: {}, lastAt: null };
}
