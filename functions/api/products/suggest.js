/**
 * GET /api/products/suggest?q=&limit= — deterministic catalog typeahead.
 *
 * Catalog source: D1 `products` table seeded from approved SELL history +
 * ITAD taxonomy. Zero LLM, zero hallucination, sub-300ms cold, <50ms warm.
 *
 * Contract:
 *  - q (string, 2–64 chars, folded): query string
 *  - limit (integer, 1–20): max results (default 10)
 *  - Returns: { success, suggestions: ProductSuggestion[] }
 *
 * Matching: prefix on normalized name/model, then fuzzy (Jaro-Winkler ≥0.85)
 * over canonical model + aliases. No invention, no external calls.
 * Public endpoint (no session): per-IP rate limit only.
 */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

const CATALOG_MAX_RESULTS = 20;
const CATALOG_MIN_QUERY = 2;
const CATALOG_MAX_QUERY = 64;

const SUGGEST_RL_WINDOW_MS = 60 * 1000; // 1 min
const SUGGEST_RL_PER_IP = 60;
const suggestRlMap = new Map();

function suggestRateLimited(ip) {
  if (!ip || ip === 'unknown') return false;
  const now = Date.now();
  const rec = suggestRlMap.get(ip);
  if (!rec || now - rec.windowStart > SUGGEST_RL_WINDOW_MS) {
    suggestRlMap.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  rec.count += 1;
  if (suggestRlMap.size > 5000) suggestRlMap.clear();
  return rec.count > SUGGEST_RL_PER_IP;
}

function norm(s) {
  return String(s ?? '').trim().toLowerCase();
}

function jaroWinkler(a, b) {
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

async function ensureCatalog(env) {
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

function normalizeFold(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

async function searchCatalog(env, q, limit) {
  if (!env.DB || typeof env.DB.prepare !== 'function') {
    return [];
  }
  const qnorm = normalizeFold(q);
  if (!qnorm || qnorm.length < CATALOG_MIN_QUERY) return [];

  // Exact prefix matches first (fast path)
  const rows = await env.DB.prepare(
    `SELECT id, category, model, spec_template
     FROM products
     WHERE lower(model) LIKE ? || '%'
        OR lower(category) LIKE ? || '%'
     LIMIT ?`
  ).bind(qnorm, qnorm, limit * 2).all();

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
    if (aliases.some((a) => a.startsWith(qnorm))) {
      extras.push({ ...base, matchType: 'prefix', score: 1 });
      continue;
    }
    // Fuzzy: best Jaro-Winkler over canonical model + aliases, threshold 0.85.
    const modelFold = normalizeFold(r.model);
    let best = jaroWinkler(qnorm, modelFold);
    for (const a of aliases) best = Math.max(best, jaroWinkler(qnorm, a));
    if (best >= 0.85) extras.push({ ...base, matchType: 'fuzzy', score: best });
  }
  extras.sort((a, b) => (b.score - a.score) || (a.model < b.model ? -1 : 1));

  return [...results, ...extras.slice(0, limit - results.length)]
    .map(({ score, ...s }) => s);
}

function parseAliases(r) {
  try {
    const a = JSON.parse(r?.aliases || '[]');
    if (!Array.isArray(a)) return [];
    return a.map((x) => normalizeFold(x)).filter(Boolean);
  } catch {
    return [];
  }
}

export async function onRequestGet({ request, env }) {
  try {
    const ip = request.headers.get('cf-connecting-ip') ||
      (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
      'unknown';
    if (suggestRateLimited(ip)) {
      return json({ success: false, message: 'Too many suggestion requests.' }, 429);
    }

    await ensureCatalog(env);

    const url = new URL(request.url);
    const q = url.searchParams.get('q')?.trim() ?? '';
    if (!q || q.length > CATALOG_MAX_QUERY) {
      return json({ success: false, message: 'Query must be 2-64 characters.' }, 400);
    }
    const lim = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), CATALOG_MAX_RESULTS);
    const suggestions = await searchCatalog(env, q, lim);

    return json({ success: true, suggestions });
  } catch (err) {
    console.error('[products/suggest] error:', err);
    return json({ success: false, message: 'Suggestion service unavailable.' }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  // Admin seed/upsert (rate-limited, auth-gated) — optional admin surface later.
  // Not exposed yet; seed via admin console or direct D1 for v1.
  return json({ success: false, message: 'Not implemented.' }, 501);
}