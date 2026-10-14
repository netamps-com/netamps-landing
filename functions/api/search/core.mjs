/**
 * Order search — the engine, separated from the route so it can be exercised
 * against a real database in `scripts/test-search.mjs`.
 *
 * ARCHITECTURE — deterministic filters first, model for free text last.
 * That ordering is enforced structurally, not by prompt politeness:
 *
 *   1. Exact filters (order id, email, date range, status, intent) become SQL
 *      predicates. No model is consulted for them. A date range decided by a
 *      language model has no ground truth to check itself against, so it would
 *      confidently return the wrong orders.
 *   2. Free text is handled in two steps:
 *        a. RECALL — the database enumerates a bounded pool of rows that ANY
 *           term could plausibly refer to (OR across terms, most recent first,
 *           capped at POOL_CAP). Still SQL, still real rows.
 *        b. PRECISION — the model is shown that pool WITH ITS INDICES and may
 *           only reply with indices into it. It selects; it does not retrieve.
 *           An order that is not in the pool cannot be asked for, so a
 *           hallucinated id has nowhere to land: out-of-range indices are
 *           discarded exactly like prose would be.
 *
 * WHY THE FALLBACK IS SUBSTRING, NOT "NO RESULTS". When the model is missing,
 * disabled by the `llm_enabled` emergency brake, or has a bad day, the same
 * pool is filtered for rows containing EVERY term. That is a weaker answer,
 * not a wrong one: every returned row genuinely contains the text. `plan`
 * reports which path ran, so a degraded search looks degraded rather than
 * quietly pretending to be semantic.
 *
 * Every row carries `why` — which of its own columns contained which term —
 * computed by the server from the row's real values, so the explanation can
 * be checked against the record it describes.
 */

import { runJson } from '../llm/client.mjs';
import { CHRONOLOGY } from '../negotiate/core.mjs';

export const MAX_LIMIT = 100;
export const DEFAULT_LIMIT = 50;
/**
 * Bounded pool the model may choose from. Sized so the prompt stays well
 * inside the small model's context (~100 rows × ~160 chars ≈ 4k tokens) —
 * growing this without re-measuring is how a search silently starts timing
 * out.
 */
export const POOL_CAP = 100;
export const MAX_TERMS = 8;
export const PRODUCT_TEXT_CAP = 120;
export const PROMPT_VERSION = 'order-search-t1-v1';

/** Searchable columns, in the order `why` reports them. */
export const COLUMNS = Object.freeze(['id', 'name', 'company', 'email', 'products']);

/**
 * Statuses the filter accepts: the negotiation ladder plus the legacy workflow
 * values that still sit on older rows. An unknown value is a 400 rather than a
 * silent no-match, so a typo cannot masquerade as an empty database.
 */
export const STATUS_VALUES = Object.freeze([
  ...CHRONOLOGY, 'Declined',
  'Pending', 'In Progress', 'Completed', 'Rejected', 'Approved',
  'Order Placed', 'Pending Review'
]);

function str(v, max) {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, max) : '';
}

/** Accept `2026-01-31` or a full ISO instant; reject anything else. */
export function dateBound(raw, endOfDay) {
  if (raw === undefined || raw === null || raw === '') return { value: null, ok: true };
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    // Regex shape alone is not a date: `2026-13-45` matches the pattern, and
    // Date.parse is lenient about overflow, so the components are checked
    // against a reconstructed UTC date. A bound that silently matched nothing
    // would look exactly like "no orders in that range".
    const [y, m, d] = s.split('-').map(Number);
    const probe = new Date(Date.UTC(y, m - 1, d));
    const real = probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
    if (!real) return { value: null, ok: false };
    return { value: endOfDay ? `${s}T23:59:59.999Z` : `${s}T00:00:00.000Z`, ok: true };
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) && !Number.isNaN(Date.parse(s))) {
    return { value: new Date(s).toISOString(), ok: true };
  }
  return { value: null, ok: false };
}

/** `%` and `_` are LIKE wildcards — a literal one in user input must not become one. */
export function escapeLike(s) {
  return String(s).replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Split free text into search terms: alphanumeric plus `_` and `-` (model
 * names carry both), lower-cased, de-duplicated, capped. Empty tokens are
 * dropped so a query made of punctuation cannot degenerate into `LIKE '%%'`,
 * which would match every row in the table.
 */
export function tokenize(text) {
  const raw = String(text || '').toLowerCase().split(/[^a-z0-9_+-]+/);
  const seen = new Set();
  const out = [];
  for (const t of raw) {
    if (t.length < 2 || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_TERMS) break;
  }
  return out;
}

/** Validate and normalise the exact-filter half of the request. */
export function normalizeFilters(raw) {
  const errors = [];
  const f = {
    orderId: str(raw?.orderId, 64),
    email: str(raw?.email, 320),
    status: str(raw?.status, 64),
    intent: str(raw?.intent, 8).toLowerCase()
  };

  const from = dateBound(raw?.from, false);
  const to = dateBound(raw?.to, true);
  if (!from.ok) errors.push('Invalid "from" date — use YYYY-MM-DD.');
  if (!to.ok) errors.push('Invalid "to" date — use YYYY-MM-DD.');
  f.from = from.value;
  f.to = to.value;
  if (f.from && f.to && f.from > f.to) errors.push('"from" is after "to".');

  if (f.status && !STATUS_VALUES.includes(f.status)) {
    errors.push(`Unknown status "${f.status.slice(0, 40)}".`);
  }
  if (f.intent && f.intent !== 'buy' && f.intent !== 'sell') {
    errors.push('Intent must be "buy" or "sell".');
  }
  if (f.email && f.email.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) {
    errors.push('That does not look like an email address.');
  }

  return { filters: f, errors };
}

/**
 * Build the deterministic WHERE clause. Every value is bound, never inlined.
 *
 * Email: a full address is compared exactly (case-insensitively), because
 * "which orders belong to this buyer" is an exact question. A fragment with no
 * `@` is treated as a contains-search — still an exact SQL comparison, never
 * an interpretation.
 */
export function buildWhere(f) {
  const where = [];
  const binds = [];

  if (f.orderId) {
    where.push("UPPER(r.id) LIKE ? ESCAPE '\\'");
    binds.push(`${escapeLike(f.orderId.toUpperCase())}%`);
  }
  if (f.email) {
    const lower = f.email.toLowerCase();
    if (f.email.includes('@')) {
      where.push("LOWER(COALESCE(r.email, '')) = ?");
      binds.push(lower);
    } else {
      where.push("LOWER(COALESCE(r.email, '')) LIKE ? ESCAPE '\\'");
      binds.push(`%${escapeLike(lower)}%`);
    }
  }
  if (f.from) { where.push('r.date >= ?'); binds.push(f.from); }
  if (f.to) { where.push('r.date <= ?'); binds.push(f.to); }
  if (f.status) { where.push('r.status = ?'); binds.push(f.status); }
  if (f.intent) { where.push("LOWER(COALESCE(r.intent, '')) = ?"); binds.push(f.intent); }

  return { where, binds };
}

/**
 * The filter shape sent back to the caller. Empty strings become `null` so
 * "not filtered" and "filtered to the empty string" are distinguishable in a
 * response nobody has to read the docs to interpret.
 */
export function publicFilters(f) {
  return {
    orderId: f.orderId || null,
    email: f.email || null,
    from: f.from || null,
    to: f.to || null,
    status: f.status || null,
    intent: f.intent || null
  };
}

const SELECT_COLUMNS =
  'r.id, r.intent, r.name, r.company, r.email, r.status, r.date, r.products';

/** One row's own text, lower-cased — the basis for the substring fallback. */
function rowText(r) {
  return [r.id, r.name, r.company, r.email, r.products]
    .map((v) => (typeof v === 'string' ? v.toLowerCase() : ''))
    .join(' ');
}

/**
 * Per-row provenance: for each term, which of the row's own columns contained
 * it. Derived from stored values, so it can be verified against the record.
 */
export function explainRow(r, terms) {
  const haystack = {
    id: String(r.id || '').toLowerCase(),
    name: String(r.name || '').toLowerCase(),
    company: String(r.company || '').toLowerCase(),
    email: String(r.email || '').toLowerCase(),
    products: String(r.products || '').toLowerCase()
  };
  return terms
    .map((term) => {
      const fields = COLUMNS.filter((c) => haystack[c].includes(term));
      return fields.length ? { term, fields } : null;
    })
    .filter(Boolean);
}

/** Flatten a stored product manifest to a single searchable/displayable line. */
export function parseProductText(raw) {
  if (!raw) return '';
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return String(raw).slice(0, PRODUCT_TEXT_CAP);
    return arr
      .map((p) => {
        if (!p || typeof p !== 'object') return String(p);
        return [p.category, p.details, p.name, p.model].filter(Boolean).join(' ');
      })
      .filter(Boolean)
      .join(' | ')
      .slice(0, PRODUCT_TEXT_CAP);
  } catch {
    return String(raw).slice(0, PRODUCT_TEXT_CAP);
  }
}

/** Compress a pool row to the one line the model is allowed to see. */
function toPromptLine(index, r, terms) {
  const products = parseProductText(r.products);
  const fields = [...new Set(explainRow(r, terms).flatMap((e) => e.fields))];
  const note = fields.length ? ` [hits:${fields.join(',')}]` : '';
  const cells = [
    String(index), String(r.id || '-'), String(r.name || '-'), String(r.company || '-'),
    String(r.email || '-'), String(r.intent || '-'), String(r.status || '-'),
    String(r.date || '-').slice(0, 19), products || '-'
  ];
  // ` | ` is the separator, so a value containing one would shift every column.
  return `${cells.map((c) => c.replace(/\s*\|\s*/g, '/')).join(' | ')}${note}`;
}

/**
 * Turn a model reply into pool indices. The gateway has already parsed the
 * JSON; here anything that is not an integer inside the pool is dropped.
 *
 * THE NO-FABRICATION GUARANTEE LIVES HERE. There is no branch that says "this
 * index is out of range, but the id looks plausible, so keep it" — an index
 * the model invented simply disappears.
 */
export function selectIndices(payload, poolSize) {
  const raw = Array.isArray(payload) ? payload : payload?.indices;
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const v of raw) {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isInteger(n) || n < 0 || n >= poolSize || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/* ── Engine ────────────────────────────────────────────────────────────── */

/**
 * Run one search.
 *
 * @param {object} env      D1 (`env.DB`) plus, optionally, Workers AI (`env.AI`)
 * @param {object} raw      `{ text, orderId, email, from, to, status, intent, limit, offset }`
 * @returns {Promise<{ok:boolean, status?:number, message?:string, errors?:string[]}|object>}
 *         On success the payload is the response body minus `success`.
 */
export async function runSearch(env, raw) {
  const started = Date.now();
  const text = str(raw?.text, 300);
  const terms = tokenize(text);
  const { filters, errors } = normalizeFilters(raw);
  if (errors.length) return { ok: false, status: 400, message: errors.join(' '), errors };

  const rawLimit = Number(raw?.limit);
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;
  const offset = Math.max(0, Number(raw?.offset) || 0);

  const { where, binds } = buildWhere(filters);
  const baseClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // ── 1. Deterministic path — no free text, or text that tokenised to nothing.
  // A database failure is reported as a failure, never folded into "0 matches":
  // an outage that looks like an empty result set is worse than an error.
  if (!terms.length) {
    let totalRes, rows;
    try {
      totalRes = await env.DB.prepare(`SELECT COUNT(*) AS n FROM returns r ${baseClause}`)
        .bind(...binds).first();
      rows = await env.DB.prepare(
        `SELECT ${SELECT_COLUMNS} FROM returns r ${baseClause} ORDER BY r.date DESC LIMIT ? OFFSET ?`
      ).bind(...binds, limit, offset).all();
    } catch (err) {
      console.error('[search] deterministic query failed:', err?.message);
      return { ok: false, status: 503, message: 'Order database unavailable.' };
    }

    const items = ((rows && rows.results) || []).map((r) => ({
      id: r.id,
      intent: r.intent || null,
      name: r.name || null,
      company: r.company || null,
      email: r.email || null,
      status: r.status || null,
      date: r.date || null,
      products: parseProductText(r.products),
      why: []
    }));

    return {
      ok: true,
      total: Number((totalRes && totalRes.n) || 0),
      limit, offset,
      filters: publicFilters(filters),
      plan: {
        mode: 'deterministic', terms: [], poolSize: null,
        modelUsed: null, selection: null, fallback: null,
        latencyMs: Date.now() - started
      },
      items
    };
  }

  // ── 2. Recall — a bounded pool of rows ANY term could refer to.
  const likeClause = terms
    .map(() => `(${COLUMNS.map((c) => `LOWER(COALESCE(r.${c}, '')) LIKE ? ESCAPE '\\'`).join(' OR ')})`)
    .join(' OR ');
  // One bind per (term × column), every bind carrying that term. `_` and `+`
  // survive tokenisation (model names use them), so terms are escaped too.
  const textBinds = terms.flatMap((t) => COLUMNS.map(() => `%${escapeLike(t)}%`));

  const recallWhere = `WHERE ${where.length ? `${where.join(' AND ')} AND ` : ''}(${likeClause})`;

  const poolRes = await env.DB.prepare(
    `SELECT ${SELECT_COLUMNS} FROM returns r ${recallWhere} ORDER BY r.date DESC LIMIT ?`
  ).bind(...binds, ...textBinds, POOL_CAP).all().catch((err) => {
    console.error('[search] recall query failed:', err?.message);
    return { __failed: true };
  });

  if (poolRes && poolRes.__failed) {
    return { ok: false, status: 503, message: 'Order database unavailable.' };
  }

  const pool = (poolRes && poolRes.results) || [];

  // ── 3. Precision — the model selects indices, or JS requires every term.
  let selection = 'substring';
  let modelUsed = null;
  let fallback = null;
  let chosen = [];

  if (!pool.length) {
    fallback = 'no_candidates';
    selection = 'none';
  } else {
    const call = await runJson(env, {
      feature: 'order_search',
      promptVersion: PROMPT_VERSION,
      tier: 'auto',
      temperature: 0,
      maxTokens: 400,
      timeoutMs: 8000,
      system: MODEL_SYSTEM,
      user: buildUserPrompt(pool, terms)
    });

    if (call?.ok === true) {
      const idx = selectIndices(call.payload, pool.length);
      if (idx.length) {
        chosen = idx.map((i) => pool[i]);
        selection = 'model';
        modelUsed = call.model || null;
      } else {
        fallback = 'model_returned_nothing';
      }
    } else {
      fallback = call?.reason || 'MODEL_FAILED';
    }

    // Degraded path (or no model at all): keep only rows that genuinely
    // contain every term. Weaker than a semantic match, never a false one.
    if (selection !== 'model') {
      chosen = pool.filter((r) => {
        const t = rowText(r);
        return terms.every((term) => t.includes(term));
      });
    }
  }

  // Provenance is recomputed from the winning rows, so `why` always describes
  // the row's own columns and never the model's opinion of them.
  const items = chosen.map((r) => ({
    id: r.id,
    intent: r.intent || null,
    name: r.name || null,
    company: r.company || null,
    email: r.email || null,
    status: r.status || null,
    date: r.date || null,
    products: parseProductText(r.products),
    why: explainRow(r, terms)
  }));

  const paged = items.slice(offset, offset + limit);

  return {
    ok: true,
    total: items.length,
    limit,
    offset,
    filters: publicFilters(filters),
    plan: {
      mode: 'semantic',
      terms,
      poolSize: pool.length,
      modelUsed,
      selection,
      fallback,
      latencyMs: Date.now() - started
    },
    items: paged
  };
}

const MODEL_SYSTEM = [
  'You select records from a FIXED list. You never search, you never recall, you never invent.',
  'Reply with ONLY a JSON object: {"indices":[0,3,7]}',
  'Rules:',
  '- "indices" may ONLY contain integers copied from the list you were given. An integer not in the list is invalid.',
  '- An index means: this record is plausibly what the person is looking for.',
  '- Be selective. Returning every index is a failure; returning none when something fits is also a failure.',
  '- Max 25 indices, most likely first.',
  '- No prose, no markdown fences, no explanation.'
].join('\n');

function buildUserPrompt(pool, terms) {
  return [
    'RECORDS (index | order id | name | company | email | intent | status | date | products [hits: columns containing a search term]):',
    ...pool.map((r, i) => toPromptLine(i, r, terms)),
    '',
    `SEARCH: ${JSON.stringify(terms.join(' '))}`,
    'JSON:'
  ].join('\n');
}
