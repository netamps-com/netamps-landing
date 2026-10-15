/**
 * Shared catalog core — deterministic Tier-1 matching.
 *
 * ONE definition, no drift: the typeahead endpoint (`products/suggest.js`) and
 * the Tier-2 normalizer (`normalize/line.js`) both resolve catalog rows through
 * `searchCatalog`, so "what the catalog thinks" is identical in both paths.
 *
 * Zero LLM. Prefix on model/category, then alias-prefix, then fuzzy
 * (Jaro-Winkler ≥ 0.85) over canonical model + aliases.
 */

// `etl.js` is a dependency-free leaf module (no imports of its own), so this is
// a static edge with no cycle. It used to be a lazy `await import()` inside
// searchFtsTier; the snapshot below needs the tokenizer synchronously.
import { tokenize } from './etl.js';

export const CATALOG_MAX_RESULTS = 20;
export const CATALOG_MIN_QUERY = 2;
export const CATALOG_MAX_QUERY = 64;

// How long a cached catalog stays valid inside a warm isolate. The catalog only
// changes on an ETL run / admin edit, both of which are rare and explicitly
// bump this, so 60s costs nothing in correctness and removes ~1.3s per keystroke.
export const CATALOG_SNAPSHOT_TTL_MS = 60_000;

// Minimum similarity for a whole-string fuzzy hit. Raised from 0.85 after
// shadow comparison found 0.85 admitted wrong products on short aliases
// (e.g. "firewall" -> "Seagate FireCuda"). See searchCatalog.
export const CATALOG_FUZZY_MIN = 0.92;

export function normalizeFold(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// ── Phase B: category discipline + confidence floor ─────────────────────────
//
// Live probe (2026-10-15) showed two defects in the BUY typeahead:
//   1. A networking query ("cisco catalyst 9300") returned UCS *servers* and
//      QSFP *transceivers* — cross-category noise a buyer reads as "search is
//      broken".
//   2. Every fuzzy hit came back with an identical `score: 75`, so ordering
//      carried no information and the Tier-2 LLM fallback was unreachable
//      (it only fired when Tier 1 returned ZERO rows, which fuzzy almost never
//      does once a single token matches).
//
// Both fixes live here so the typeahead endpoint and the normalizer share one
// definition — same rule as the rest of this module.

/**
 * Canonical category slug. Both the catalog's `category` column and the UI's
 * `<select>` values route through here, so "networking", "Networking",
 * "networking_gear" and "network" are ONE category at comparison time.
 */
export function normalizeCategory(s) {
  const v = normalizeFold(s).replace(/[\s_]+/g, ' ');
  if (!v) return '';
  if (/^(network|networking|networking gear|network gear|switch|switches|router|routers|firewall)/.test(v)) return 'networking';
  if (/^(server|servers|compute|storage|datacenter|data center)/.test(v)) return 'servers';
  if (/^(workstation|workstations|laptop|laptops|desktop|desktops|pc|pcs|client)/.test(v)) return 'workstations';
  if (/^(telecom|telecom equipment|telco)/.test(v)) return 'telecom';
  if (/^(peripheral|peripherals|component|components)/.test(v)) return 'peripherals';
  if (/^(mixed|mixed pallet|varied|multi)/.test(v)) return 'mixed';
  return v;
}

/**
 * Confidence in a Tier-1 row, 0..1.
 *
 * - `prefix` hits are strong evidence (buyer typed a real model prefix).
 * - `fuzzy` hits are weak: whole-string similarity says the *strings* are close,
 *   not that the buyer meant this product. JW 0.92 on "r750" vs "r740" is a
 *   near-collision, not a match.
 * - Category agreement is a strong multiplier; disagreement is a strong penalty.
 *
 * Deliberately conservative: a LOW score is what unlocks the LLM, so over-
 * scoring would re-hide the very failure mode this fixes.
 */
export function rowConfidence(row, selectedCategory) {
  if (!row) return 0;
  let base;
  if (row.matchType === 'prefix') {
    // Longer typed prefixes are stronger evidence than 2-char ones.
    base = 0.80 + Math.min(0.15, (normalizeFold(row.model || '').length ? 0.05 : 0));
  } else {
    const jw = Number.isFinite(row.score) ? row.score : 0.92;
    base = 0.45 + Math.max(0, Math.min(1, (jw - CATALOG_FUZZY_MIN) / (1 - CATALOG_FUZZY_MIN))) * 0.25;
  }
  if (selectedCategory) {
    const same = normalizeCategory(row.category) === selectedCategory;
    base = same ? Math.min(1, base + 0.15) : base * 0.35;
  }
  return Math.max(0, Math.min(1, base));
}

/**
 * Should the LLM be consulted for this Tier-1 result set?
 *
 * True when: nothing was found, OR the best hit is below the confidence floor,
 * OR the buyer picked a category and the top hit disagrees with it. Any one of
 * those means Tier 1 alone would show the buyer something misleading.
 */
export function shouldEscalateToLlm(rows, selectedCategory, floor) {
  const threshold = Number.isFinite(floor) ? floor : 0.75;
  if (!rows || rows.length === 0) return true;
  if (selectedCategory) {
    const topCat = normalizeCategory(rows[0]?.category);
    if (topCat && topCat !== selectedCategory) return true;
  }
  return rowConfidence(rows[0], selectedCategory) < threshold;
}

/**
 * Drop rows that contradict a buyer-chosen category.
 *
 * STRICT, deliberately. The earlier version fell back to the unfiltered list
 * when scoping emptied it ("better a noisy list than an empty one"), and that
 * fallback defeated the gate completely: a poisoned-but-real id from another
 * category, or a weak cross-category fuzzy hit, sailed straight through to a
 * buyer who had explicitly chosen a different category.
 *
 * An empty result is a VALID, HONEST outcome. The typeahead renders it as
 * "No catalog match" and the visitor's typed text is kept verbatim and submits
 * as Custom (unverified) — which is exactly the behaviour we want when the
 * catalog genuinely does not have the thing. Showing a switch to someone who
 * asked for servers is a worse failure than showing nothing.
 *
 * With no category selected there is no gate at all — nothing was asked for.
 *
 * @returns {Array} rows, possibly empty.
 */
export function filterByCategory(rows, selectedCategory) {
  if (!selectedCategory || !rows || rows.length === 0) return rows || [];
  return rows.filter((r) => normalizeCategory(r.category) === selectedCategory);
}

export function jaroWinkler(a, b) {
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (m === 0 || n === 0) return 0;
  const matchDist = Math.floor(Math.max(m, n) / 2) - 1;
  const aMatches = new Array(m).fill(false);
  const bMatches = new Array(n).fill(false);
  let matches = 0;
  for (let i = 0; i < m; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, n);
    for (let j = start; j < end; j++) {
      if (!bMatches[j] && a[i] === b[j]) {
        aMatches[i] = bMatches[j] = true;
        matches++;
        break;
      }
    }
  }
  if (matches === 0) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < m; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const j = (matches / m + matches / n + (matches - transpositions / 2) / matches) / 3;
  const prefix = a.slice(0, 4).split('').reduce((acc, ch, i) => acc + (ch === b[i] ? 1 : 0), 0);
  return j + 0.1 * prefix * (1 - j);
}

export function parseAliases(r) {
  try {
    const a = JSON.parse(r?.aliases || '[]');
    if (!Array.isArray(a)) return [];
    return a.map((x) => normalizeFold(x)).filter(Boolean);
  } catch {
    return [];
  }
}

// ── Per-isolate memoisation ──────────────────────────────────────────────────
//
// MEASURED 2026-10-15 against production, 16 warm requests each:
//   GET /api/health/live        (no D1, no AI)      p50 =  283ms
//   GET /api/products/suggest   (Tier 1, NO LLM)    p50 = 1568ms
//   GET /api/products/suggest   (Tier 2, cold)      p50 = 10492ms
//
// The Worker costs ~230-280ms end to end, so a query that never touches the
// model was burning ~1.3s inside D1. Not D1 slowness — the request SHAPE: the
// hot path awaited `ensureCatalog` (3 DDL statements) at least twice and then
// 3-4 more reads, all SEQUENTIALLY, once per keystroke. `CREATE TABLE IF NOT
// EXISTS` is still a WRITE against the D1 primary, and D1 writes cost an order
// of magnitude more than reads.
//
// The catalog is small and changes only via ETL, so the fix is to read it once
// per isolate and match in memory. Same functions, same thresholds, same
// ordering — only the storage layer changes.

let catalogEnsured = false;
let snapshot = null;        // { at, rows }
let snapshotPending = null; // in-flight load, so concurrent requests share one query

/** Force the next read to hit D1. Call after an ETL run or admin catalog edit. */
export function invalidateCatalogSnapshot() {
  snapshot = null;
  snapshotPending = null;
}

export async function ensureCatalog(env) {
  if (!env.DB || typeof env.DB.prepare !== 'function') return;
  // DDL is idempotent, so running it once per isolate is equivalent to running
  // it per request — it only has to happen once per isolate lifetime. A thrown
  // DDL leaves the flag false and is retried on the next request.
  if (catalogEnsured) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      model TEXT NOT NULL,
      spec_template TEXT,
      aliases TEXT,         -- JSON array of aliases
      verification_status TEXT DEFAULT 'unverified',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();
  // Pre-existing rows predate the column. Deliberately NO heuristic here (an
  // earlier `id GLOB '*-00[0-9]'` idea was wrong: it also matched generated
  // ids like 'r750-001' and would have marked unverified SKUs as verified,
  // lifting their confidence cap). Verification is set explicitly by the seed
  // / admin path only, so trust can never be inferred from an id shape.
  // Anything left NULL is treated as unverified by the normalizer.
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)'
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_products_model ON products(model)'
  ).run();
  catalogEnsured = true;
}

/**
 * Read `products` ONCE, with every derived field the matcher needs already
 * folded. Folding per keystroke was pure waste — the strings never change.
 *
 * `category` is kept RAW on purpose: it is echoed back to the client, which
 * maps it through its own slug→label table. The normalised slug lives on
 * `_foldCat` and is used only for comparison.
 *
 * `verification_status` is DELIBERATELY NOT SELECTED. It is the trust signal
 * that decides whether a catalog row may anchor a line above the promotion
 * confidence cap (normalize/line.js). A value served from a 60s cache would
 * mean an unverified SKU could be trusted as verified for a minute after staff
 * downgraded it — so it is re-read from D1 at the point of decision via
 * readVerificationStatus(), and is never cached here. Search data is safe to
 * cache; authorisation input is not.
 *
 * @returns {Promise<Array|null>} null when D1 is absent/errors/empty.
 */
async function loadCatalogRows(env) {
  if (!env.DB || typeof env.DB.prepare !== 'function') return null;
  try {
    const res = await env.DB.prepare(
      'SELECT id, category, model, spec_template, aliases FROM products'
    ).all();
    const rows = (res?.results || [])
      .filter((r) => r && r.id && r.model)
      .map((r) => ({
        id: String(r.id),
        category: r.category || 'mixed',
        brand: '',
        model: String(r.model),
        specTemplate: typeof r.spec_template === 'string' ? r.spec_template : '',
        aliases: parseAliases(r),
        _foldModel: normalizeFold(r.model),
        _foldSpec: normalizeFold(r.spec_template),
        _foldCat: normalizeCategory(r.category)
      }));
    return rows.length > 0 ? rows : null;
  } catch {
    return null;
  }
}

/**
 * Authoritative, uncached trust lookup for ONE catalog id.
 *
 * Fail-closed: anything other than a literal 'verified' — including a D1 error
 * or a missing row — returns 'unverified', which is the value that keeps the
 * confidence cap in place. Callers use this for the trust decision; the
 * cached snapshot is for search.
 *
 * @returns {Promise<'verified'|'unverified'>}
 */
export async function readVerificationStatus(env, id) {
  if (!env?.DB || typeof env.DB.prepare !== 'function' || !id) return 'unverified';
  try {
    const row = await env.DB
      .prepare('SELECT verification_status FROM products WHERE id = ?')
      .bind(String(id))
      .first();
    return row && row.verification_status === 'verified' ? 'verified' : 'unverified';
  } catch {
    return 'unverified';
  }
}

/**
 * The catalog as this isolate currently believes it to be.
 *
 * Concurrent callers share a single in-flight query rather than each issuing
 * their own (the typeahead debounce can overlap two requests).
 *
 * @returns {Promise<Array|null>} null when D1 cannot serve a catalog.
 */
export async function getCatalogSnapshot(env) {
  if (!env.DB || typeof env.DB.prepare !== 'function') return null;
  const now = Date.now();
  if (snapshot && now - snapshot.at < CATALOG_SNAPSHOT_TTL_MS) return snapshot.rows;
  if (snapshotPending) return snapshotPending;
  snapshotPending = (async () => {
    try {
      const rows = await loadCatalogRows(env);
      if (rows) snapshot = { at: Date.now(), rows };
      return rows;
    } catch {
      return null;
    } finally {
      snapshotPending = null;
    }
  })();
  return snapshotPending;
}

// SQLite rejects LIKE patterns beyond a complexity budget with
// "LIKE or GLOB pattern too complex". A visitor pasting a whole sentence
// (the Tier-2 normalizer feeds raw `details` prose in) blew that budget and
// threw, which silently downgraded every such line off the catalog path.
// Cap the folded query to a safe prefix length.
const MAX_FOLD_QUERY = 64;

/** Escape LIKE metacharacters so a visitor's `%` / `_` stays literal.
 *  Without this, "PowerVault_ME484" would match any single char, and a bare
 *  "%" would return the entire catalog. Paired with ESCAPE '\' in the SQL. */
function escapeLike(s) {
  return String(s ?? '').replace(/[\\%_]/g, (c) => '\\' + c);
}

// ── FTS5 tier ────────────────────────────────────────────────────────────────
// Catalog index mode is ON by default: it is the only path that can reach
// mid-string terms in spec_template. Kept behind a constant (not an env flag)
// so the fallback is exercised by tests rather than by production surprise.

export const CATALOG_INDEX_MODE = true;

/**
 * FTS5 tier. Returns null when the index is unavailable or empty, which tells
 * the caller to fall through to legacy — never an empty-array "no results".
 *
 * Exported for the rank-fusion shadow (fusion.js), which needs this tier as an
 * INDEPENDENT list rather than only as the head of the cascade. Behaviour here
 * is unchanged — searchCatalog still calls it exactly as before.
 */
export async function searchFtsTier(env, qcmp, limit) {
  if (!CATALOG_INDEX_MODE) return null;
  if (!(await ensureFtsIndex(env))) return null;
  let tokens;
  try {
    const { tokenize } = await import('./etl.js');
    tokens = tokenize(qcmp);
  } catch {
    return null;
  }
  if (!tokens.length) return null;

  try {
    const match = tokens.map((t) => `"${String(t).replace(/"/g, '')}"*`).join(' OR ');
    const { results } = await env.DB.prepare(
      'SELECT p.id, p.category, p.model, p.spec_template, p.verification_status, bm25(products_fts) AS rank ' +
      'FROM products_fts JOIN products p ON p.id = products_fts.id ' +
      'WHERE products_fts MATCH ? ORDER BY rank LIMIT ?'
    ).bind(match, limit).all();

    if (!results || !results.length) return null;

    // Exact model prefix outranks BM25 (a visitor typing "r750" wants the
    // R750 first, not whatever bm25 scores highest). Stable partition.
    const q = qcmp;
    const exact = [];
    const rest = [];
    for (const r of results) {
      const item = {
        id: r.id,
        category: r.category,
        model: r.model,
        specTemplate: r.spec_template || '',
        verificationStatus: r.verification_status || 'unverified',
        matchType: normalizeFold(r.model).startsWith(q) ? 'prefix' : 'fuzzy'
      };
      (item.matchType === 'prefix' ? exact : rest).push(item);
    }
    return [...exact, ...rest].slice(0, limit);
  } catch {
    // Missing table, bad MATCH syntax, or an unbuilt index: fall through.
    return null;
  }
}

/**
 * Ensure the FTS index exists and reflects `products`.
 *
 * Self-healing on first call so the index cannot be "forgotten": if the table
 * is missing we build it. We deliberately do NOT rebuild on every request —
 * a rebuild scans every row and would turn typeahead into a full-table write.
 * Staleness after a catalog edit is handled by rebuildIndex() at the edit site.
 *
 * @returns {Promise<boolean>} true if an index is available for querying.
 */
export async function ensureFtsIndex(env) {
  if (!env.DB || typeof env.DB.prepare !== 'function') return false;
  try {
    const probe = await env.DB.prepare('SELECT COUNT(*) AS n FROM products_fts').bind().first();
    if ((probe?.n ?? 0) > 0) return true;
  } catch {
    // Table absent — build it.
  }
  try {
    const { rebuildIndex } = await import('./etl.js');
    const report = await rebuildIndex(env);
    console.log('[catalog] fts index built', JSON.stringify(report));
    return report.indexed > 0;
  } catch (err) {
    console.error('[catalog] fts index build failed', err?.message);
    return false;
  }
}

/**
 * In-memory equivalent of the D1 cascade below.
 *
 * Deliberately a PORT, not a redesign: it walks the same three tiers in the
 * same order, with the same CATALOG_FUZZY_MIN threshold and the same
 * prefix-before-fuzzy stable partition, so a result set from either path is
 * comparable and no caller can tell which one served it. The only difference is
 * that tier 1 reads a pre-folded array instead of an index, and tier 1 uses
 * substring token matching (a superset of FTS5's prefix match) instead of
 * bm25() ordering.
 *
 * @param {Array} rows from getCatalogSnapshot()
 * @returns {Promise<Array>} rows shaped like searchCatalog's return value.
 */
function searchSnapshot(rows, q, limit) {
  const qcmp = normalizeFold(q).slice(0, MAX_FOLD_QUERY);
  if (!rows || rows.length === 0) return [];
  if (!qcmp || qcmp.length < CATALOG_MIN_QUERY) return [];

  // `verificationStatus` is intentionally absent — see loadCatalogRows. Trust
  // is read separately, uncached, via readVerificationStatus().
  const toRow = (r, matchType) => ({
    id: r.id,
    category: r.category,
    model: r.model,
    specTemplate: r.specTemplate,
    matchType
  });

  // ── Tier A — token recall (the FTS5 equivalent) ────────────────────────────
  // Mid-string reach ('ssd', 'nvme', '2u', 'proliant') that a whole-string
  // similarity metric structurally cannot provide.
  let tokens = [];
  try {
    tokens = tokenize(qcmp);
  } catch {
    tokens = qcmp.split(' ').filter(Boolean);
  }
  if (tokens.length > 0) {
    const hits = [];
    for (const r of rows) {
      let matched = 0;
      for (const t of tokens) {
        if (r._foldModel.includes(t)) { matched += 2; continue; }
        if (r._foldSpec.includes(t)) { matched += 1; continue; }
        if (r.aliases.some((a) => a.includes(t))) matched += 1;
      }
      if (matched > 0) hits.push({ r, matched });
    }
    if (hits.length > 0) {
      // Deterministic and meaningful ordering: more tokens matched wins, then
      // the shorter model (a tighter name match), then id for stability.
      hits.sort((a, b) =>
        (b.matched - a.matched)
        || (a.r.model.length - b.r.model.length)
        || String(a.r.id).localeCompare(String(b.r.id)));
      // Exact model prefix still outranks everything (same rule as the D1 tier).
      const exact = hits.filter((h) => h.r._foldModel.startsWith(qcmp));
      const rest = hits.filter((h) => !h.r._foldModel.startsWith(qcmp));
      return [...exact, ...rest].slice(0, limit).map((h) => toRow(h.r, h.r._foldModel.startsWith(qcmp) ? 'prefix' : 'fuzzy'));
    }
  }

  // ── Tier B — exact prefix on model or category (the LIKE fast path) ───────
  const results = [];
  for (const r of rows) {
    if (r._foldModel.startsWith(qcmp) || r._foldCat.startsWith(qcmp)) results.push(toRow(r, 'prefix'));
  }
  if (results.length >= limit) return results.slice(0, limit);

  // ── Tier C — alias-prefix, then Jaro-Winkler fuzzy over the remainder ──────
  const taken = new Set(results.map((r) => r.id));
  const extras = [];
  for (const r of rows) {
    if (taken.has(r.id)) continue;
    const base = {
      id: r.id,
      category: r.category,
      model: r.model,
      specTemplate: r.specTemplate
    };
    if (r.aliases.some((a) => a.startsWith(qcmp))) {
      extras.push({ ...base, matchType: 'prefix', score: 1 });
      continue;
    }
    let best = jaroWinkler(qcmp, r._foldModel);
    for (const a of r.aliases) best = Math.max(best, jaroWinkler(qcmp, a));
    if (best >= CATALOG_FUZZY_MIN) extras.push({ ...base, matchType: 'fuzzy', score: best });
  }
  extras.sort((a, b) => (b.score - a.score) || (a.model < b.model ? -1 : 1));

  return [...results, ...extras.slice(0, limit - results.length)]
    .map(({ score, ...s }) => s);
}

/**
 * Best-effort semantic shortlist for the Tier-2 model.
 *
 * This is the "retrieve, then rerank" split. The old prompt inlined up to 600
 * catalog rows on every keystroke, which is where the 10.5s came from — input
 * tokens dominate latency far more than output does. Retrieval is cheap and
 * already implemented; making the MODEL rerank a 25-row shortlist keeps the
 * semantic capability and removes ~95% of the prompt.
 *
 * Scoring is deliberately lexical-plus-fuzzy (no model), because it has to run
 * in well under a millisecond to be worth doing at all. It is allowed to be
 * imprecise: the model re-ranks, and every id it returns is still re-validated
 * against the full universe by validateLLMResponse.
 *
 * @returns {Array} up to `limit` catalog rows, best first.
 */
export function shortlistCandidates(rows, q, limit = 25) {
  if (!rows || rows.length === 0) return [];
  const qcmp = normalizeFold(q).slice(0, MAX_FOLD_QUERY);
  if (!qcmp) return [];
  let tokens = [];
  try {
    tokens = tokenize(qcmp).filter((t) => t.length >= 2);
  } catch {
    tokens = qcmp.split(' ').filter(Boolean);
  }

  const scored = [];
  for (const r of rows) {
    // `evidence` and `score` are kept separate on purpose. Jaro-Winkler is a
    // whole-string similarity metric: on a query with no lexical overlap it
    // still returns a small non-zero value for every row, which would drag
    // unrelated products into the prompt. So JW may only RE-RANK a row that
    // already has real containment evidence — it can never create it.
    let evidence = 0;
    if (r._foldModel.startsWith(qcmp)) evidence += 12;
    else if (r._foldModel.includes(qcmp)) evidence += 8;
    if (r._foldCat.includes(qcmp)) evidence += 4;
    for (const t of tokens) {
      if (r._foldModel.includes(t)) evidence += 3;
      else if (r._foldSpec.includes(t)) evidence += 2;
      else if (r.aliases.some((a) => a.includes(t))) evidence += 2;
    }
    if (evidence === 0) continue;
    const s = evidence + jaroWinkler(qcmp, r._foldModel) * 2;
    scored.push({ r, s });
  }
  scored.sort((a, b) => (b.s - a.s) || (a.r.model.length - b.r.model.length) || String(a.r.id).localeCompare(String(b.r.id)));
  return scored.slice(0, limit).map((x) => x.r);
}

/**
 * @returns {Promise<Array<{id,category,model,specTemplate,matchType}>>}
 */
export async function searchCatalog(env, q, limit) {
  if (!env.DB || typeof env.DB.prepare !== 'function') return [];
  const folded = normalizeFold(q);
  if (!folded || folded.length < CATALOG_MIN_QUERY) return [];

  // Fast path: the isolate already holds the catalog. This is what turns a
  // ~1.3s keystroke into a sub-millisecond one. Anything the snapshot cannot
  // serve falls through to the D1 cascade unchanged.
  const snap = await getCatalogSnapshot(env);
  if (snap) return searchSnapshot(snap, q, limit);
  // Two views of the same query: `qcmp` for in-JS string similarity (no SQL
  // metacharacters), `qsql` escaped for the LIKE bind parameter.
  const qcmp = folded.slice(0, MAX_FOLD_QUERY);
  const qsql = escapeLike(qcmp);

  // ── FTS5 PRIMARY (catalog index mode) ──
  // Recovers substring/token recall the legacy path structurally cannot reach:
  // spec_template was never searched and Jaro-Winkler is a whole-string metric,
  // so 'ssd', 'nvme', '2u', 'proliant' returned 0 despite 22/19/31/14 real
  // matches. Gated on the index existing, so a missing/failed index degrades
  // to legacy rather than to zero results.
  const fts = await searchFtsTier(env, qcmp, limit);
  if (fts && fts.length) return fts.map((r) => ({ ...r, source: 'fts' }));

  // Exact prefix matches (legacy fast path).
  // The `%` rides inside the BOUND PARAMETER, never after the ESCAPE clause:
  // `LIKE ? ESCAPE '\' || '%'` folds the escape char and '%' into a 2-char
  // escape expression and SQLite throws "ESCAPE expression must be a single
  // character", turning every catalog lookup into a 500.
  const rows = await env.DB.prepare(
    `SELECT id, category, model, spec_template, verification_status
     FROM products
     WHERE lower(model) LIKE ? ESCAPE '\\'
        OR lower(category) LIKE ? ESCAPE '\\'
     LIMIT ?`
  ).bind(`${qsql}%`, `${qsql}%`, limit * 2).all();

  const results = (rows?.results || []).map((r) => ({
    id: r.id,
    category: r.category,
    model: r.model,
    specTemplate: r.spec_template || '',
    verificationStatus: r.verification_status || 'unverified',
    matchType: 'prefix'
  }));

  if (results.length >= limit) return results.slice(0, limit);

  // Alias-prefix + fuzzy fallback over a capped scan (aliases live in a
  // JSON column, so token matching happens in JS over ≤200 rows).
  const prefixIds = [...new Set(results.map((r) => r.id))];
  const remaining = prefixIds.length > 0
    ? await env.DB.prepare(
      `SELECT id, category, model, spec_template, aliases, verification_status
       FROM products
       WHERE id NOT IN (${prefixIds.map(() => '?').join(',')})
       LIMIT 200`
    ).bind(...prefixIds).all()
    : await env.DB.prepare(
      `SELECT id, category, model, spec_template, aliases, verification_status
       FROM products
       LIMIT 200`
    ).all();

  const extras = [];
  for (const r of (remaining?.results || [])) {
    const aliases = parseAliases(r);
    const base = {
      id: r.id,
      category: r.category,
      model: r.model,
      specTemplate: r.spec_template || '',
      verificationStatus: r.verification_status || 'unverified'
    };
    // Alias-prefix ranks as an exact-tier hit (buyer typed "r740", not the full model).
    if (aliases.some((a) => a.startsWith(qcmp))) {
      extras.push({ ...base, matchType: 'prefix', score: 1 });
      continue;
    }
    // Fuzzy: best Jaro-Winkler over canonical model + aliases.
    //
    // Threshold raised 0.85 -> 0.92 after shadow comparison (step 3) against
    // real queries showed the old value produced FALSE POSITIVES, not extra
    // recall:
    //   "r750"   -> R650/R700/R720/R730/R740/R760 via alias JW 0.883
    //   "firewall" -> "Seagate FireCuda" (an HDD) via JW 0.850
    // Short aliases are near-collisions ("r750"/"r740", "fire"/"firewall"),
    // so 0.85 admitted products that are NOT the thing searched for.
    const modelFold = normalizeFold(r.model);
    let best = jaroWinkler(qcmp, modelFold);
    for (const a of aliases) best = Math.max(best, jaroWinkler(qcmp, a));
    if (best >= CATALOG_FUZZY_MIN) extras.push({ ...base, matchType: 'fuzzy', score: best });
  }
  extras.sort((a, b) => (b.score - a.score) || (a.model < b.model ? -1 : 1));

  return [...results, ...extras.slice(0, limit - results.length)]
    .map(({ score, ...s }) => s);
}
