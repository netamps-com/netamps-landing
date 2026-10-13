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

export const CATALOG_MAX_RESULTS = 20;
export const CATALOG_MIN_QUERY = 2;
export const CATALOG_MAX_QUERY = 64;

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

export async function ensureCatalog(env) {
  if (!env.DB || typeof env.DB.prepare !== 'function') return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      model TEXT NOT NULL,
      spec_template TEXT,
      aliases TEXT,         -- JSON array of aliases
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)'
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_products_model ON products(model)'
  ).run();
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

/**
 * @returns {Promise<Array<{id,category,model,specTemplate,matchType}>>}
 */
export async function searchCatalog(env, q, limit) {
  if (!env.DB || typeof env.DB.prepare !== 'function') return [];
  const folded = normalizeFold(q);
  if (!folded || folded.length < CATALOG_MIN_QUERY) return [];
  // Two views of the same query: `qcmp` for in-JS string similarity (no SQL
  // metacharacters), `qsql` escaped for the LIKE bind parameter.
  const qcmp = folded.slice(0, MAX_FOLD_QUERY);
  const qsql = escapeLike(qcmp);

  // Exact prefix matches first (fast path).
  // The `%` rides inside the BOUND PARAMETER, never after the ESCAPE clause:
  // `LIKE ? ESCAPE '\' || '%'` folds the escape char and '%' into a 2-char
  // escape expression and SQLite throws "ESCAPE expression must be a single
  // character", turning every catalog lookup into a 500.
  const rows = await env.DB.prepare(
    `SELECT id, category, model, spec_template
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
    matchType: 'prefix'
  }));

  if (results.length >= limit) return results.slice(0, limit);

  // Alias-prefix + fuzzy fallback over a capped scan (aliases live in a
  // JSON column, so token matching happens in JS over ≤200 rows).
  const prefixIds = [...new Set(results.map((r) => r.id))];
  const remaining = prefixIds.length > 0
    ? await env.DB.prepare(
      `SELECT id, category, model, spec_template, aliases
       FROM products
       WHERE id NOT IN (${prefixIds.map(() => '?').join(',')})
       LIMIT 200`
    ).bind(...prefixIds).all()
    : await env.DB.prepare(
      `SELECT id, category, model, spec_template, aliases
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
      specTemplate: r.spec_template || ''
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
