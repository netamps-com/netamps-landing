/**
 * Step 3 — shadow comparison between the legacy matcher and FTS5.
 *
 * Runs BOTH engines on every real typeahead query, logs where they disagree,
 * and returns the LEGACY result untouched. This produces the evidence needed
 * before cutover: not "does FTS return more rows" (already proven) but "are
 * those extra rows CORRECT".
 *
 * Zero user-visible change by construction — the response body is whatever the
 * legacy path produced. The comparison is fire-and-forget and never throws into
 * the request.
 *
 * Design: docs/catalog-retrieval-etl.md §10 step 3.
 */

import { searchCatalog } from './catalog.js';
import { ftsSearch, tokenize, ensureEtlTables } from './etl.js';

// Keep the shadow table small; it is diagnostic data, not a system of record.
const SHADOW_MAX_ROWS = 20000;

export async function ensureShadowTables(env) {
  if (!env.DB || typeof env.DB.prepare !== 'function') return;
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS catalog_shadow (' +
    'id TEXT PRIMARY KEY,' +
    'q TEXT NOT NULL,' +
    'legacy_count INTEGER NOT NULL,' +
    'fts_count INTEGER NOT NULL,' +
    'legacy_ids TEXT,' +
    'fts_only_ids TEXT,' +
    'legacy_only_ids TEXT,' +
    'fts_top TEXT,' +
    'createdAt DATETIME DEFAULT CURRENT_TIMESTAMP' +
    ')'
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_shadow_created ON catalog_shadow(createdAt)'
  ).run();
}

/** Roll the diagnostic table once it exceeds the row cap. */
async function trimShadow(env) {
  try {
    const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM catalog_shadow').bind().first();
    if ((c?.n ?? 0) <= SHADOW_MAX_ROWS) return;
    await env.DB.prepare(
      'DELETE FROM catalog_shadow WHERE id IN (' +
      'SELECT id FROM catalog_shadow ORDER BY createdAt ASC LIMIT -1 OFFSET ?' +
      ')'
    ).bind(Math.floor(SHADOW_MAX_ROWS * 0.8)).run();
  } catch {}
}

/**
 * Compare legacy vs FTS for one query and persist the disagreement.
 *
 * @returns {Promise<{legacy:number, fts:number, ftsOnly:string[], legacyOnly:string[]}>}
 */
export async function compareAndRecord(env, q, legacyRows, { limit = 25 } = {}) {
  const legacyIds = (legacyRows || []).map((r) => r.id);
  const ftsRows = await ftsSearch(env, tokenize(q), Math.max(limit, 50));
  const ftsIds = ftsRows.map((r) => r.id);

  const legacySet = new Set(legacyIds);
  const ftsSet = new Set(ftsIds);
  const ftsOnly = ftsIds.filter((id) => !legacySet.has(id));
  const legacyOnly = legacyIds.filter((id) => !ftsSet.has(id));

  try {
    await ensureShadowTables(env);
    await env.DB.prepare(
      'INSERT INTO catalog_shadow ' +
      '(id, q, legacy_count, fts_count, legacy_ids, fts_only_ids, legacy_only_ids, fts_top) ' +
      'VALUES (?1,?2,?3,?4,?5,?6,?7,?8)'
    ).bind(
      crypto.randomUUID(),
      String(q ?? '').slice(0, 128),
      legacyIds.length,
      ftsIds.length,
      JSON.stringify(legacyIds.slice(0, 50)),
      JSON.stringify(ftsOnly.slice(0, 50)),
      JSON.stringify(legacyOnly.slice(0, 50)),
      JSON.stringify(ftsRows.slice(0, 5).map((r) => r.model))
    ).run();
    await trimShadow(env);
  } catch (err) {
    // Diagnostics must never affect the caller.
    console.error('[shadow] record failed', err?.message);
  }

  return { legacy: legacyIds.length, fts: ftsIds.length, ftsOnly, legacyOnly };
}

// ── Rank fusion + cross-encoder shadow ──────────────────────────────────────
//
// A SECOND, SEPARATE table on purpose. `catalog_shadow` is the accepted record
// of the legacy-vs-FTS5 comparison that already justified the FTS cutover; it
// must keep answering that question unchanged. Overwriting it with fusion
// evidence would destroy the only justification for the tier currently serving
// users, so the new experiment gets its own table and its own gate.
//
// The question this table answers is different too, and narrower:
//   "does RRF + cross-encoder REORDER what the cascade already returned,
//    and does the top of that new order look more like the query?"
// Recall is not in question here — the cascade still decides what exists.

const FUSION_MAX_ROWS = 20000;

export async function ensureFusionShadowTables(env) {
  if (!env.DB || typeof env.DB.prepare !== 'function') return;
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS catalog_shadow_fusion (' +
    'id TEXT PRIMARY KEY,' +
    'q TEXT NOT NULL,' +
    'category TEXT,' +
    'baseline_ids TEXT,' +
    'fused_ids TEXT,' +
    'rerank_applied INTEGER,' +
    'top1_changed INTEGER,' +
    'reorder_distance INTEGER,' +
    'createdAt DATETIME DEFAULT CURRENT_TIMESTAMP' +
    ')'
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_shadow_fusion_created ON catalog_shadow_fusion(createdAt)'
  ).run();
}

async function trimFusionShadow(env) {
  try {
    const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM catalog_shadow_fusion').bind().first();
    if ((c?.n ?? 0) <= FUSION_MAX_ROWS) return;
    await env.DB.prepare(
      'DELETE FROM catalog_shadow_fusion WHERE id IN (' +
      'SELECT id FROM catalog_shadow_fusion ORDER BY createdAt ASC LIMIT -1 OFFSET ?' +
      ')'
    ).bind(Math.floor(FUSION_MAX_ROWS * 0.8)).run();
  } catch {}
}

/**
 * Position-sensitive distance between two ranked id lists.
 *
 * Why not "sets differ": the whole claim of a reranker is that the SAME
 * candidates come back in a BETTER order. Comparing sets can only ever report
 * "identical" and would be blind to the thing being evaluated. This is the
 * normalised inverse of Spearman's footrule (0 = identical order, 1 = fully
 * reversed), which is cheap and bounded — a full Kendall tau is O(n²) for no
 * extra signal at this list length.
 */
export function reorderDistance(baselineIds, candidateIds) {
  const a = (baselineIds || []).filter(Boolean);
  const b = (candidateIds || []).filter(Boolean);
  const n = Math.max(a.length, b.length);
  if (n === 0) return 0;
  const posA = new Map(a.map((id, i) => [id, i]));
  const posB = new Map(b.map((id, i) => [id, i]));
  let footrule = 0;
  for (const [id, i] of posA) {
    const j = posB.has(id) ? posB.get(id) : n;
    footrule += Math.abs(i - j);
  }
  // Max footrule for n items is n²/2 when one list is a full reversal.
  const maxFootrule = (n * n) / 2;
  return maxFootrule === 0 ? 0 : Math.min(1, footrule / maxFootrule);
}

/**
 * Record one fusion-vs-cascade comparison.
 *
 * `baselineIds` is what the user actually received; `candidateIds` is what
 * fusion would have returned. Nothing is served from the second list — this
 * function only writes evidence. Never throws into the caller.
 */
export async function shadowFusion(env, q, baselineIds, candidateIds, {
  category = '',
  rerankApplied = false
} = {}) {
  const base = (baselineIds || []).slice(0, 25);
  const cand = (candidateIds || []).slice(0, 25);
  const distance = reorderDistance(base, cand);

  try {
    await ensureFusionShadowTables(env);
    await env.DB.prepare(
      'INSERT INTO catalog_shadow_fusion ' +
      '(id, q, category, baseline_ids, fused_ids, rerank_applied, top1_changed, reorder_distance) ' +
      'VALUES (?1,?2,?3,?4,?5,?6,?7,?8)'
    ).bind(
      crypto.randomUUID(),
      String(q ?? '').slice(0, 128),
      String(category || '').slice(0, 64),
      JSON.stringify(base),
      JSON.stringify(cand),
      rerankApplied ? 1 : 0,
      base[0] && cand[0] && base[0] === cand[0] ? 0 : 1,
      Math.round(distance * 1000) / 1000
    ).run();
    await trimFusionShadow(env);
  } catch (err) {
    console.error('[shadow-fusion] record failed', err?.message);
  }

  return { distance, top1Changed: !!(base[0] && cand[0] && base[0] !== cand[0]) };
}

/**
 * Aggregate view for the fusion experiment: how much the new ranking actually
 * moves things, and whether the cross-encoder ran at all.
 *
 * Read this BEFORE proposing a cutover. A table full of distance 0 rows means
 * fusion is doing nothing and the change is not worth its cost; a high mean
 * distance means the order is moving a lot and every moved row needs a reason.
 */
export async function fusionSummary(env, { limit = 100 } = {}) {
  await ensureFusionShadowTables(env);
  const { results } = await env.DB.prepare(
    'SELECT q, category, baseline_ids, fused_ids, rerank_applied, top1_changed, reorder_distance ' +
    'FROM catalog_shadow_fusion ORDER BY createdAt DESC LIMIT ?'
  ).bind(limit).all();

  const rows = results || [];
  const n = rows.length || 1;
  const meanDistance = rows.reduce((s, r) => s + (r.reorder_distance || 0), 0) / n;
  const top1Changes = rows.reduce((s, r) => s + (r.top1_changed || 0), 0);
  const rerankRan = rows.reduce((s, r) => s + (r.rerank_applied || 0), 0);

  return {
    sampledQueries: rows.length,
    meanReorderDistance: Math.round(meanDistance * 1000) / 1000,
    top1ChangedQueries: top1Changes,
    crossEncoderAppliedQueries: rerankRan,
    crossEncoderSuccessRate: rows.length ? Math.round((rerankRan / rows.length) * 100) / 100 : null,
    queriesWithCategory: rows.filter((r) => r.category).length,
    rows: rows.slice(0, 20).map((r) => ({
      q: r.q,
      category: r.category || null,
      baseline: JSON.parse(r.baseline_ids || '[]').slice(0, 5),
      fused: JSON.parse(r.fused_ids || '[]').slice(0, 5),
      rerankApplied: !!r.rerank_applied,
      top1Changed: !!r.top1_changed,
      reorderDistance: r.reorder_distance
    }))
  };
}

/**
 * Aggregate view for review: how often FTS finds rows the legacy path misses,
 * and whether legacy ever finds rows FTS misses (that would be a regression).
 */
export async function shadowSummary(env, { limit = 50 } = {}) {
  await ensureShadowTables(env);
  const { results } = await env.DB.prepare(
    'SELECT q, legacy_count, fts_count, fts_only_ids, legacy_only_ids, fts_top ' +
    'FROM catalog_shadow ORDER BY createdAt DESC LIMIT ?'
  ).bind(limit).all();

  const rows = results || [];
  const ftsOnlyTotal = rows.reduce(
    (n, r) => n + (JSON.parse(r.fts_only_ids || '[]').length), 0
  );
  const legacyOnlyTotal = rows.reduce(
    (n, r) => n + (JSON.parse(r.legacy_only_ids || '[]').length), 0
  );
  const queriesFtsHelped = rows.filter(
    (r) => JSON.parse(r.fts_only_ids || '[]').length > 0
  ).length;

  return {
    sampledQueries: rows.length,
    queriesWhereFtsFoundMore: queriesFtsHelped,
    totalFtsOnlyRows: ftsOnlyTotal,
    totalLegacyOnlyRows: legacyOnlyTotal,
    verdict:
      legacyOnlyTotal > 0
        ? 'REGRESSION_RISK: legacy found rows FTS missed - investigate before cutover'
        : 'HEALTHY: FTS is a strict superset on this sample',
    rows: rows.map((r) => ({
      q: r.q,
      legacy: r.legacy_count,
      fts: r.fts_count,
      ftsOnly: JSON.parse(r.fts_only_ids || '[]').length,
      legacyOnly: JSON.parse(r.legacy_only_ids || '[]').length,
      top: JSON.parse(r.fts_top || '[]'),
    })),
  };
}
