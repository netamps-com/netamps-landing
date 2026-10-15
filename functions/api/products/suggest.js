/**
 * GET /api/products/suggest?q=&limit= — catalog typeahead for BUY product search.
 *
 * Two tiers, both under one rule: the model suggests, the catalog decides.
 *
 * Tier 1 — deterministic, zero LLM: the D1 `products` catalog through
 *   ./catalog.js (FTS5 → prefix → alias-prefix → Jaro-Winkler fuzzy over
 *   model + aliases). This is the SAME matching core the Tier-2 normalizer
 *   resolves through (one definition, no drift), and the shadow-comparison
 *   harness keeps sampling it unchanged. When D1 is absent or the table is
 *   empty, the bundled seed catalog (./catalog.mjs) serves matches so the
 *   typeahead works before the table is seeded.
 *
 * Tier 2 — Workers AI, ONLY when Tier 1 finds nothing: calls go through the
 *   shared gateway (../llm/client.mjs — model identity, small→large
 *   escalation, telemetry and the `llm_enabled` emergency brake live there)
 *   and every returned id is re-validated against the same catalog universe
 *   Tier 1 serves (validateLLMResponse in ./catalog.mjs). A poisoned or
 *   invented id is dropped; unparseable output resolves to explicit unmatched
 *   (source: 'none'). Failure is always soft — the Custom (unverified) path
 *   is a valid outcome, never a failed request.
 *
 * Contract:
 *  - q (string, 2–64 chars, folded), limit (integer 1–20, default 10)
 *  - Returns { success, query, source: 'catalog' | 'llm' | 'none', suggestions[], hasMore }
 *  - Each suggestion carries BOTH consumer shapes:
 *      ProductTypeahead: id, category, model, specTemplate, matchType
 *      ProductSuggest:   id, category, brand, model, spec, score
 *
 * Public endpoint (catalog data only, no PII): per-IP rate limit only.
 * Matching core lives in ./catalog.js so the Tier-2 normalizer resolves
 * catalog rows through the identical code path (one definition, no drift).
 */

import {
  CATALOG_MAX_RESULTS,
  CATALOG_MIN_QUERY,
  CATALOG_MAX_QUERY,
  normalizeFold,
  normalizeCategory,
  rowConfidence,
  shouldEscalateToLlm,
  filterByCategory,
  ensureCatalog,
  searchCatalog
} from './catalog.js';
import { compareAndRecord, shadowFusion } from './shadow.js';
import { fusedRank } from './fusion.js';
import { runJson } from '../llm/client.mjs';
import { SEED_UNIQUE, matchCatalog, validateLLMResponse, foldText } from './catalog.mjs';

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

/**
 * Rank-fusion + cross-encoder shadow. Default OFF.
 *
 * A SEPARATE gate from `shadow_enabled`, deliberately. That key currently
 * authorises the legacy-vs-FTS5 comparison whose recorded evidence justified
 * the FTS cutover; turning it on must not silently also start a second,
 * unrelated experiment and a second AI call per keystroke. Two switches means
 * each experiment can be run, reviewed and turned off independently.
 *
 * Requires BOTH this and `shadow_enabled`, so the existing gate still governs
 * whether the endpoint writes diagnostic rows at all.
 */
async function fusionShadowEnabled(env) {
  if (!(await shadowEnabled(env))) return false;
  if (!env.DB || typeof env.DB.prepare !== 'function') return false;
  try {
    const row = await env.DB
      .prepare("SELECT value FROM match_meta WHERE key = 'fusion_shadow'")
      .bind()
      .first();
    return !!row && row.value === '1';
  } catch {
    return false;
  }
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }
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

// Tier-2 short-TTL cache — the same no-match query does not re-pay the model
// (and an 'none' verdict expires quickly if the catalog grows). Tier-1 hits
// are NOT memory-cached so the shadow harness keeps sampling every request.
const TIER2_TTL_MS = 60_000;
const tier2Cache = new Map(); // foldedQuery -> { at, body }
const LLM_TIMEOUT_MS = 4000;
const LLM_MAX_TOKENS = 160;
// Tier-1 rows scoring below this (or disagreeing with the chosen category) mean
// the model is consulted. Tunable per-environment via match_meta
// 'llm_confidence_floor' once shadow data justifies moving it.
const LLM_CONFIDENCE_FLOOR = 0.75;
// The prompt carries the catalog inline so ids can be COPIED, not guessed.
// 600 rows ≈ well inside context; validation below still uses the FULL set.
const LLM_PROMPT_CATALOG_CAP = 600;

/**
 * The catalog universe this endpoint serves: D1 `products` rows when any
 * exist, else the bundled seed floor. ONE rule shared by Tier 1, the Tier-2
 * id re-validation and returns.js submit-time re-check — an id can only ever
 * be "verified" if this endpoint could actually have served it.
 *
 * Exported — returns.js re-validates claimed catalogIds at submit time and
 * demotes any id absent from here to Custom (unverified).
 */
export async function loadCatalog(env) {
  if (!env.DB || typeof env.DB.prepare !== 'function') return SEED_UNIQUE;
  try {
    await ensureCatalog(env);
    const res = await env.DB.prepare(
      'SELECT id, category, model, spec_template FROM products'
    ).all();
    const rows = (res?.results || [])
      .map((r) => ({
        id: String(r.id),
        category: r.category || 'mixed',
        // D1 model strings lead with the brand ("Dell PowerEdge R740"), so no
        // separate brand column is needed; the seed entries carry one.
        brand: '',
        model: String(r.model || ''),
        spec: typeof r.spec_template === 'string' ? r.spec_template : ''
      }))
      .filter((r) => r.id && r.model);
    return rows.length > 0 ? rows : SEED_UNIQUE;
  } catch {
    return SEED_UNIQUE;
  }
}

/** Does the D1 catalog have rows? False without a DB, on an empty table, or
 *  on any D1 error (the seed floor then degrades gracefully). */
async function hasD1Catalog(env) {
  if (!env.DB || typeof env.DB.prepare !== 'function') return false;
  try {
    await ensureCatalog(env);
    const row = await env.DB.prepare('SELECT id FROM products LIMIT 1').first();
    return !!row;
  } catch {
    return false;
  }
}

/**
 * Tier 2 — Workers AI fallback through the shared gateway, strictly bounded.
 * Returns candidate ids that pass validateLLMResponse (full-catalog
 * membership enforced) or null when the model is unavailable, rejected by the
 * llm_enabled brake, unparseable, or simply unsure. Never throws.
 */
async function llmFallback(env, rawQuery, universe) {
  const compactCatalog = universe
    .slice(0, LLM_PROMPT_CATALOG_CAP)
    .map((e) => `${e.id} | ${e.category} | ${e.brand ? `${e.brand} ` : ''}${e.model}`)
    .join('\n');

  const system = [
    "You map a buyer's typed equipment query to entries from a FIXED catalog.",
    'Reply with ONLY a JSON object: {"candidates":["id",...],"unmatched":boolean}.',
    'Rules:',
    '- candidates may ONLY contain ids copied EXACTLY from the catalog list. Never invent ids, models, specs, or near-miss ids.',
    '- If no catalog entry plausibly matches, return {"candidates":[],"unmatched":true}.',
    '- Max 4 candidates, best first. No prose, no markdown fences.'
  ].join('\n');

  const user = `CATALOG (id | category | brand model):\n${compactCatalog}\n\nBUYER QUERY: ${JSON.stringify(String(rawQuery).slice(0, 120))}\n\nJSON:`;

  const res = await runJson(env, {
    feature: 'buy_suggest',
    promptVersion: 'suggest-t2-v1',
    tier: 'auto',
    temperature: 0,
    maxTokens: LLM_MAX_TOKENS,
    timeoutMs: LLM_TIMEOUT_MS,
    system,
    user
  });
  if (!res || res.ok !== true || res.payload === undefined || res.payload === null) return null;

  // The gateway already parsed JSON — re-serialize so the EXACT validator
  // exercised by scripts/test-buy-suggest.mjs runs on the production path
  // too (fence/prose tolerance, poisoned-id drop, dedupe, cap).
  const text = typeof res.payload === 'string' ? res.payload : JSON.stringify(res.payload);
  const verdict = validateLLMResponse(text, universe);
  return verdict.candidates.length > 0 ? verdict.candidates : null;
}

/** Map a catalog entry (seed or D1 row, Tier 1 or Tier 2) onto the response
 *  shape BOTH consumers read: ProductTypeahead wants specTemplate/matchType,
 *  ProductSuggest wants spec/brand/score. */
function toSuggestion(m) {
  const spec = (typeof m.spec === 'string' && m.spec)
    ? m.spec
    : (typeof m.specTemplate === 'string' ? m.specTemplate : '');
  const matchType = (m.matchType === 'prefix' || m.matchType === 'fuzzy')
    ? m.matchType
    : (typeof m.matchType === 'string' && m.matchType ? m.matchType : 'prefix');
  return {
    id: m.id,
    category: m.category,
    brand: m.brand || '',
    model: m.model || '',
    spec,
    specTemplate: spec,
    matchType,
    score: Number.isFinite(m.score) ? m.score : (matchType === 'prefix' ? 90 : 75)
  };
}

export async function onRequestGet({ request, env, context }) {
  try {
    const ip = request.headers.get('cf-connecting-ip') ||
      (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
      'unknown';
    if (suggestRateLimited(ip)) {
      return json({ success: false, message: 'Too many suggestion requests.' }, 429);
    }

    const url = new URL(request.url);
    const q = url.searchParams.get('q')?.trim() ?? '';
    if (!q || q.length > CATALOG_MAX_QUERY) {
      return json({ success: false, message: 'Query must be 2-64 characters.' }, 400);
    }

    // The Equipment Category the visitor has selected, if any. Used ONLY by the
    // fusion shadow today. It is deliberately NOT part of the returned
    // ordering while the experiment runs — accepting the parameter changes the
    // request, never the response, so turning the shadow on cannot silently
    // change what a visitor sees.
    const category = (url.searchParams.get('cat') || '').trim().slice(0, 64);

    const limitRaw = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
    const limit = Math.min(
      CATALOG_MAX_RESULTS,
      Math.max(1, Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 10)
    );

    if (normalizeFold(q).length < CATALOG_MIN_QUERY) {
      return json({ success: true, query: q, source: 'none', suggestions: [], hasMore: false });
    }

    // ── Tier 1 — deterministic ──────────────────────────────────────────
    const d1 = await hasD1Catalog(env);
    const tier1 = d1
      ? await searchCatalog(env, q, limit)
      : matchCatalog(SEED_UNIQUE, q, limit);

    // Step 3 shadow comparison (docs/catalog-retrieval-etl.md §10).
    // Returns the LEGACY result untouched; FTS5 only records what it would
    // have returned, so we can prove the extra recall is correct before
    // cutover. Gated by match_meta 'shadow_enabled' (default OFF) and always
    // fire-and-forget: it can never alter or delay this response.
    if (d1 && (await shadowEnabled(env))) {
      const work = compareAndRecord(env, q, tier1, { limit })
        .catch((err) => console.error('[shadow] compare failed', err?.message));
      if (context && typeof context.waitUntil === 'function') {
        context.waitUntil(work);
      }
    }

    // Rank-fusion + cross-encoder shadow (Stage 1 + 2 of docs/catalog-retrieval).
    // Same contract as the comparison above and just as strict: `tier1` is
    // still what gets returned. This records the ORDER fusion would have
    // produced so the change can be measured before anyone serves from it.
    // Gated on match_meta 'fusion_shadow' (default OFF) and fire-and-forget via
    // waitUntil, so it can neither delay nor alter this response.
    if (d1 && (await fusionShadowEnabled(env))) {
      const work = (async () => {
        try {
          const pool = new Map(
            (await loadCatalog(env)).map((e) => [e.id, e])
          );
          const fused = await fusedRank(env, q, { category, pool, limit });
          await shadowFusion(env, q, tier1.map((r) => r.id), fused.ids, {
            category,
            rerankApplied: fused.rerankApplied
          });
        } catch (err) {
          console.error('[shadow-fusion] failed', err?.message);
        }
      })();
      if (context && typeof context.waitUntil === 'function') {
        context.waitUntil(work);
      }
    }

    // ── Phase B: category discipline + confidence floor ──────────────────
    // Rank by confidence first (so `prefix` real hits outrank near-collision
    // fuzzy noise), then drop rows contradicting the buyer's chosen category.
    const scored = tier1
      .map((r) => ({ ...r, _conf: rowConfidence(r, category) }))
      .sort((a, b) => (b._conf - a._conf) || String(a.id).localeCompare(String(b.id)));
    const tier1Ranked = filterByCategory(scored, category);

    // The LLM is consulted when Tier 1 is empty, weak, or disagrees with the
    // chosen category — not merely when Tier 1 returned nothing.
    const escalate = shouldEscalateToLlm(tier1Ranked, category, LLM_CONFIDENCE_FLOOR);

    if (tier1Ranked.length > 0 && !escalate) {
      return json({
        success: true,
        query: q,
        source: 'catalog',
        suggestions: tier1Ranked.map(toSuggestion),
        hasMore: tier1Ranked.length >= limit
      });
    }

    // ── Tier 2 — LLM: no results, low confidence, or category conflict ──
    const cacheKey = foldText(q) + '|' + category;
    const hit = tier2Cache.get(cacheKey);
    if (hit && Date.now() - hit.at < TIER2_TTL_MS) {
      return json(hit.body, 200, { 'Cache-Control': 'public, max-age=30' });
    }

    let source = 'none';
    let matches = [];
    try {
      const universe = await loadCatalog(env);
      // When the buyer picked a category, only that category's rows are
      // eligible. Otherwise the model can reintroduce exactly the cross-category
      // noise Phase B just removed.
      const scoped = category
        ? universe.filter((e) => normalizeCategory(e.category) === category)
        : universe;
      const ids = await llmFallback(env, q, scoped.length > 0 ? scoped : universe);
      if (ids && ids.length > 0) {
        const byId = new Map(universe.map((e) => [e.id, e]));
        matches = ids
          .map((id, i) => {
            const entry = byId.get(id);
            // id already proven in the universe by validateLLMResponse
            return entry ? { ...entry, matchType: 'fuzzy', score: 90 - i } : null;
          })
          .filter(Boolean);
        source = matches.length > 0 ? 'llm' : 'none';
      }
    } catch (err) {
      console.error('[products/suggest] tier2 failed', err?.message);
      // soft failure — Custom (unverified) is always an acceptable outcome
    }

    // Union: confident Tier-1 hits first (they are exact), then LLM picks.
    // Tier-1 rows are kept only when they actually cleared the floor, so a
    // weak fuzzy list is never served just because the model failed.
    const keptTier1 = tier1Ranked.filter((r) => r._conf >= LLM_CONFIDENCE_FLOOR);
    const seenIds = new Set(keptTier1.map((r) => r.id));
    const merged = [...keptTier1];
    for (const m of matches) {
      if (seenIds.has(m.id)) continue;
      seenIds.add(m.id);
      merged.push(m);
    }
    const finalMatches = merged.length > 0 ? merged : tier1Ranked;
    if (finalMatches.length > 0 && source === 'none') {
      source = keptTier1.length > 0 ? 'catalog' : 'catalog-low-confidence';
    }

    const body = {
      success: true,
      query: q,
      source, // 'catalog' | 'catalog-low-confidence' | 'llm' | 'none' (Custom path)
      suggestions: finalMatches.slice(0, limit).map(toSuggestion),
      hasMore: finalMatches.length >= limit
    };
    tier2Cache.set(cacheKey, { at: Date.now(), body });
    if (tier2Cache.size > 500) {
      tier2Cache.delete(tier2Cache.keys().next().value);
    }
    return json(body, 200, { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' });
  } catch (err) {
    console.error('[products/suggest]', err);
    return json({ success: false, message: 'Suggestion service unavailable.' }, 500);
  }
}
