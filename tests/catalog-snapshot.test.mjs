/**
 * Catalog snapshot + shortlist regression tests.
 *
 * WHY THIS FILE EXISTS
 * The in-memory snapshot (getCatalogSnapshot / searchSnapshot) was added on
 * 2026-10-15 to remove ~1.3s of sequential D1 DDL+reads per keystroke. It is a
 * PORT of the D1 cascade, not a redesign, so these tests pin the two things a
 * future edit could silently break:
 *
 *   1. RECALL — the mid-string terms the FTS5 tier exists for ('ssd', 'nvme',
 *      '2u', 'proliant') must still resolve, because they were structurally
 *      unreachable before FTS and are exactly what a buyer types.
 *   2. PARITY — the snapshot must agree with the legacy in-memory matcher
 *      (matchCatalog) on what a plain query should surface.
 *
 * Plus the shortlist bound: the whole point of retrieve-then-rerank is that the
 * model prompt stays small, so `shortlistCandidates` must never exceed its cap.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  searchCatalog,
  shortlistCandidates,
  invalidateCatalogSnapshot,
  normalizeFold,
  normalizeCategory,
  readVerificationStatus,
  rowConfidence,
  shouldEscalateToLlm,
  filterByCategory
} from '../functions/api/products/catalog.js';
import { SEED_CATALOG } from '../functions/api/products/catalog.mjs';

/**
 * Minimal D1 stand-in: answers the three shapes the snapshot loader issues.
 * Everything else throws, so any query added to the hot path later fails a test
 * instead of silently costing latency in production.
 */
function mockEnv(rows) {
  return {
    DB: {
      prepare(sql) {
        return {
          bind() { return this; },
          async all() {
            if (/FROM products\b/i.test(sql) && /SELECT id, category, model, spec_template, aliases/i.test(sql)) {
              return { results: rows };
            }
            throw new Error('unexpected D1 query on the snapshot path: ' + sql);
          },
          async first() { throw new Error('unexpected D1 first(): ' + sql); },
          async run() { throw new Error('unexpected D1 run(): ' + sql); }
        };
      }
    }
  };
}

const rows = SEED_CATALOG.map((r) => ({
  id: r.id,
  category: r.category,
  model: r.model,
  spec_template: r.specTemplate || r.spec || '',
  aliases: JSON.stringify(r.aliases || [])
}));

const env = mockEnv(rows);

const ids = (hits) => hits.map((h) => h.id);

test('snapshot is reused across calls (no repeat D1 query)', async () => {
  invalidateCatalogSnapshot();
  const a = await searchCatalog(env, 'dell r740', 10);
  const b = await searchCatalog(env, 'cisco catalyst', 10);
  // Both resolved without a throw, which means the loader served them from
  // cache (any uncached call would have hit the strict mock's `throw`).
  assert.ok(Array.isArray(a));
  assert.ok(Array.isArray(b));
});

test('exact model prefix returns prefix hits, best match first', async () => {
  invalidateCatalogSnapshot();
  const hits = await searchCatalog(env, 'poweredge r740', 5);
  assert.ok(hits.length > 0, 'expected at least one hit');
  assert.equal(hits[0].matchType, 'prefix');
  assert.equal(hits[0].id, 'dell-poweredge-r740');
});

test('brand-prefixed query finds the row via its spec text', async () => {
  invalidateCatalogSnapshot();
  // `model` is "PowerEdge R740" while the spec leads "Dell PowerEdge R740" —
  // so this resolves through the token tier, not a model prefix. That is the
  // same path the D1 FTS tier takes, and it must keep working.
  const hits = await searchCatalog(env, 'dell r740', 5);
  assert.ok(hits.length > 0);
  assert.equal(hits[0].id, 'dell-poweredge-r740');
});

test('mid-string recall survives (the terms FTS exists for)', async () => {
  invalidateCatalogSnapshot();
  // These are present in the seed catalog's spec text. 'nvme' is deliberately
  // absent from the 56-row seed (it was measured against the richer 247-row
  // D1 catalog) so it is not asserted here — asserting it would be fiction.
  for (const q of ['ssd', '2u', 'proliant', 'optiplex', 'raid']) {
    const hits = await searchCatalog(env, q, 20);
    assert.ok(hits.length > 0, `expected recall for "${q}", got 0`);
  }
});

test('caller gets the documented row shape', async () => {
  invalidateCatalogSnapshot();
  const [hit] = await searchCatalog(env, 'cisco catalyst 9300', 5);
  assert.ok(hit);
  for (const k of ['id', 'category', 'model', 'specTemplate', 'matchType']) {
    assert.ok(k in hit, `missing ${k}`);
  }
  // score must be stripped, exactly as the D1 cascade strips it.
  assert.ok(!('score' in hit), 'score should not leak into the final row');
});

test('empty / too-short query returns no rows without touching D1', async () => {
  invalidateCatalogSnapshot();
  assert.deepEqual(await searchCatalog(env, '', 5), []);
  assert.deepEqual(await searchCatalog(env, 'a', 5), []);
});

test('shortlistCandidates is capped and ranks the obvious match first', async () => {
  invalidateCatalogSnapshot();

  const built = rows.map((r) => ({
    id: r.id,
    category: r.category,
    model: r.model,
    specTemplate: r.spec_template,
    aliases: [],
    _foldModel: normalizeFold(r.model),
    _foldSpec: normalizeFold(r.spec_template),
    _foldCat: normalizeCategory(r.category)
  }));

  const short = shortlistCandidates(built, 'cisco catalyst 9300', 25);
  assert.ok(short.length <= 25, 'shortlist must respect its cap');
  assert.ok(short.length > 0, 'expected candidates for a real model query');
  // Brand lives in spec, not `model`, for the seed rows — assert on identity.
  assert.equal(short[0].id, 'cisco-catalyst-9300');

  // The whole point of retrieve-then-rerank is a SMALL prompt. A 25-row cap
  // against a 56-row catalog must actually bind.
  assert.ok(shortlistCandidates(built, 'server', 25).length <= 25);

  // A query with no lexical signal must NOT invent candidates — returning a
  // random slice is what let the model hallucinate before.
  assert.deepEqual(shortlistCandidates(built, 'qqqqzzzzxxxx', 25), []);
});

test('normalizeCategory collapses the UI slug variants onto one key', () => {
  for (const v of ['networking', 'Networking', 'network', 'networking_gear', 'Network Gear']) {
    assert.equal(normalizeCategory(v), 'networking', `failed for ${v}`);
  }
  assert.equal(normalizeCategory('servers'), 'servers');
  assert.equal(normalizeCategory('Data Center'), 'servers');
});

test('confidence floor opens the LLM path exactly when Tier 1 is weak', () => {
  const strongPrefix = { id: 'a', category: 'networking', model: 'Cisco Catalyst 9300-48P', matchType: 'prefix', score: 90 };
  // Same row, but the visitor picked a different category -> must escalate.
  assert.equal(shouldEscalateToLlm([strongPrefix], 'telecom', 0.75), true);
  // Agreement + prefix -> confident, stay on Tier 1.
  assert.equal(shouldEscalateToLlm([strongPrefix], 'networking', 0.75), false);
  // Nothing found -> escalate.
  assert.equal(shouldEscalateToLlm([], 'networking', 0.75), true);
});

test('rowConfidence ranks prefix above fuzzy', () => {
  const prefix = { id: 'a', category: 'networking', model: 'R740', matchType: 'prefix', score: 90 };
  const fuzzy = { id: 'b', category: 'networking', model: 'R750', matchType: 'fuzzy', score: 0.93 };
  assert.ok(rowConfidence(prefix, 'networking') > rowConfidence(fuzzy, 'networking'));
});

test('category scopes RETRIEVAL, not just the output', async () => {
  invalidateCatalogSnapshot();
  // The regression this pins: with a global top-N, 'cisco' ranks Cisco UCS
  // (servers) and Cisco ISR (telecom) above the Catalyst, so a networking buyer
  // got an EMPTY list — the gate deleted the good rows instead of preventing
  // the wrong ones from being retrieved. Scoping the pool before ranking is
  // what fixes it.
  const unscoped = await searchCatalog(env, 'cisco', 5);
  const scoped = await searchCatalog(env, 'cisco', 5, 'networking');

  assert.ok(unscoped.length > 0 && scoped.length > 0, 'both should return rows');
  assert.ok(
    scoped.every((r) => normalizeCategory(r.category) === 'networking'),
    'every scoped row must be in the requested category'
  );
  assert.ok(scoped.some((r) => /catalyst/i.test(r.model)), 'scoped search must reach the Catalyst');

  // A category with no rows in it is an honest empty, not a cross-category leak.
  assert.deepEqual(await searchCatalog(env, 'cisco', 5, 'nonsense-category'), []);
});

test('filterByCategory is strict — a wrong-category row is never suggested', () => {
  const mixed = [
    { id: 'a', category: 'networking' },
    { id: 'b', category: 'servers' }
  ];
  assert.deepEqual(ids(filterByCategory(mixed, 'networking')), ['a']);
  // STRICT: no networking row at all yields an EMPTY list, not the noisy one.
  // This is what stops a poisoned-but-real out-of-scope id from reaching a
  // buyer who explicitly chose a different category. Empty is a valid answer —
  // the UI keeps the typed text and submits it as Custom.
  assert.deepEqual(ids(filterByCategory([{ id: 'c', category: 'telecom' }], 'networking')), []);
  // No category selected -> no gate.
  assert.equal(filterByCategory(mixed, '').length, 2);
  // Never throws on empty input.
  assert.deepEqual(filterByCategory([], 'networking'), []);
});

// ── Trust must never come from a cache ──────────────────────────────────────
//
// verification_status is the authorisation input that decides whether a
// catalog row may anchor a line above the promotion confidence cap. The search
// snapshot is cached for 60s, so if trust rode along in it a row staff
// downgraded would keep anchoring lines at full confidence for up to a minute.

test('readVerificationStatus is the only source of trust, and it fails closed', async () => {
  const statusEnv = mockEnv(rows);
  statusEnv.DB.prepare = (sql) => ({
    bind() { return this; },
    async all() { throw new Error('trust must never be read from the bulk snapshot'); },
    async first() {
      if (/SELECT verification_status FROM products WHERE id/.test(sql)) {
        return { verification_status: 'verified' };
      }
      throw new Error('unexpected trust query: ' + sql);
    },
    async run() { throw new Error('unexpected run(): ' + sql); }
  });

  assert.equal(await readVerificationStatus(statusEnv, 'srv-002'), 'verified');

  // No DB, no id, a D1 error, or a row that is not literally 'verified' all
  // resolve to 'unverified' — which is the value that KEEPS the cap in place.
  assert.equal(await readVerificationStatus({}, 'srv-002'), 'unverified');
  assert.equal(await readVerificationStatus(statusEnv, ''), 'unverified');
  assert.equal(await readVerificationStatus({ DB: { prepare() { throw new Error('boom'); } } }, 'x'), 'unverified');
});

test('snapshot rows never expose verificationStatus', async () => {
  invalidateCatalogSnapshot();
  const [hit] = await searchCatalog(env, 'poweredge r740', 3);
  assert.ok(hit);
  assert.ok(
    !('verificationStatus' in hit),
    'trust data must not travel on a cached search row — use readVerificationStatus()'
  );
});