/**
 * NETAMPS AI — module registry, access policy, budgets and response validators.
 *
 * Every Llama call in this project goes through the shared gateway
 * (`llm/client.mjs`), but the gateway is deliberately opinionated about
 * nothing except transport: it does not know which modules exist, who may
 * invoke them, how much each may spend, or what a correct answer looks like.
 * This registry is that missing layer — the single record of every governed
 * model consumer, enforced by the orchestrator (`orchestrator.mjs`), reported
 * by the dashboard (`/dashboard/ai`), reviewed through the suggestions inbox.
 *
 * ── THE GOVERNED MODULES ────────────────────────────────────────────────────
 * Registered from each consumer's actual call site (tier, token budget and
 * prompt contract verified against code, not memory):
 *   normalize      normalize/line.js        descriptor extraction
 *   enrich         products/enrich.js       external-hint extraction
 *   buy_suggest    products/suggest.js      typeahead shortlist pick
 *   match_rank     matching/ranker.js       candidate re-rank
 *   order_search   search/core.mjs           pool-index selection
 *   track_milestone track/extract.js        milestone verdict extraction
 *   login_assist / returns_assist / domain_assist / ingest_stats /
 *   module_recovery ai/assistant.js          operator assistant modules
 *   feed_optimize   ai/feed-optimize.js     feed item copy rewrite
 *   feed_draft_ticker ai/feed-draft-ticker.js feed ticker flash draft
 *
 * `route` records how the consumer reaches the model today:
 *   'direct'        the call site still calls the gateway (llm/client.mjs)
 *                   itself — the original six plus the assistant modules.
 *   'orchestrated'  the call site goes through invokeModule(), so it is
 *                   fully governed end to end (budgets, schema validation and
 *                   an ai_runs audit row per attempt). The feed AI endpoints
 *                   are the first modules registered already-migrated.
 * The registry describes each target contract, so moving a 'direct' module
 * onto the orchestrator is a call-site swap, never a redesign.
 *
 * ── ACCESS ──────────────────────────────────────────────────────────────────
 * `aiAuthorized(user)`: a valid login session AND (role admin/staff OR a
 * @netamps.com mailbox). Buyers and the public never reach this module — the
 * endpoint returns 401 before any model work for anonymous callers and 403
 * for authenticated non-operators. Roles beyond that: staff may invoke and
 * suggest; only admins may flip flags, set budgets, or review suggestions.
 *
 * ── VALIDATORS (precision machinery) ────────────────────────────────────────
 *   schema    required keys + value types (+ int enums where the contract has
 *             them: milestone taxonomy, index lists). Shape, not domain — the
 *             module's own validator keeps owning domain rules.
 *   grounding every extractive claim must resolve to something the caller
 *             supplied: shortlist ids ⊆ allowedIds, indices < pool size,
 *             quotes verbatim in the source text.
 *   math      structural arithmetic rules (op + field refs, never parsed
 *             expressions — no injection surface): recompute declared totals
 *             deterministically and reject mismatches. Implemented and tested;
 *             no current module returns computed money (their numerics are
 *             validator-computed locally), so rule sets are empty by default
 *             and the first module that needs one plugs it here.
 *
 * Conventions (same as matching/ranker.js): pure helpers exported for the
 * Node harness; writers return {ok, reason} and never throw for domain
 * failures; D1-only, prepare/bind/first/all/run surface only.
 */

export const AI_REGISTRY_VERSION = 'netamps-ai-v1';

export const AI_MODULES = Object.freeze([
  {
    id: 'normalize', feature: 'normalize', owner: 'normalize/line.js',
    purpose: 'Extract IT hardware specs from free text into a descriptor.',
    tier: 'auto', maxTokens: 400, dailyBudget: 5000, route: 'direct',
    schema: {
      required: ['category', 'manufacturer', 'model', 'formFactor', 'cpu', 'memoryGb', 'storage', 'ports', 'confidence'],
      types: {
        category: ['string', 'null'], manufacturer: ['string', 'null'], model: ['string', 'null'],
        formFactor: ['string', 'null'], cpu: ['array'], memoryGb: ['number', 'null'],
        storage: ['array'], ports: ['number', 'null'], confidence: ['number']
      }
    },
    grounding: null, math: []
  },
  {
    id: 'enrich', feature: 'enrich', owner: 'products/enrich.js',
    purpose: 'Expand abbreviations from an external hint into a descriptor.',
    tier: 'auto', maxTokens: 400, dailyBudget: 500, route: 'direct',
    schema: {
      required: ['category', 'manufacturer', 'model', 'formFactor', 'cpu', 'memoryGb', 'storage', 'ports'],
      types: {
        category: ['string', 'null'], manufacturer: ['string', 'null'], model: ['string', 'null'],
        formFactor: ['string', 'null'], cpu: ['array'], memoryGb: ['number', 'null'],
        storage: ['array'], ports: ['number', 'null']
      }
    },
    grounding: null, math: []
  },
  {
    id: 'buy_suggest', feature: 'buy_suggest', owner: 'products/suggest.js',
    purpose: 'Pick catalog ids from a shortlist for a buyer typeahead query.',
    tier: 'small', maxTokens: 256, dailyBudget: 8000, route: 'direct',
    schema: {
      required: ['candidates', 'unmatched'],
      types: { candidates: ['array'], unmatched: ['boolean'] }
    },
    grounding: { kind: 'ids', listKey: 'allowedIds', max: 4 },
    math: []
  },
  {
    id: 'match_rank', feature: 'match-rank', owner: 'matching/ranker.js',
    purpose: 'Re-rank a deterministic shortlist of SELL lines for a BUY line.',
    tier: 'auto', maxTokens: 700, dailyBudget: 500, route: 'direct',
    schema: {
      required: ['rankings'],
      types: { rankings: ['array'] },
      items: {
        rankings: {
          required: ['index', 'fit', 'gaps', 'rationale'],
          types: { index: ['int'], fit: ['number'], gaps: ['string'], rationale: ['string'] }
        }
      }
    },
    grounding: { kind: 'indices', sizeKey: 'shortlistLength' },
    math: []
  },
  {
    id: 'order_search', feature: 'order_search', owner: 'search/core.mjs',
    purpose: 'Select pool indices matching a free-text order search.',
    tier: 'auto', maxTokens: 400, dailyBudget: 2000, route: 'direct',
    schema: {
      required: ['indices'],
      types: { indices: ['array'] },
      items: { indices: { types: { __self__: ['int'] } } }
    },
    grounding: { kind: 'indices', sizeKey: 'poolSize', max: 25 },
    math: []
  },
  {
    id: 'track_milestone', feature: 'track_milestone', owner: 'track/extract.js',
    purpose: 'Extract milestone events from carrier tracking page text.',
    tier: 'small', maxTokens: 256, dailyBudget: 2000, route: 'direct',
    schema: {
      required: ['events', 'unmatched'],
      types: { events: ['array'], unmatched: ['boolean'] },
      items: {
        events: {
          required: ['milestone', 'quote'],
          types: { milestone: ['int'], quote: ['string'] },
          enums: { milestone: [5, 6, 8, 9, 10] }
        }
      }
    },
    grounding: { kind: 'quotes', textKey: 'pageText', minLen: 8 },
    math: []
  },
  {
    id: 'login_assist', feature: 'login', owner: 'login/page.tsx',
    purpose: 'AI assistance for login anomaly detection, security analysis, and session management.',
    tier: 'small', maxTokens: 256, dailyBudget: 1000, route: 'direct',
    schema: {
      required: ['analysis', 'recommendations'],
      types: { analysis: ['string'], recommendations: ['array'] }
    },
    grounding: null, math: []
  },
  {
    id: 'returns_assist', feature: 'returns', owner: 'returns/page.tsx',
    purpose: 'AI assistance for returns processing, price analysis, and negotiation suggestions.',
    tier: 'auto', maxTokens: 400, dailyBudget: 2000, route: 'direct',
    schema: {
      required: ['analysis', 'suggestions'],
      types: { analysis: ['string'], suggestions: ['array'] }
    },
    grounding: null, math: []
  },
  {
    id: 'domain_assist', feature: 'domain', owner: 'domain/page.tsx',
    purpose: 'AI assistance for domain management, DNS configuration, and SSL/TLS analysis.',
    tier: 'auto', maxTokens: 400, dailyBudget: 1000, route: 'direct',
    schema: {
      required: ['analysis', 'recommendations'],
      types: { analysis: ['string'], recommendations: ['array'] }
    },
    grounding: null, math: []
  },
  {
    id: 'ingest_stats', feature: 'ingest', owner: 'ingest/stats.js',
    purpose: 'AI assistance for data ingestion statistics, anomaly detection, and trend analysis.',
    tier: 'auto', maxTokens: 400, dailyBudget: 1000, route: 'direct',
    schema: {
      required: ['summary', 'anomalies'],
      types: { summary: ['string'], anomalies: ['array'] }
    },
    grounding: null, math: []
  },
  {
    id: 'module_recovery', feature: 'module_recovery', owner: 'modules/recovery.js',
    purpose: 'AI assistance for recovering failed modules, diagnostics, and self-healing.',
    tier: 'auto', maxTokens: 400, dailyBudget: 500, route: 'direct',
    schema: {
      required: ['diagnosis', 'recovery_steps'],
      types: { diagnosis: ['string'], recovery_steps: ['array'] }
    },
    grounding: null, math: []
  },
  // Feed AI. The first two modules whose call site already runs through
  // invokeModule() (route 'orchestrated'), so they inherit the whole gate
  // chain — brake, flag, budget, schema validation and audit — for free.
  {
    id: 'feed_optimize', feature: 'feed_optimize', owner: 'ai/feed-optimize.js',
    purpose: 'Rewrite one feed item title and detail for clarity and impact.',
    tier: 'small', maxTokens: 300, dailyBudget: 1000, route: 'orchestrated',
    schema: {
      required: ['title', 'detail'],
      types: { title: ['string'], detail: ['string'] }
    },
    grounding: null, math: []
  },
  {
    id: 'feed_draft_ticker', feature: 'feed_draft_ticker', owner: 'ai/feed-draft-ticker.js',
    purpose: 'Draft a short scrolling ticker flash for the landing feed from a tag.',
    tier: 'small', maxTokens: 100, dailyBudget: 1000, route: 'orchestrated',
    schema: {
      required: ['text'],
      types: { text: ['string'] }
    },
    grounding: null, math: []
  }
]);

export function getModule(id) {
  return AI_MODULES.find((m) => m.id === String(id || '')) || null;
}

/* ── Access policy ───────────────────────────────────────────────────────── */

const STAFF_DOMAIN = '@netamps.com';

/**
 * Only authorized Netamps operators reach the AI module: a valid login
 * session AND (role admin/staff OR a @netamps.com mailbox). Buyers, the
 * public and expired sessions never get past this — the endpoint answers 401
 * before any model work for anonymous callers, 403 for authenticated
 * non-operators.
 */
export function aiAuthorized(user) {
  if (!user || typeof user.email !== 'string' || !user.email) return false;
  if (user.role === 'admin' || user.role === 'staff') return true;
  return user.email.toLowerCase().endsWith(STAFF_DOMAIN);
}

/** Flag/budget/suggestion review — admin only. */
export function aiAdmin(user) {
  if (!user || typeof user.email !== 'string') return false;
  return user.role === 'admin' || user.email.toLowerCase() === 'admin@netamps.com';
}

/* ── Tables ──────────────────────────────────────────────────────────────── */

export async function ensureAiTables(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS ai_modules (
       id TEXT PRIMARY KEY,
       enabled INTEGER NOT NULL DEFAULT 1,
       daily_budget INTEGER NOT NULL DEFAULT 1000,
       updated_at TEXT
     )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS ai_runs (
       id TEXT PRIMARY KEY,
       module_id TEXT NOT NULL,
       actor TEXT,
       ok INTEGER NOT NULL,
       reason TEXT,
       model TEXT,
       latency_ms INTEGER,
       prompt_version TEXT,
       checks TEXT,
       created_at TEXT NOT NULL
     )`
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_ai_runs_module ON ai_runs(module_id, created_at)'
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS ai_suggestions (
       id TEXT PRIMARY KEY,
       kind TEXT NOT NULL,
       title TEXT NOT NULL,
       detail TEXT,
       module_id TEXT,
       status TEXT NOT NULL DEFAULT 'open',
       actor TEXT,
       reviewer TEXT,
       decided_at TEXT,
       created_at TEXT NOT NULL
     )`
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_ai_suggestions_status ON ai_suggestions(status, created_at)'
  ).run();
  // Seed the registry mirror: one row per module, defaults from the catalog.
  // INSERT OR IGNORE keeps operator overrides across deploys — a redeploy
  // never silently re-enables a module someone switched off.
  const at = new Date().toISOString();
  for (const m of AI_MODULES) {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO ai_modules (id, enabled, daily_budget, updated_at) VALUES (?1, 1, ?2, ?3)'
    ).bind(m.id, m.dailyBudget, at).run();
  }
}

export async function moduleState(env, id) {
  await ensureAiTables(env);
  const row = await env.DB.prepare('SELECT enabled, daily_budget FROM ai_modules WHERE id = ?').bind(id).first();
  if (!row) {
    const mod = getModule(id);
    return { enabled: true, dailyBudget: mod ? mod.dailyBudget : 1000 };
  }
  return { enabled: Number(row.enabled) === 1, dailyBudget: Number(row.daily_budget) || 0 };
}

export async function setModuleState(env, id, { enabled, dailyBudget } = {}) {
  await ensureAiTables(env);
  if (!getModule(id)) return { ok: false, reason: 'UNKNOWN_MODULE' };
  const cur = await moduleState(env, id);
  const nextEnabled = enabled === undefined ? cur.enabled : !!enabled;
  const nextBudget = dailyBudget === undefined ? cur.dailyBudget
    : (Number.isInteger(dailyBudget) && dailyBudget > 0 ? dailyBudget : null);
  if (nextBudget === null) return { ok: false, reason: 'BAD_BUDGET' };
  await env.DB.prepare(
    'INSERT INTO ai_modules (id, enabled, daily_budget, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, daily_budget = excluded.daily_budget, updated_at = excluded.updated_at'
  ).bind(id, nextEnabled ? 1 : 0, nextBudget, new Date().toISOString()).run();
  return { ok: true, id, enabled: nextEnabled, dailyBudget: nextBudget };
}

/** Attempts (ok or not) since UTC midnight — both consume budget. */
export async function todayUsage(env, id) {
  await ensureAiTables(env);
  const day = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM ai_runs WHERE module_id = ? AND substr(created_at, 1, 10) >= ?'
  ).bind(id, day).first();
  return Number((row && row.n) || 0);
}

/* ── Validators ──────────────────────────────────────────────────────────── */

function jsType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'int';
  return typeof v; // string|number|boolean|object|undefined
}

/**
 * Logical-consistency gate: required keys present, value types within the
 * allowed set (with 'int' distinguished from float), enum membership.
 * Shape only — domain rules stay with the module's own validator.
 */
export function validateSchema(payload, schema) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, reason: 'NOT_AN_OBJECT' };
  }
  const missing = [];
  const mistyped = [];
  for (const key of schema.required || []) {
    if (payload[key] === undefined) {
      missing.push(key);
      continue;
    }
    const allowed = (schema.types && schema.types[key]) || null;
    if (allowed && !allowed.includes(jsType(payload[key]))) {
      mistyped.push(`${key}:got-${jsType(payload[key])}`);
    }
  }
  if (missing.length > 0) return { ok: false, reason: 'SCHEMA_MISSING', detail: missing };
  if (mistyped.length > 0) return { ok: false, reason: 'SCHEMA_MISTYPED', detail: mistyped };
  const enums = schema.enums || {};
  for (const key of Object.keys(enums)) {
    if (payload[key] === undefined || payload[key] === null) continue;
    if (!enums[key].includes(payload[key])) {
      return { ok: false, reason: 'SCHEMA_ENUM', detail: [`${key}:${JSON.stringify(payload[key])}`] };
    }
  }
  const items = schema.items || {};
  for (const key of Object.keys(items)) {
    const arr = payload[key];
    if (!Array.isArray(arr)) continue;
    const spec = items[key];
    for (let i = 0; i < arr.length; i++) {
      const el = arr[i];
      if (spec.types && spec.types.__self__) {
        if (!spec.types.__self__.includes(jsType(el))) {
          return { ok: false, reason: 'SCHEMA_ITEM', detail: [`${key}[${i}]:got-${jsType(el)}`] };
        }
        continue;
      }
      if (!el || typeof el !== 'object') {
        return { ok: false, reason: 'SCHEMA_ITEM', detail: [`${key}[${i}]:not-object`] };
      }
      const sub = validateSchema(el, spec);
      if (!sub.ok) return { ok: false, reason: sub.reason, detail: [`${key}[${i}].${(sub.detail || []).join(',')}`] };
    }
  }
  return { ok: true };
}

/**
 * Grounding gate: every extractive claim must resolve to caller-supplied
 * evidence. ids ⊆ allowed list; indices < pool size (and within cap);
 * quotes verbatim in the source text (folded compare, minimum length so a
 * two-word overlap can never count as evidence).
 */
export function checkGrounding(payload, rule, context) {
  if (!rule) return { ok: true, skipped: true };
  const ctx = context || {};
  if (rule.kind === 'ids') {
    const allowed = new Set(Array.isArray(ctx[rule.listKey]) ? ctx[rule.listKey].map(String) : []);
    const ids = Array.isArray(payload.candidates) ? payload.candidates.map(String) : [];
    const outside = ids.filter((id) => !allowed.has(id));
    if (outside.length > 0) return { ok: false, reason: 'ID_NOT_IN_SHORTLIST', detail: outside.slice(0, 8) };
    if (rule.max && ids.length > rule.max) return { ok: false, reason: 'OVER_CAP', detail: [`${ids.length}>${rule.max}`] };
    return { ok: true };
  }
  if (rule.kind === 'indices') {
    const size = Number(ctx[rule.sizeKey]);
    if (!Number.isInteger(size) || size < 0) return { ok: false, reason: 'NO_POOL_CONTEXT' };
    const pick = (obj) => {
      if (Array.isArray(obj)) return obj;
      if (obj && Array.isArray(obj.indices)) return obj.indices;
      if (obj && Array.isArray(obj.rankings)) return obj.rankings.map((r) => r && r.index);
      return null;
    };
    const idxs = pick(payload);
    if (!Array.isArray(idxs)) return { ok: false, reason: 'NO_INDICES' };
    const bad = idxs.filter((i) => !Number.isInteger(i) || i < 0 || i >= size);
    if (bad.length > 0) return { ok: false, reason: 'INDEX_OUT_OF_POOL', detail: bad.slice(0, 8).map(String) };
    if (rule.max && idxs.length > rule.max) return { ok: false, reason: 'OVER_CAP', detail: [`${idxs.length}>${rule.max}`] };
    const seen = new Set();
    for (const i of idxs) {
      if (seen.has(i)) return { ok: false, reason: 'DUPLICATE_INDEX', detail: [String(i)] };
      seen.add(i);
    }
    return { ok: true };
  }
  if (rule.kind === 'quotes') {
    const text = String(ctx[rule.textKey] || '');
    if (!text) return { ok: false, reason: 'NO_SOURCE_CONTEXT' };
    const fold = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const page = fold(text);
    const min = rule.minLen || 8;
    const events = Array.isArray(payload.events) ? payload.events : [];
    for (const ev of events) {
      const q = typeof ev.quote === 'string' ? ev.quote.trim() : '';
      if (q.length < min || !page.includes(fold(q))) {
        return { ok: false, reason: 'QUOTE_NOT_GROUNDED', detail: [q.slice(0, 80)] };
      }
    }
    return { ok: true };
  }
  return { ok: false, reason: 'UNKNOWN_GROUNDING_RULE' };
}

function numAt(obj, path) {
  const parts = String(path).split('.');
  let v = obj;
  for (const p of parts) {
    if (v === null || v === undefined || typeof v !== 'object') return null;
    v = v[p];
  }
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Mathematical-correctness gate. Rules are structural (never parsed
 * expressions — no injection surface):
 *   { field: 'totalPaise', equals: { op: 'mul', args: ['qty', 'unitPaise'] }, tolerance: 0 }
 * Supported ops: add, sub, mul, div, eq (literal/first-arg equality).
 * Recomputes from the payload's own fields and rejects mismatches with both
 * numbers in the response, so the failure is debuggable, not oracular.
 */
export function verifyMath(payload, rules) {
  if (!rules || rules.length === 0) return { ok: true, skipped: true };
  const EPS_DEFAULT = 1e-9;
  for (const rule of rules) {
    const got = numAt(payload, rule.field);
    if (got === null) return { ok: false, reason: 'MATH_FIELD_MISSING', detail: [String(rule.field)] };
    const ex = rule.equals;
    if (!ex || typeof ex.op !== 'string') return { ok: false, reason: 'MATH_BAD_RULE' };
    const vals = (ex.args || []).map((a) => (typeof a === 'number' ? a : numAt(payload, a)));
    if (vals.some((v) => v === null)) {
      return { ok: false, reason: 'MATH_ARG_MISSING', detail: [String(rule.field)] };
    }
    let expected = null;
    if (ex.op === 'add') expected = vals.reduce((a, b) => a + b, 0);
    else if (ex.op === 'mul') expected = vals.reduce((a, b) => a * b, 1);
    else if (ex.op === 'sub' && vals.length >= 2) expected = vals[0] - vals.slice(1).reduce((a, b) => a + b, 0);
    else if (ex.op === 'div' && vals.length === 2) expected = vals[1] === 0 ? null : vals[0] / vals[1];
    else if (ex.op === 'eq' && vals.length >= 1) expected = vals[0];
    else return { ok: false, reason: 'MATH_BAD_OP', detail: [String(ex.op)] };
    if (expected === null || !Number.isFinite(expected)) {
      return { ok: false, reason: 'MATH_UNCOMPUTABLE', detail: [String(rule.field)] };
    }
    const tol = Number.isFinite(rule.tolerance) && rule.tolerance >= 0 ? rule.tolerance : EPS_DEFAULT;
    if (Math.abs(got - expected) > tol) {
      return { ok: false, reason: 'MATH_MISMATCH', detail: [`${rule.field}:got-${got}:expected-${expected}`] };
    }
  }
  return { ok: true };
}

/* ── Suggestions inbox ───────────────────────────────────────────────────── */

const SUGGESTION_KINDS = new Set(['review', 'roadmap', 'issue']);
const SUGGESTION_OPEN = 'open';
const SUGGESTION_DECIDED = new Set(['accepted', 'rejected', 'shipped']);

export async function submitSuggestion(env, { kind, title, detail = null, moduleId = null, actor } = {}) {
  await ensureAiTables(env);
  if (!SUGGESTION_KINDS.has(String(kind || ''))) return { ok: false, reason: 'BAD_KIND' };
  if (!String(title || '').trim()) return { ok: false, reason: 'TITLE_REQUIRED' };
  if (moduleId !== null && moduleId !== undefined && !getModule(moduleId)) {
    return { ok: false, reason: 'UNKNOWN_MODULE' };
  }
  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO ai_suggestions (id, kind, title, detail, module_id, status, actor, reviewer, decided_at, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,NULL,NULL,?8)'
  ).bind(
    id, String(kind), String(title).slice(0, 200),
    detail === null || detail === undefined ? null : String(detail).slice(0, 4000),
    moduleId, SUGGESTION_OPEN, String(actor || 'unknown').slice(0, 254), new Date().toISOString()
  ).run();
  return { ok: true, id };
}

export async function listSuggestions(env, { status = null, kind = null, limit = 100 } = {}) {
  await ensureAiTables(env);
  const cap = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 100;
  let sql = 'SELECT * FROM ai_suggestions';
  const conds = [];
  const binds = [];
  if (status) {
    conds.push('status = ?');
    binds.push(String(status));
  }
  if (kind) {
    conds.push('kind = ?');
    binds.push(String(kind));
  }
  if (conds.length > 0) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY created_at DESC LIMIT ?';
  binds.push(cap);
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return results || [];
}

export async function reviewSuggestion(env, { id, decision, reviewer } = {}) {
  await ensureAiTables(env);
  if (!id || !SUGGESTION_DECIDED.has(String(decision || ''))) {
    return { ok: false, reason: 'BAD_INPUT' };
  }
  const row = await env.DB.prepare('SELECT status FROM ai_suggestions WHERE id = ?').bind(String(id)).first();
  if (!row) return { ok: false, reason: 'NOT_FOUND' };
  if (row.status !== SUGGESTION_OPEN) return { ok: false, reason: 'ALREADY_DECIDED' };
  await env.DB.prepare(
    'UPDATE ai_suggestions SET status = ?, reviewer = ?, decided_at = ? WHERE id = ?'
  ).bind(String(decision), String(reviewer || 'unknown').slice(0, 254), new Date().toISOString(), String(id)).run();
  return { ok: true, id, decision: String(decision) };
}
