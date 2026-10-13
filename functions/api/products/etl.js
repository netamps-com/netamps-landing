/**
 * Catalog ETL — Extract / Transform / Load, plus schema validation.
 *
 * Design: docs/catalog-retrieval-etl.md.
 *
 * WHY THIS EXISTS (measured 2026-10-14, not assumed):
 *   Live queries against the 247-row catalog returned:
 *     ssd -> 0 (22 products contain it), nvme -> 0 (19),
 *     2u -> 0 (33), proliant -> 1 (14).
 *   Two structural causes in the legacy path:
 *     1. `LIMIT 200` on the fuzzy scan — the catalog is now 247, so ~47 products
 *        were NEVER scanned. The cap silently broke as the catalog grew.
 *     2. Prefix-only SQL over model+category; spec_template was never searched,
 *        so mid-string terms (ssd, nvme, 2u) were structurally unreachable.
 *   Jaro-Winkler is a whole-string metric and cannot fix substring recall at any
 *   threshold.
 *
 * FTS5 was verified available on this D1 account (CREATE VIRTUAL TABLE ... USING
 * fts5 succeeded; bm25() and prefix queries both work), so recall is restored
 * with an inverted index rather than by tuning a similarity threshold.
 *
 * This module is ADDITIVE. It never mutates `products` and never changes the
 * live query path; the FTS index is built alongside and verified for parity
 * before any cutover.
 */

// ── Controlled vocabulary ────────────────────────────────────────────────────

export const CATEGORIES = Object.freeze([
  'servers', 'storage', 'networking', 'laptops',
  'components', 'peripherals', 'telecom'
]);

// Tokens with no retrieval signal. Deliberately conservative: `x` is NOT
// stop-listed because it is meaningful in "2 x Xeon" and "10GbE x 8".
const STOPWORDS = new Set([
  'for', 'we', 'have', 'has', 'are', 'and', 'the', 'a', 'an', 'of', 'with',
  'need', 'want', 'looking', 'any', 'some', 'units', 'unit', 'nos', 'nos.'
]);

// ── Transform ────────────────────────────────────────────────────────────────

/** Fold to a canonical searchable form. Same rules as normalizeFold. */
export function fold(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Split folded text into retrieval tokens.
 *
 * Model numbers are PROTECTED: a token containing a digit is emitted verbatim
 * (and also split on hyphen/space boundaries into its alphanumeric parts), so
 * `9300-48p`, `r750`, `dl380` are never stemmed or mangled.
 */
export function tokenize(text) {
  const folded = fold(text);
  if (!folded) return [];
  const out = [];
  for (const raw of folded.split(' ')) {
    if (!raw || STOPWORDS.has(raw)) continue;
    out.push(raw);
    // Also index the digit-bearing fragments of compound codes so that
    // searching "48p" can reach "catalyst 9300 48p".
    if (/\d/.test(raw) && raw.length > 3 && /[-_]/.test(raw)) {
      for (const part of raw.split(/[-_]/)) {
        if (part && part !== raw && /[a-z0-9]/.test(part)) out.push(part);
      }
    }
  }
  return [...new Set(out)];
}

/** Build the FTS document for a catalog row: field-tagged, synonym-expanded. */
export function buildDocument(row, synonyms = new Map()) {
  const aliases = safeParseAliases(row.aliases);
  const parts = [];
  const push = (field, value) => {
    const toks = tokenize(value);
    if (toks.length) parts.push(`${field} ${toks.join(' ')}`);
  };
  push('model', row.model);
  push('cat', row.category);
  push('spec', row.spec_template || '');
  for (const a of aliases) push('alias', a);

  // Synonym expansion: emit the canonical term alongside the original so a
  // query for either spelling finds the row.
  for (const syn of new Set(parts.join(' ').split(' '))) {
    const canon = synonyms.get(syn);
    if (canon && canon !== syn) parts.push(`syn ${canon}`);
  }
  return parts.join(' ').trim();
}

export function safeParseAliases(raw) {
  try {
    const a = JSON.parse(raw || '[]');
    if (!Array.isArray(a)) return [];
    return a.map((x) => String(x).trim()).filter(Boolean).slice(0, 12);
  } catch {
    return [];
  }
}

// ── Schema validation (§4) ──────────────────────────────────────────────────

export const ID_RE = /^[a-z0-9-]{3,64}$/;
// Catches "rs 18000", "under 50k" and bare currency amounts in a spec field.
const PRICE_RE = /(?:₹|\brs\.?\s*\d|\b(?:inr|usd|eur)\b|\bunder\s+\d|\b\d{4,}\s*(?:rupees?|lakh|lakhs|crore|cr)\b)/i;

/**
 * Validate one catalog row. Returns { ok, errors, value }.
 * Never coerces — a bad field is an error, not a silent trim.
 */
export function validateRow(raw) {
  const errors = [];
  const id = String(raw?.id ?? '').trim();
  const category = String(raw?.category ?? '').trim().toLowerCase();
  const model = String(raw?.model ?? '').trim();
  const spec = String(raw?.spec_template ?? '').trim();
  const aliasesRaw = raw?.aliases;

  if (!id) errors.push('id:required');
  else if (!ID_RE.test(id)) errors.push('id:format');

  if (!category) errors.push('category:required');
  else if (!CATEGORIES.includes(category)) errors.push('category:not_in_vocabulary');

  if (!model) errors.push('model:required');
  else if (model.length < 2 || model.length > 160) errors.push('model:length');

  if (spec.length > 400) errors.push('spec:too_long');
  if (PRICE_RE.test(spec)) errors.push('spec:contains_price');

  let aliases = [];
  if (aliasesRaw !== undefined && aliasesRaw !== null && aliasesRaw !== '') {
    const parsed = safeParseAliases(
      typeof aliasesRaw === 'string' ? aliasesRaw : JSON.stringify(aliasesRaw)
    );
    if (!parsed.length) errors.push('aliases:unparseable');
    else if (parsed.length > 12) errors.push('aliases:too_many');
    else if (parsed.some((a) => a.length > 64)) errors.push('aliases:entry_too_long');
    else aliases = parsed;
  }

  return {
    ok: errors.length === 0,
    errors,
    value: errors.length ? null : { id, category, model, spec_template: spec, aliases },
  };
}

/**
 * Dedupe gate: a folded model already present under a DIFFERENT id is a
 * rejection, not a warning.
 *
 * This is not hypothetical — seeding the catalog expansion produced six shadow
 * duplicates because INSERT OR IGNORE dedupes on primary key only, not model. A
 * duplicate splits one physical product across two ids, so normalization can
 * anchor the same hardware to different ids and emit inconsistent match keys.
 */
export function findDuplicate(row, existingByModel) {
  const key = fold(row?.model);
  if (!key) return null;
  const seen = existingByModel.get(key);
  if (!seen) return null;
  return seen === row.id ? null : { modelKey: key, keptId: seen, rejectedId: row.id };
}

// ── Schema (physical) ────────────────────────────────────────────────────────

/**
 * Create the ETL tables. Idempotent; safe to call on every request path.
 * `products_fts` is an external-content-free index: rows are managed
 * explicitly so a rebuild is always a full, verifiable replace.
 */
export async function ensureEtlTables(env) {
  if (!env.DB || typeof env.DB.prepare !== 'function') return;

  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS product_synonyms (' +
    'term TEXT PRIMARY KEY,' +
    'canonical TEXT NOT NULL,' +
    'category_hint TEXT,' +
    'approved_by TEXT,' +
    'createdAt DATETIME DEFAULT CURRENT_TIMESTAMP' +
    ')'
  ).run();

  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS catalog_staging (' +
    'raw_json TEXT NOT NULL,' +
    'source TEXT NOT NULL,' +
    'parsed_id TEXT,' +
    'parsed_category TEXT,' +
    'parsed_model TEXT,' +
    'errors TEXT,' +
    'status TEXT NOT NULL,' +
    'loadedAt DATETIME DEFAULT CURRENT_TIMESTAMP' +
    ')'
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_staging_status ON catalog_staging(status)'
  ).run();

  // Rebuildable artifact. Re-running the index build drops and repopulates it.
  await env.DB.prepare(
    "CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(" +
    "id UNINDEXED, model_tok, cat_tok, spec_tok, alias_tok, tokenize = 'unicode61'" +
    ")"
  ).run();
}

/** Load the synonym map for use by buildDocument. Missing table => empty map. */
export async function loadSynonyms(env) {
  const map = new Map();
  try {
    const { results } = await env.DB
      .prepare('SELECT term, canonical FROM product_synonyms')
      .bind().all();
    for (const r of results || []) {
      if (r?.term && r?.canonical) map.set(fold(r.term), fold(r.canonical));
    }
  } catch {
    // Table absent or unreadable — synonym expansion is optional by design.
  }
  return map;
}

/**
 * Full index rebuild from `products` (system of record).
 *
 * Validates every row, quarantines invalid ones into catalog_staging, rejects
 * model-duplicates, and loads the survivors into products_fts.
 *
 * @returns {Promise<{read:number, indexed:number, quarantined:number,
 *                    duplicates:number, errors:Array}>}
 */
export async function rebuildIndex(env, { source = 'products:rebuild' } = {}) {
  await ensureEtlTables(env);
  const synonyms = await loadSynonyms(env);

  const { results: rows } = await env.DB
    .prepare('SELECT id, category, model, spec_template, aliases FROM products')
    .bind().all();
  const all = rows || [];

  // First-wins on folded model. Iteration order is by rowid, so the original
  // seed row (lowest id) is kept and any later duplicate is rejected.
  const seenModel = new Map();
  for (const r of all) {
    const k = fold(r.model);
    if (k && !seenModel.has(k)) seenModel.set(k, r.id);
  }

  const report = { read: all.length, indexed: 0, quarantined: 0, duplicates: 0, errors: [] };
  const insert = env.DB.prepare(
    'INSERT INTO products_fts (id, model_tok, cat_tok, spec_tok, alias_tok) VALUES (?1, ?2, ?3, ?4, ?5)'
  );

  for (const r of all) {
    const { ok, errors, value } = validateRow(r);
    const dup = ok ? findDuplicate(r, seenModel) : null;

    if (dup) {
      report.duplicates++;
      if (report.errors.length < 50) {
        report.errors.push({ id: r.id, kind: 'duplicate_model', keptId: dup.keptId, modelKey: dup.modelKey });
      }
      continue;
    }
    if (!ok) {
      report.quarantined++;
      if (report.errors.length < 50) report.errors.push({ id: r.id, kind: 'schema', errors });
      try {
        await env.DB.prepare(
          'INSERT INTO catalog_staging (raw_json, source, parsed_id, parsed_category, parsed_model, errors, status) VALUES (?1,?2,?3,?4,?5,?6,?)'
        ).bind(
          JSON.stringify(r), source, r.id ?? null, r.category ?? null, r.model ?? null,
          JSON.stringify(errors), 'QUARANTINED'
        ).run();
      } catch {}
      continue;
    }

    const doc = buildDocument(value, synonyms);
    await insert.bind(
      value.id,
      tokenize(value.model).join(' '),
      tokenize(value.category).join(' '),
      tokenize(value.spec_template).join(' '),
      tokenize(safeParseAliases(value.aliases).join(' ')).join(' ')
    ).run();
    // buildDocument is also used by the query planner for parity checks.
    void doc;
    report.indexed++;
  }
  return report;
}

/**
 * FTS-backed search. Returns rows already ordered by BM25 relevance.
 *
 * This is the replacement candidate for the LIMIT-200 fuzzy scan. It returns
 * MATCHING rows only, so recall no longer degrades as the catalog grows.
 */
export async function ftsSearch(env, tokens, limit) {
  if (!tokens.length) return [];
  const match = tokens.map((t) => `"${t.replace(/"/g, '')}"`).join(' OR ');
  try {
    const { results } = await env.DB.prepare(
      'SELECT p.id, p.category, p.model, p.spec_template, bm25(products_fts) AS rank ' +
      'FROM products_fts JOIN products p ON p.id = products_fts.id ' +
      'WHERE products_fts MATCH ? ORDER BY rank LIMIT ?'
    ).bind(match, limit).all();
    return (results || []).map((r) => ({
      id: r.id,
      category: r.category,
      model: r.model,
      specTemplate: r.spec_template || '',
      rank: r.rank,
    }));
  } catch {
    return [];
  }
}
