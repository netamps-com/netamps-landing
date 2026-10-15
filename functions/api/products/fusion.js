/**
 * Rank fusion + cross-encoder reranking for catalog suggestion.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * `catalog.js searchCatalog` is a CASCADE, not a fusion: it short-circuits on
 * the first tier that returns anything (FTS5 → prefix → alias/JW). That is
 * cheap and predictable, but it means a strong FTS5 hit can bury an equally
 * strong alias hit, and BM25's unbounded score is never compared against the
 * other tiers' scales because the other tiers usually never run.
 *
 * RRF (Cormack et al.) replaces "first tier wins" with "every tier votes".
 * score(d) = Σ_lists weight / (k + rank). Because it consumes RANKS and never
 * score magnitudes, BM25 (unbounded), Jaro-Winkler (0..1) and category
 * position fuse without any calibration — which is the entire point.
 *
 * ── WHY A CROSS-ENCODER, NOT AN LLM ─────────────────────────────────────────
 * A cross-encoder scores (query, passage) JOINTLY and returns a number. It
 * cannot emit an id, so the grounding-validator machinery that
 * `matching/ranker.js` needs for an LLM reranker — "may only permute", "never
 * invent ids" — has no role here at all. There is no hallucination surface.
 *
 * `@cf/baai/bge-reranker-base` is Cloudflare-hosted on the same account as the
 * `AI` binding, so this stays inside the semantic air gap: no third-party
 * vendor, no external API key, nothing leaves the account. At $0.0031/M input
 * tokens it is ~90x cheaper per call than the Llama tier, which is why the LLM
 * is kept for the "nothing matched" path rather than used to reorder.
 *
 * ── CATEGORY IS A SOFT PRIOR, NEVER A FILTER ─────────────────────────────────
 * The form offers 12 ITAD categories; the catalog stores a different, coarser
 * taxonomy (`servers`, `network`, `storage`, ...). Hard-filtering on the user's
 * selection returns ZERO rows whenever the two disagree — most obviously for
 * "Other / Mixed", which is a legal choice with no catalog counterpart. So the
 * category contributes one weighted list. A candidate out of category can
 * still surface on its lexical or semantic merits; category only decides who
 * wins ties and who gets a nudge.
 *
 * ── WHAT IS NOT DONE HERE ───────────────────────────────────────────────────
 * Nothing in this module alters a user-visible response. It is wired in behind
 * the `fusion_shadow` flag and records what it WOULD have returned, so the
 * ranking can be measured against the live cascade before any cutover. See
 * `shadowFusion` in ./shadow.js and the wiring in ./suggest.js.
 */

import { searchFtsTier, normalizeFold, parseAliases, jaroWinkler, CATALOG_FUZZY_MIN } from './catalog.js';

/** Standard RRF damping constant. k=60 is the value from the original paper and
 *  is what makes rank 1 worth ~1/61 and rank 10 worth ~1/70 — the curve is flat
 *  enough that one tier's top hit cannot dominate a three-vote field. */
export const RRF_K = 60;

/** Per-list weights. Category is deliberately < 1: it is a nudge, not a law. */
export const LIST_WEIGHTS = Object.freeze({
  fts: 1.0,
  alias: 0.8,
  category: 0.6
});

export const RERANK_MODEL = '@cf/baai/bge-reranker-base';

/** How many fused candidates the cross-encoder is allowed to re-score. Reranking
 *  is quadratic in cost and gains nothing below the fold a visitor sees; 20 is
 *  the existing CATALOG_MAX_RESULTS so "rerank everything you were going to be
 *  shown" is exactly satisfied and nothing extra is paid for. */
export const RERANK_TOP_N = 20;

/** bge-reranker-base has a ~512-token window across query+passage. Spec
 *  templates run ~200 chars, so this budget is generous for one product and
 *  still refuses to build an unbounded passage out of model+spec+aliases. */
const MAX_DOC_CHARS = 1200;
const RERANK_TIMEOUT_MS = 3000;

/**
 * Reciprocal Rank Fusion.
 *
 * Consumes ordered id lists, returns ids ordered by fused score. Deliberately
 * pure and side-effect free so it can be unit-tested without a database, and
 * so the same function can later be reused by the offline eval harness.
 *
 * Ties break on id, NOT on input order: a ranking that depends on which tier
 * happened to finish first is not reproducible, and a shadow comparison whose
 * output wobbles between runs cannot be used to justify a cutover.
 *
 * @param {Array<{name:string, ids:string[], weight?:number}>} lists
 * @param {{k?:number}} [opts]
 * @returns {Array<{id:string, score:number, votes:number}>}
 */
export function rrf(lists, { k = RRF_K } = {}) {
  const acc = new Map();
  for (const list of lists || []) {
    if (!list || !Array.isArray(list.ids) || list.ids.length === 0) continue;
    const weight = Number.isFinite(list.weight) ? list.weight : 1;
    list.ids.forEach((id, i) => {
      if (!id) return;
      const rank = i + 1;
      const prev = acc.get(id) || { id, score: 0, votes: 0 };
      prev.score += weight / (k + rank);
      prev.votes += 1;
      acc.set(id, prev);
    });
  }
  return [...acc.values()].sort(
    (a, b) => (b.score - a.score) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * Alias + Jaro-Winkler list, run independently of the cascade so its votes are
 * available to the fusion even when FTS5 already answered.
 *
 * Bounded scan (mirrors the cascade's own cap) so this can never become a
 * full-table read on a keystroke.
 */
export async function aliasList(env, q, limit, pool) {
  if (!env?.DB || typeof env.DB.prepare !== 'function') return [];
  const qcmp = normalizeFold(q).slice(0, 64);
  if (!qcmp) return [];
  const cap = 200;
  let rows = [];
  try {
    const res = await env.DB.prepare(
      `SELECT id, model, aliases FROM products ORDER BY id LIMIT ?`
    ).bind(Math.min(cap, Math.max(limit * 10, 50))).all();
    rows = res?.results || [];
  } catch {
    return [];
  }
  if (rows.length === 0) return pool?.size ? [...pool.keys()] : [];

  const hits = [];
  for (const r of rows) {
    const aliases = parseAliases(r);
    if (aliases.some((a) => a.startsWith(qcmp))) {
      hits.push({ id: r.id, score: 1 });
      continue;
    }
    const modelFold = normalizeFold(r.model);
    let best = jaroWinkler(qcmp, modelFold);
    for (const a of aliases) best = Math.max(best, jaroWinkler(qcmp, a));
    if (best >= CATALOG_FUZZY_MIN) hits.push({ id: r.id, score: best });
  }
  hits.sort((a, b) => (b.score - a.score) || (a.id < b.id ? -1 : 1));
  return hits.slice(0, limit).map((h) => h.id);
}

/**
 * Category list: the catalog rows inside the chosen category, most recently
 * touched first. This is a POSITION list, not a relevance list — the visitor
 * named the category, so within it anything is a better candidate than a
 * lexical accident from outside it.
 *
 * No category, or one with no catalog rows, yields an empty list, which the
 * fusion treats as "this tier abstained" rather than "nothing matches".
 */
export async function categoryList(env, category, limit) {
  if (!env?.DB || typeof env.DB.prepare !== 'function') return [];
  const slug = normalizeFold(category).replace(/\s+/g, '_');
  if (!slug || slug === 'other_mixed' || slug === 'other') return [];
  try {
    const res = await env.DB.prepare(
      `SELECT id FROM products
       WHERE category = ?1 OR category = ?2
       ORDER BY id LIMIT ?3`
    )
      .bind(slug, slug.replace(/_equipment$|_and_desktops$/, ''), limit)
      .all();
    return (res?.results || []).map((r) => r.id);
  } catch {
    return [];
  }
}

/** Build the per-candidate passage sent to the cross-encoder. */
export function buildDoc(row) {
  const model = String(row?.model || '').slice(0, 120);
  const category = String(row?.category || '').slice(0, 40);
  const spec = String(row?.specTemplate || '').slice(0, 600);
  return [category, model, spec].filter(Boolean).join(' | ').slice(0, MAX_DOC_CHARS);
}

/**
 * Pull one score per context out of whatever the endpoint returned.
 *
 * The published schemas for this model disagree — the batch form is
 * `{ query, contexts:[{text}] }`, but at least one doc page still shows a
 * single-document `{ text }` form, and the response envelope has appeared as
 * both `{ data: [...] }` and a bare array across Workers AI text-classification
 * models. Rather than bet on one shape and 500 on a keystroke path, this walks
 * the plausible shapes and REFUSES to guess: if it cannot find exactly as many
 * finite scores as contexts, the caller keeps the fused order. A silently
 * mis-parsed array would reorder results on garbage.
 *
 * @returns {number[]|null}
 */
export function extractScores(payload, expected) {
  if (expected === 0) return [];
  const candidates = [];

  const push = (v) => {
    if (Array.isArray(v)) candidates.push(v);
  };

  if (Array.isArray(payload)) push(payload);
  else if (payload && typeof payload === 'object') {
    push(payload.data);
    push(payload.results);
    push(payload.scores);
    // [{ label:'...', score: n }, ...]
    if (Array.isArray(payload.data)) {
      const objs = payload.data.filter((d) => d && typeof d === 'object');
      if (objs.length && objs.every((d) => Number.isFinite(d.score))) {
        candidates.push(objs.map((d) => d.score));
      }
    }
  }

  for (const arr of candidates) {
    if (!Array.isArray(arr) || arr.length !== expected) continue;
    const nums = arr.map((x) => {
      if (typeof x === 'number') return x;
      // An object row carries its value under `.score`; a bare numeric string
      // coerces directly. Coercing a string via `x?.score` would read
      // `Number(undefined)` and silently drop the whole batch.
      if (x && typeof x === 'object') return Number(x.score);
      return Number(x);
    });
    if (nums.every((n) => Number.isFinite(n))) return nums;
  }
  return null;
}

/**
 * Cross-encoder rerank over the fused shortlist.
 *
 * SOFT FAIL BY CONSTRUCTION. Every failure mode — no AI binding, the global
 * kill switch, timeout, thrown error, unparseable scores, or a score count
 * that does not match — returns null, and the caller keeps the fused order. A
 * reranker is an improvement, never a dependency.
 *
 * Order is by descending score, ties broken on the incoming position so a
 * flat score set preserves the fusion's judgement instead of reshuffling it.
 *
 * @returns {Promise<Array|null>} reordered rows, or null when nothing was done
 */
export async function rerankCrossEncoder(env, query, rows, {
  topN = RERANK_TOP_N,
  timeoutMs = RERANK_TIMEOUT_MS,
  enabled = true
} = {}) {
  if (!enabled) return null;
  if (!env?.AI || typeof env.AI.run !== 'function') return null;
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const slice = rows.slice(0, topN);
  const tail = rows.slice(topN);
  if (slice.length < 2) return null; // nothing to reorder

  const contexts = slice.map((r) => ({ text: buildDoc(r) }));
  if (contexts.some((c) => !c.text)) return null;

  let res;
  try {
    const run = env.AI.run(RERANK_MODEL, { query: String(query).slice(0, 512), contexts });
    res = await (timeoutMs > 0
      ? Promise.race([
          run,
          new Promise((_, reject) => setTimeout(() => reject(new Error('RERANK_TIMEOUT')), timeoutMs))
        ])
      : run);
  } catch (err) {
    console.error('[fusion] rerank failed', err?.message);
    return null;
  }

  const scores = extractScores(res, slice.length);
  if (!scores) {
    console.error('[fusion] rerank score shape unrecognised — keeping fused order');
    return null;
  }

  const order = slice
    .map((row, i) => ({ row, score: scores[i], i }))
    .sort((a, b) => (b.score - a.score) || (a.i - b.i));

  return [...order.map((o) => o.row), ...tail];
}

/**
 * The whole shadowed pipeline: cascade lists → RRF → cross-encoder.
 * Returns the fused ids so the caller can record them without shipping them.
 *
 * @returns {Promise<{fused:string[], reranked:string[], rerankApplied:boolean}>}
 */
export async function fusedRank(env, query, { category = '', pool = new Map(), limit = 20 } = {}) {
  const ftsIds = ((await searchFtsTier(env, normalizeFold(query).slice(0, 64), limit)) || [])
    .map((r) => r.id);
  const aliasIds = await aliasList(env, query, limit, pool);
  const catIds = category ? await categoryList(env, category, limit) : [];

  const fused = rrf([
    { name: 'fts', ids: ftsIds, weight: LIST_WEIGHTS.fts },
    { name: 'alias', ids: aliasIds, weight: LIST_WEIGHTS.alias },
    { name: 'category', ids: catIds, weight: LIST_WEIGHTS.category }
  ], { k: RRF_K });

  let ids = fused.map((f) => f.id).slice(0, limit);
  let rerankApplied = false;

  const rows = ids
    .map((id) => pool.get(id))
    .filter(Boolean)
    .map((r) => ({ id: r.id, category: r.category, model: r.model, specTemplate: r.specTemplate }));

  if (rows.length >= 2) {
    const reordered = await rerankCrossEncoder(env, query, rows);
    if (reordered) {
      ids = reordered.map((r) => r.id);
      rerankApplied = true;
    }
  }

  return { fused, ids, rerankApplied };
}