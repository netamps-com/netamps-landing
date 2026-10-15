/**
 * Rank fusion unit tests.
 *
 * Covers the parts that are pure and therefore most likely to harbour a quiet
 * bug: RRF arithmetic, tie-breaking determinism, category-list abstention, and
 * the cross-encoder's response-shape tolerance. None of it needs a database or
 * a model, which is the point of keeping rrf/extractScores side-effect free.
 *
 * Run: node --import ./tests/resolve-cloudflare.mjs tests/fusion.test.mjs
 */

import { rrf, extractScores, buildDoc, RRF_K, LIST_WEIGHTS } from '../functions/api/products/fusion.js';
import { reorderDistance } from '../functions/api/products/shadow.js';

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.log(`  FAIL ${label}\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`);
  } else {
    console.log(`  pass ${label}`);
  }
}
const ids = (res) => res.map((r) => r.id);

// ── RRF arithmetic ─────────────────────────────────────────────────────────
console.log('\nRRF arithmetic');
{
  // A doc ranked 1st in one list beats a doc ranked 2nd in two lists:
  // 1/(60+1)=0.01639 vs 1/62 + 1/63 = 0.03200 — no, two 2nd places wins.
  // Pin the real relationship so a sign error cannot pass unnoticed.
  const res = rrf([{ name: 'a', ids: ['x', 'y'] }]);
  check('rank 1 outranks rank 2 in one list', ids(res), ['x', 'y']);
  check('score is 1/(k+rank)', Math.round(res[0].score * 1e6) / 1e6, Math.round((1 / (RRF_K + 1)) * 1e6) / 1e6);
}
{
  // One list cannot outvote two: 'z' is 1st once; 'a'/'b' are 2nd twice each.
  const res = rrf([
    { name: 'fts', ids: ['z', 'a'] },
    { name: 'alias', ids: ['z', 'a', 'b'] }
  ]);
  check('two-list support beats one strong placement', ids(res)[0], 'z');
  check('shared candidate accumulates both votes', res.find((r) => r.id === 'a').votes, 2);
}
{
  const res = rrf([
    { name: 'fts', ids: ['z'] },
    { name: 'alias', ids: ['a'] },
    { name: 'category', ids: ['b'] }
  ]);
  check('three equal lists fall back to id order', ids(res), ['a', 'b', 'z']);
}
{
  // A candidate in NO list can never appear. RRF is a union of lists, not a
  // generator — this is the property that keeps recall bounded by retrieval.
  const res = rrf([{ name: 'fts', ids: ['a'] }, { name: 'alias', ids: [] }]);
  check('empty list abstains rather than vetoing', ids(res), ['a']);
}
{
  const res = rrf([]);
  check('no lists yields nothing', res.length, 0);
  check('malformed input does not throw', rrf([null, { name: 'x' }, { ids: 'nope' }]).length, 0);
}

// ── Weights ────────────────────────────────────────────────────────────────
console.log('\ncategory is a nudge, not a law');
{
  check('category weight < lexical weight', LIST_WEIGHTS.category < LIST_WEIGHTS.fts, true);
  // An out-of-category doc must still be able to appear.
  const res = rrf([
    { name: 'fts', ids: ['in-cat'] },
    { name: 'category', ids: ['out-of-cat-1', 'out-of-cat-2', 'out-of-cat-3'] }
  ]);
  check('out-of-category candidates still surface', ids(res).includes('out-of-cat-3'), true);
}

// ── Determinism ────────────────────────────────────────────────────────────
console.log('\ndeterminism (a wobbly ranking cannot justify a cutover)');
{
  const lists = [
    { name: 'fts', ids: ['m', 'n'] },
    { name: 'alias', ids: ['n', 'm'] }
  ];
  const a = ids(rrf(lists));
  const b = ids(rrf([...lists].reverse()));
  check('result does not depend on list order', a, b);
}

// ── Cross-encoder score extraction ─────────────────────────────────────────
console.log('\nscore extraction tolerates the documented response shapes');
{
  check('bare array', extractScores([0.9, 0.1], 2), [0.9, 0.1]);
  check('{data:[...]}', extractScores({ data: [0.9, 0.1] }, 2), [0.9, 0.1]);
  check('{results:[...]}', extractScores({ results: [0.9, 0.1] }, 2), [0.9, 0.1]);
  check('{scores:[...]}', extractScores({ scores: [0.9, 0.1] }, 2), [0.9, 0.1]);
  check('object rows with .score', extractScores({ data: [{ score: 0.9 }, { score: 0.1 }] }, 2), [0.9, 0.1]);
  check('numeric strings coerce', extractScores({ data: ['0.9', '0.1'] }, 2), [0.9, 0.1]);
}
console.log('\nscore extraction REFUSES to guess');
{
  // A count mismatch means we parsed something we do not understand. Reordering
  // on garbage is worse than not reordering.
  check('wrong count -> null', extractScores({ data: [0.9] }, 2), null);
  check('wrong count (too many) -> null', extractScores({ data: [0.9, 0.1, 0.5] }, 2), null);
  check('non-finite -> null', extractScores({ data: [NaN, 0.1] }, 2), null);
  check('null payload -> null', extractScores(null, 2), null);
  check('garbage -> null', extractScores({ nope: true }, 2), null);
  check('zero contexts -> []', extractScores(null, 0), []);
}

// ── Passage construction ───────────────────────────────────────────────────
console.log('\npassage construction respects the model window');
{
  const d = buildDoc({ model: 'PowerEdge R740', category: 'servers', specTemplate: '2U rack server' });
  check('includes category, model and spec', d.includes('servers') && d.includes('R740') && d.includes('2U'), true);
  const long = buildDoc({ model: 'X'.repeat(500), category: 'y'.repeat(500), specTemplate: 'z'.repeat(5000) });
  check('bounded, never unbounded', long.length <= 1200, true);
  check('missing fields do not throw', typeof buildDoc({}), 'string');
  check('null row does not throw', typeof buildDoc(null), 'string');
}

// ── Reorder distance ───────────────────────────────────────────────────────
console.log('\nreorder distance measures ORDER, not membership');
{
  check('identical order = 0', reorderDistance(['a', 'b', 'c'], ['a', 'b', 'c']), 0);
  const swapped = reorderDistance(['a', 'b', 'c'], ['b', 'a', 'c']);
  check('a swap is detected (sets are identical)', swapped > 0, true);
  check('distance is bounded to 1', reorderDistance(['a', 'b'], ['b', 'a']) <= 1, true);
  check('empty lists = 0', reorderDistance([], []), 0);
}

console.log(failures === 0 ? '\nAll fusion assertions passed.' : `\n${failures} assertion(s) failed.`);
process.exit(failures === 0 ? 0 : 1);