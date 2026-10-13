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
