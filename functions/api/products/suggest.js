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
 *
 * Matching core lives in ./catalog.js so the Tier-2 normalizer resolves
 * catalog rows through the identical code path (one definition, no drift).
 */

import {
  CATALOG_MAX_RESULTS,
  CATALOG_MIN_QUERY,
  CATALOG_MAX_QUERY,
  normalizeFold,
  ensureCatalog,
  searchCatalog
} from './catalog.js';
import { compareAndRecord } from './shadow.js';

/**
 * Shadow comparison switch. Default OFF, same match_meta gate convention as
 * the normalizer. Absence of the key means no comparison and no writes.
 */
async function shadowEnabled(env) {
  if (!env.DB || typeof env.DB.prepare !== 'function') return false;
  try {
    const row = await env.DB
      .prepare("SELECT value FROM match_meta WHERE key = 'shadow_enabled'")
      .bind()
      .first();
    return !!row && row.value === '1';
  } catch {
    return false;
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

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

export async function onRequestGet({ request, env, context }) {
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

    const limitRaw = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
    const limit = Math.min(
      CATALOG_MAX_RESULTS,
      Math.max(1, Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 10)
    );

    if (normalizeFold(q).length < CATALOG_MIN_QUERY) {
      return json({ success: true, suggestions: [] });
    }

    const suggestions = await searchCatalog(env, q, limit);

    // Step 3 shadow comparison (docs/catalog-retrieval-etl.md §10).
    // Returns the LEGACY result untouched; FTS5 only records what it would
    // have returned, so we can prove the extra recall is correct before
    // cutover. Gated by match_meta 'shadow_enabled' (default OFF) and always
    // fire-and-forget: it can never alter or delay this response.
    if (await shadowEnabled(env)) {
      const work = compareAndRecord(env, q, suggestions, { limit })
        .catch((err) => console.error('[shadow] compare failed', err?.message));
      if (context && typeof context.waitUntil === 'function') {
        context.waitUntil(work);
      }
    }

    return json({ success: true, suggestions });
  } catch (err) {
    console.error('[products/suggest]', err);
    return json({ success: false, message: 'Suggestion service unavailable.' }, 500);
  }
}
