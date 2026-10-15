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
  getCatalogSnapshot,
  searchCatalog,
  shortlistCandidates
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

/**
 * Write-through into a bounded TTL map. Bounded because this is per-isolate
 * module state: without a cap a long-lived isolate would retain every query a
 * visitor ever typed.
 */
function cacheResolve(map, foldedQuery, category, body) {
  map.set(`${foldedQuery}|${category}`, { at: Date.now(), body });
  if (map.size > 500) map.delete(map.keys().next().value);
}

// Tier-2 short-TTL cache — the same no-match query does not re-pay the model
// (and an 'none' verdict expires quickly if the catalog grows). Tier-1 hits
// are NOT memory-cached so the shadow harness keeps sampling every request.
const TIER2_TTL_MS = 60_000;
const tier2Cache = new Map(); // foldText(q)|category|mode -> { at, body }
// Catalog-only verdicts are cached too. Same rationale as the model cache but
// much shorter: this one is a hot-path optimisation for the typing burst, and
// the catalog itself is already snapshotted per isolate for 60s.
const RESOLVE_TTL_MS = 20_000;
const resolveCache = new Map(); // foldText(q)|category -> { at, body }

// Per-model budget. `tier: 'small'` below means this is the ONLY budget a
// typeahead request can spend on inference — there is no second attempt.
const LLM_TIMEOUT_MS = 3500;
// 4 ids × ~8 tokens of JSON is comfortably under this; the previous 160 was
// sized for the old 600-row prompt era.
const LLM_MAX_TOKENS = 96;
// Retrieve-then-rerank. The model re-ranks a shortlist instead of being handed
// the whole catalog: 25 rows is roughly 4KB of prompt against the previous
// ~40KB, and input tokens dominate typeahead latency.
const LLM_SHORTLIST = 25;
// Tier-1 rows scoring below this (or disagreeing with the chosen category) mean
// the model is consulted. Tunable per-environment via match_meta
// 'llm_confidence_floor' once shadow data justifies moving it.
const LLM_CONFIDENCE_FLOOR = 0.75;

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
  const snap = await getCatalogSnapshot(env);
  if (snap && snap.length > 0) {
    return snap.map((r) => ({
      id: r.id,
      category: r.category,
      brand: r.brand || '',
      model: r.model,
      spec: r.specTemplate || ''
    }));
  }
  return SEED_UNIQUE;
}

/** Does D1 serve a catalog? False without a DB, on an empty table, or on any
 *  D1 error (the seed floor then degrades gracefully).
 *
 *  Reads the isolate snapshot rather than issuing `ensureCatalog` + a probe
 *  query per request — the probe was pure overhead once the catalog is cached. */
async function hasD1Catalog(env) {
  return !!(await getCatalogSnapshot(env));
}

/**
 * Tier 2 — Workers AI reranker over a retrieved shortlist, strictly bounded.
 *
 * RETRIEVE, THEN RERANK. The previous version inlined up to 600 catalog rows
 * into the prompt on every call; measured cold latency was 10.5s. Retrieval is
 * already implemented and costs microseconds in memory, so the model's job is
 * narrowed to ranking ~25 retrieved candidates. Same capability, ~1/10th of the
 * input tokens.
 *
 * The shortlist is a HARD BOUND on what the model may choose: ids outside it
 * are not in the prompt, so it cannot copy them, and anything it does return
 * is still re-validated against the full universe by validateLLMResponse.
 *
 * `tier: 'small'` is deliberate. The gateway's 'auto' escalates to the 70B
 * model when the 8B model is slow or malformed, which on a typeahead means
 * waiting for two inferences. A typeahead must answer fast or not at all —
 * the Custom (unverified) path is always a valid outcome — so there is exactly
 * one attempt against the fast model.
 *
 * Returns candidate ids that pass validateLLMResponse (full-catalog membership
 * enforced) or null when the model is unavailable, rejected by the llm_enabled
 * brake, unparseable, or simply unsure. Never throws.
 */
async function llmFallback(env, rawQuery, scope, universe) {
  // Retrieve-then-rerank. scope is pre-folded for matching; universe is the
  // full id-validating set in the loadCatalog shape.
  const retrieved = shortlistCandidates(scope, rawQuery, LLM_SHORTLIST);
  if (retrieved.length === 0) {
    // No lexical evidence anywhere in the catalog. Asking a model to pick from
    // an arbitrary slice would only invite a guess, and the honest answer here
    // is the Custom path — which is exactly what `none` renders.
    return null;
  }

  const compactCatalog = retrieved
    .map((e) => `${e.id} | ${e.category} | ${e.brand ? `${e.brand} ` : ''}${e.model}`)
    .join('\n');

  const system = [
    "You map a buyer's typed equipment query to entries from a SHORTLIST of candidates.",
    'Reply with ONLY a JSON object: {"candidates":["id",...],"unmatched":boolean}.',
    'Rules:',
    '- candidates may ONLY contain ids copied EXACTLY from the shortlist. Never invent ids, models, specs, or near-miss ids.',
    '- Ignore candidates that do not plausibly match the buyer\'s intent, even if they share a brand.',
    '- If no candidate plausibly matches, return {"candidates":[],"unmatched":true}.',
    '- Max 4 candidates, best first. No prose, no markdown fences.'
  ].join('\n');

  const user = `CANDIDATES (id | category | brand model):\n${compactCatalog}\n\nBUYER QUERY: ${JSON.stringify(String(rawQuery).slice(0, 120))}\n\nJSON:`;

  const res = await runJson(env, {
    feature: 'buy_suggest',
    promptVersion: 'suggest-t2-v2-shortlist',
    tier: 'small',
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

    // Response mode. This is the latency contract, and it exists because the
    // typeahead cannot afford to block on inference while the user is typing:
    //
    //   (absent)  'auto' — historical behaviour: catalog first, model consulted
    //             only when Tier 1 is empty/weak. Kept for direct API callers
    //             and scripts/test-buy-suggest.mjs.
    //   'fast'    Catalog only. Never calls the model. Answers from the
    //             per-isolate snapshot in well under a millisecond, so the
    //             dropdown paints while the visitor is still typing.
    //   'llm'     Same escalation rules, but the model IS consulted for a
    //             low-confidence query. The client fires this ~700ms after the
    //             last keystroke and swaps the results in underneath the
    //             already-visible fast list.
    const modeRaw = (url.searchParams.get('mode') || '').trim().toLowerCase();
    const mode = (modeRaw === 'fast' || modeRaw === 'llm') ? modeRaw : 'auto';

    if (normalizeFold(q).length < CATALOG_MIN_QUERY) {
      return json({ success: true, query: q, source: 'none', suggestions: [], hasMore: false });
    }

    // `mode=fast` short-circuits the whole keystroke path on a warm verdict
    // from this isolate. During a typing burst the same prefixes repeat
    // constantly, so most keystrokes cost zero D1 and zero inference.
    if (mode === 'fast') {
      const rHit = resolveCache.get(foldText(q) + '|' + category);
      if (rHit && Date.now() - rHit.at < RESOLVE_TTL_MS) {
        return json(rHit.body, 200, { 'Cache-Control': 'public, max-age=30' });
      }
    }

    // ── Tier 1 — deterministic ──────────────────────────────────────────
    const d1 = await hasD1Catalog(env);
    const tier1 = d1
      ? await searchCatalog(env, q, limit, category)
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
    // `mode=fast` short-circuits here: that request is on the keystroke path
    // and must never pay inference latency.
    const escalate = mode !== 'fast' && shouldEscalateToLlm(tier1Ranked, category, LLM_CONFIDENCE_FLOOR);

    if (tier1Ranked.length > 0 && !escalate) {
      const body = {
        success: true,
        query: q,
        source: 'catalog',
        suggestions: tier1Ranked.map(toSuggestion),
        hasMore: tier1Ranked.length >= limit
      };
      if (mode === 'fast') cacheResolve(resolveCache, foldText(q), category, body);
      return json(body, 200, mode === 'fast'
        ? { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' }
        : {});
    }

    // ── Tier 2 — LLM: no results, low confidence, or category conflict ──
    const cacheKey = foldText(q) + '|' + category + '|' + mode;
    const hit = tier2Cache.get(cacheKey);
    if (hit && Date.now() - hit.at < TIER2_TTL_MS) {
      return json(hit.body, 200, { 'Cache-Control': 'public, max-age=30' });
    }

    let source = 'none';
    let matches = [];
    // `mode=fast` reaches here only when Tier 1 found nothing (a weak result set
    // returns above, because escalate is forced false). Answer 'none' — the
    // Custom (unverified) path — instead of blocking this keystroke on the
    // model. The paired `mode=llm` request, fired once typing settles, is what
    // actually consults Workers AI.
    if (mode !== 'fast') {
      try {
        const universe = await loadCatalog(env);
        // When the buyer picked a category, only that category's rows are
        // eligible. Otherwise the model can reintroduce exactly the cross-category
        // noise Phase B just removed.
        const snap = (await getCatalogSnapshot(env)) || null;
        const scope = snap
          ? (category ? snap.filter((e) => normalizeCategory(e.category) === category) : snap)
          : SEED_UNIQUE;
        // An over-narrow scope (category with no rows) would leave the model
        // nothing to choose; fall back to the full universe in that case.
        const ids = await llmFallback(env, q, scope.length > 0 ? scope : universe, universe);
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
    // Re-apply the category gate to the MERGED list. The model only ever sees
    // category-scoped rows, but validateLLMResponse checks membership against
    // the FULL universe — so a poisoned-but-real out-of-scope id would otherwise
    // slip past the gate that Phase B exists to enforce. filterByCategory is
    // strict, so an emptied result here is the correct answer, not a failure.
    const gated = filterByCategory(finalMatches, category);
    let finalSource = source;
    if (gated.length === 0) {
      // Nothing survived the gate: report the honest Custom outcome rather than
      // claiming a source that produced no rows.
      finalSource = 'none';
    } else if (source === 'none') {
      finalSource = keptTier1.length > 0 ? 'catalog' : 'catalog-low-confidence';
    }

    const body = {
      success: true,
      query: q,
      source: finalSource, // 'catalog' | 'catalog-low-confidence' | 'llm' | 'none' (Custom path)
      suggestions: gated.slice(0, limit).map(toSuggestion),
      hasMore: gated.length >= limit
    };
    tier2Cache.set(cacheKey, { at: Date.now(), body });
    if (tier2Cache.size > 500) {
      tier2Cache.delete(tier2Cache.keys().next().value);
    }
    if (mode === 'fast') cacheResolve(resolveCache, foldText(q), category, body);
    return json(body, 200, { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' });
  } catch (err) {
    console.error('[products/suggest]', err);
    return json({ success: false, message: 'Suggestion service unavailable.' }, 500);
  }
}
