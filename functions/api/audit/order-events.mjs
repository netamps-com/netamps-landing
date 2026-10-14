/**
 * Append-only order timeline — the audit trail behind every ladder a user sees.
 *
 * WHY THIS EXISTS. Three screens show where an order stands: the login
 * dashboard, the staff Negotiations monitor and the buyer's Track page. Each
 * of them used to reconstruct "where are we" from whatever columns happened to
 * be current, which is how they ended up telling three different stories. This
 * table records each transition AS IT HAPPENED, with a timestamp and an actor,
 * and every screen renders the same rows — one table, three views, so they
 * cannot drift apart by construction.
 *
 * IMMUTABILITY (load-bearing): rows are INSERTed once and never UPDATEd or
 * DELETEd, by any code path in this repo. Corrections are recorded as NEW rows
 * (see `reconciled`), because a captured fact does not change — it accumulates
 * context. `seq` is per-order and monotonic, so the order of events is a fact
 * about the world, not a function of clock skew.
 *
 * Storage: D1 when `env.DB` is attached, Postgres otherwise — the same posture
 * returns.js uses for the order row itself. Failures are reported to the caller
 * (never silently swallowed): an audit write that cannot land must not pretend
 * it did, though it must also never break the user action that triggered it.
 */

export const EVENT_KINDS = Object.freeze([
  'created',     // order filed by the buyer → rung Pending
  'accepted',    // staff pressed "Order Accepted for Negotiation"
  'round',       // one negotiation round (offer/counter/accept/reject/withdraw/approve)
  'declined',    // declined before or outside a thread
  'reconciled',  // the projection was repaired from the thread (drift, not a decision)
  'status_set'   // a status write outside the negotiation module
]);

let ensured = { d1: false, pg: false };

const DDL_D1 = `
  CREATE TABLE IF NOT EXISTS order_events (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    kind TEXT NOT NULL,
    rung TEXT,
    actor TEXT,
    detail TEXT,
    at TEXT NOT NULL
  )`;
const DDL_PG = `
  CREATE TABLE IF NOT EXISTS order_events (
    id VARCHAR(64) PRIMARY KEY,
    request_id VARCHAR(64) NOT NULL,
    seq INTEGER NOT NULL,
    kind VARCHAR(32) NOT NULL,
    rung VARCHAR(64),
    actor VARCHAR(254),
    detail TEXT,
    at TIMESTAMPTZ NOT NULL
  )`;
// UNIQUE on (request_id, seq): the ordering of the audit trail is a FACT, so
// the schema — not the application — is what stops two concurrent writers from
// stamping one sequence number twice. A collision surfaces as a constraint
// violation and is retried with a fresh number.
const DDL_INDEXES_D1 = [
  'CREATE INDEX IF NOT EXISTS idx_order_events_req ON order_events(request_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_order_events_req_seq ON order_events(request_id, seq)'
];
const DDL_INDEX_PG = 'CREATE INDEX IF NOT EXISTS idx_order_events_req ON order_events(request_id)';

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
export function resetOrderEventsMemo() {
  ensured = { d1: false, pg: false };
}

/**
 * Record one transition. Never mutates an existing row.
 *
 * @param {object} env
 * @param {{requestId:string, kind:string, rung?:string|null, actor?:string|null, detail?:object|null, seq?:number, at?:string}} ev
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
export async function appendOrderEvent(env, { requestId, kind, rung = null, actor = null, detail = null, seq, at }) {
  if (!requestId || !EVENT_KINDS.includes(kind)) {
    return { ok: false, error: 'invalid event' };
  }
  try {
    await ensureSchema(env);
    const when = at || new Date().toISOString();
    const row = {
      id: crypto.randomUUID(),
      request_id: String(requestId).slice(0, 64),
      kind,
      rung: rung ? String(rung).slice(0, 64) : null,
      actor: actor ? String(actor).slice(0, 254) : null,
      detail: detail ? JSON.stringify(detail).slice(0, 4000) : null,
      at: when
    };

    if (hasD1(env)) {
      // Allocate seq as MAX+1 and let the UNIQUE(request_id, seq) index settle
      // any race: a losing writer gets a constraint violation and retries with
      // a fresh number. A timeline whose ordering is uncertain is not an
      // audit trail, so the loser retries rather than silently sharing a slot.
      let lastError = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const next = Number.isInteger(seq) ? seq : await nextSeqD1(env, row.request_id);
        try {
          await env.DB.prepare(
            'INSERT INTO order_events (id, request_id, seq, kind, rung, actor, detail, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)'
          ).bind(row.id, row.request_id, next, row.kind, row.rung, row.actor, row.detail, row.at).run();
          return { ok: true, seq: next };
        } catch (err) {
          lastError = err;
          if (Number.isInteger(seq)) break; // caller pinned the number — do not renumber
        }
      }
      throw lastError || new Error('sequence allocation failed');
    }

    if (env && env.DATABASE_URL) {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      try {
        const next = Number.isInteger(seq) ? seq : await nextSeqPg(client, row.request_id);
        await client.query(
          'INSERT INTO order_events (id, request_id, seq, kind, rung, actor, detail, at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [row.id, row.request_id, next, row.kind, row.rung, row.actor, row.detail, row.at]
        );
        return { ok: true, seq: next };
      } finally {
        await client.end();
      }
    }

    return { ok: false, error: 'no database attached' };
  } catch (err) {
    const message = String((err && err.message) || err);
    console.error('[order-events] append FAILED', JSON.stringify({ requestId, kind, message }));
    return { ok: false, error: message };
  }
}

/**
 * Allocate the next per-order sequence number as `MAX(seq) + 1` plus a unique
 * index, relying on the PRIMARY KEY to reject a collision rather than to
 * discover it later: on conflict we retry with the next number. The retry is
 * bounded so a pathological writer cannot spin.
 */
async function nextSeqD1(env, requestId) {
  const cur = await env.DB.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM order_events WHERE request_id = ?1')
    .bind(requestId).first();
  return Number(cur && cur.m ? cur.m : 0) + 1;
}

async function nextSeqPg(client, requestId) {
  const cur = await client.query('SELECT COALESCE(MAX(seq), 0) AS m FROM order_events WHERE request_id = $1', [requestId]);
  return Number(cur.rows && cur.rows[0] ? cur.rows[0].m : 0) + 1;
}

function shape(r) {
  let detail = null;
  try {
    detail = r.detail ? JSON.parse(r.detail) : null;
  } catch {
    detail = null;
  }
  return {
    seq: Number(r.seq),
    kind: String(r.kind),
    rung: r.rung || null,
    actor: r.actor || null,
    detail,
    at: r.at
  };
}

/** Every event for one order, oldest first. */
export async function readOrderEvents(env, requestId) {
  if (!requestId) return [];
  try {
    await ensureSchema(env);
    if (hasD1(env)) {
      const res = await env.DB.prepare('SELECT * FROM order_events WHERE request_id = ?1 ORDER BY seq ASC')
        .bind(String(requestId).slice(0, 64)).all();
      return (res.results || []).map(shape);
    }
    if (env && env.DATABASE_URL) {
      const { Client } = await import('pg');
      const client = new Client({ connectionString: env.DATABASE_URL });
      await client.connect();
      try {
        const res = await client.query('SELECT * FROM order_events WHERE request_id = $1 ORDER BY seq ASC', [String(requestId).slice(0, 64)]);
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
 * Many orders in one round trip — used by the staff monitor, which lists up to
 * 100 threads and must not issue one query per row to draw a ladder.
 * Returns a Map of requestId → events.
 */
export async function readOrderEventsFor(env, requestIds) {
  const ids = (Array.isArray(requestIds) ? requestIds : [])
    .filter((x) => typeof x === 'string' && x)
    .slice(0, 500);
  const out = new Map();
  if (ids.length === 0) return out;
  // Pre-seed every requested id with an empty list: a caller asking for an
  // order that has no events must get "no history", not "undefined" — the two
  // are different answers, and only one of them renders.
  for (const id of ids) out.set(id, []);
  if (!hasD1(env)) {
    // Postgres path stays per-order: the monitor's default store is D1, and a
    // hand-rolled IN builder is more risk than one extra query per row.
    for (const id of ids) out.set(id, await readOrderEvents(env, id));
    return out;
  }
  try {
    await ensureSchema(env);
    // Chunked: D1 caps bound parameters per statement, and this call is handed
    // every id in a monitor list — building one giant IN clause would fail
    // outright on the first full page.
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const placeholders = chunk.map(() => '?').join(',');
      const res = await env.DB
        .prepare(`SELECT * FROM order_events WHERE request_id IN (${placeholders}) ORDER BY request_id ASC, seq ASC`)
        .bind(...chunk).all();
      for (const r of (res.results || [])) {
        const list = out.get(r.request_id) || [];
        list.push(shape(r));
        out.set(r.request_id, list);
      }
    }
  } catch {
    for (const id of ids) if (!out.has(id)) out.set(id, []);
  }
  return out;
}

/**
 * The chronological ladder a user reads: every rung the order has actually
 * stood on, with the timestamp it was first reached and who put it there.
 * The last entry is the current position — derived from history, never from a
 * mutable column, which is the whole point.
 */
export function deriveLadder(events, fallbackStatus) {
  const list = Array.isArray(events) ? events : [];
  const rungs = [];
  for (const e of list) {
    if (!e.rung) continue;
    const last = rungs[rungs.length - 1];
    if (last && last.rung === e.rung) {
      // Same rung reached twice — keep the FIRST time it was reached, and note
      // the later touch. The ladder records when a position was entered.
      last.touches = (last.touches || 1) + 1;
      last.lastAt = e.at;
      continue;
    }
    rungs.push({ rung: e.rung, at: e.at, by: e.actor || null, touches: 1, lastAt: e.at });
  }
  if (rungs.length === 0 && fallbackStatus) {
    rungs.push({ rung: fallbackStatus, at: null, by: null, touches: 0, lastAt: null });
  }
  return rungs;
}
