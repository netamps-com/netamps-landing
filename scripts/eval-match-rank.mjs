/**
 * Benchmark harness for BUY → SELL best-match candidate generation.
 *
 * Runs the DETERMINISTIC half of the pipeline (no network, no Workers AI, no
 * D1) against a labelled golden set and fails if quality regresses. The LLM
 * re-ranker can only ever re-order this stage's output, so blocking quality is
 * the ceiling on everything downstream — this is the metric worth gating on.
 *
 * Industry-standard metrics reported:
 *   Precision@k, Recall@k, MRR, NDCG@k  (IR / ranking)
 *   Abstention accuracy                 (record-linkage: correct empty state)
 *
 * Also unit-checks the grounding validator: a hallucinated shortlist index must
 * be dropped, never mapped to a real order.
 *
 * Usage:
 *   node scripts/eval-match-rank.mjs
 *   node scripts/eval-match-rank.mjs --json
 *
 * Exit code 0 = all gates pass, 1 = a gate failed.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildShortlist } from '../functions/api/matching/blocking.js';
import { validateRanking, computeConfidence } from '../functions/api/matching/ranker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, '..', 'tests', 'fixtures', 'match-golden.json');
const golden = JSON.parse(readFileSync(fixturePath, 'utf8'));
const K = Number.isInteger(golden.k) ? golden.k : 3;

const key = (c) => `${c.orderId}:${c.lineIdx}`;

function dcg(rels) {
  // rels: array of 0/1 in ranked order
  return rels.reduce((acc, r, i) => acc + r / Math.log2(i + 2), 0);
}

function evaluateCase(c) {
  const shortlist = buildShortlist(c.buy, c.sell, { limit: K });
  const relevant = new Set(c.relevant || []);
  const topK = shortlist.map((s) => key(s));

  const hits = topK.filter((k) => relevant.has(k)).length;

  // Precision over what we RETURNED, not over a fixed k.
  // Precision@k = hits/k is the textbook form, but it is misleading here: most
  // BUY lines have one or two viable candidates, so a correct 1-item shortlist
  // would score 1/3. Precision over returned items is the honest denominator;
  // abstention on a negative query is a correct "returned nothing" (precision 1).
  const precision = topK.length === 0 ? (relevant.size === 0 ? 1 : 0) : hits / topK.length;
  const recallAtK = relevant.size === 0 ? (topK.length === 0 ? 1 : 0) : hits / relevant.size;

  // MRR is only defined for queries that HAVE a relevant item — averaging zeros
  // for negative queries would punish correct abstention. We aggregate MRR over
  // positives only (hasRelevant).
  let mrr = 0;
  for (let i = 0; i < topK.length; i++) {
    if (relevant.has(topK[i])) { mrr = 1 / (i + 1); break; }
  }

  const relVector = topK.map((k) => (relevant.has(k) ? 1 : 0));
  const ideal = Array.from({ length: relevant.size }, () => 1);
  const idcg = dcg(ideal);
  const ndcg = idcg === 0 ? (topK.length === 0 ? 1 : 0) : dcg(relVector) / idcg;

  return {
    name: c.name, shortlist: topK, precision, recallAtK, mrr, ndcg,
    hasRelevant: relevant.size > 0, relevant: [...relevant],
  };
}

const results = golden.cases.map(evaluateCase);

// ── Grounding validator unit checks ──────────────────────────────────────────
const shortlistFixture = [
  { orderId: 'S-1', lineIdx: 0, category: 'servers', details: 'x', qty: 1, blockScore: 0.7, signals: { tokenOverlap: 0.5, modelSim: 0.8, sameCategory: true, sameCatalog: false } },
  { orderId: 'S-2', lineIdx: 0, category: 'servers', details: 'y', qty: 1, blockScore: 0.4, signals: { tokenOverlap: 0.2, modelSim: 0.5, sameCategory: true, sameCatalog: false } },
];
const vChecks = [];
{
  // valid index maps to a real order
  const r = validateRanking({ candidates: [{ index: 0, fit: 0.9, gaps: '', rationale: 'ok' }] }, shortlistFixture);
  vChecks.push(['valid index maps to real order', r.candidates.length === 1 && r.candidates[0].sellOrderId === 'S-1']);
  // hallucinated index is dropped
  const h = validateRanking({ candidates: [{ index: 99, fit: 1, gaps: '', rationale: 'evil' }] }, shortlistFixture);
  vChecks.push(['hallucinated index dropped', h.candidates.length === 0 && h.dropped.includes('OUT_OF_SHORTLIST')]);
  // duplicate index dropped
  const d = validateRanking({ candidates: [{ index: 1 }, { index: 1 }] }, shortlistFixture);
  vChecks.push(['duplicate index dropped', d.candidates.length === 1 && d.dropped.includes('DUPLICATE')]);
  // non-object payload rejected
  const n = validateRanking(null, shortlistFixture);
  vChecks.push(['null payload rejected', n.candidates.length === 0 && n.rejected === 'NOT_AN_OBJECT']);
  // confidence is computed, monotone in evidence
  const hi = computeConfidence({ blockScore: 0.7, signals: shortlistFixture[0].signals, llmRank: 0 });
  const lo = computeConfidence({ blockScore: 0.4, signals: shortlistFixture[1].signals, llmRank: 5 });
  vChecks.push(['confidence higher for stronger evidence', hi > lo && hi <= 0.97 && lo >= 0]);
}

// ── Gates ────────────────────────────────────────────────────────────────────
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const positives = results.filter((r) => r.hasRelevant);

// Precision over returned items across ALL cases (negatives score 1 by
// abstaining correctly, or 0 if they surface a spurious candidate).
const meanPrecision = avg(results.map((r) => r.precision));
// Recall / MRR are only meaningful on queries that have a relevant item.
const meanRecall = avg(positives.map((r) => r.recallAtK));
const meanMrr = avg(positives.map((r) => r.mrr));
const meanNdcg = avg(results.map((r) => r.ndcg));

const negatives = results.filter((r) => !r.hasRelevant);
const abstention = negatives.length
  ? negatives.filter((r) => r.shortlist.length === 0).length / negatives.length
  : 1;

const GATES = {
  'precision (returned) >= 0.90': meanPrecision >= 0.9,
  'recall@k >= 0.90': meanRecall >= 0.9,
  'MRR >= 0.95': meanMrr >= 0.95,
  'NDCG@k >= 0.90': meanNdcg >= 0.9,
  'negative abstention == 1.00': abstention === 1,
};

const json = process.argv.includes('--json');

if (json) {
  console.log(JSON.stringify({ K, results, metrics: { meanPrecision, meanRecall, meanMrr, meanNdcg, abstention }, validatorChecks: Object.fromEntries(vChecks), gates: GATES }, null, 2));
} else {
  console.log(`\nBUY→SELL best-match benchmark (deterministic blocking, k=${K})\n`);
  for (const r of results) {
    console.log(`• ${r.name}`);
    console.log(`    shortlist=[${r.shortlist.join(', ')}]  P=${r.precision.toFixed(2)} R@${K}=${r.recallAtK.toFixed(2)} MRR=${r.mrr.toFixed(2)} NDCG=${r.ndcg.toFixed(2)}`);
  }
  console.log('\nValidator checks:');
  for (const [name, ok] of vChecks) console.log(`    ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  console.log('\nAggregate metrics:');
  console.log(`    Precision (returned)  ${meanPrecision.toFixed(3)}`);
  console.log(`    Recall@${K}             ${meanRecall.toFixed(3)}`);
  console.log(`    MRR (positives)       ${meanMrr.toFixed(3)}`);
  console.log(`    NDCG@${K}              ${meanNdcg.toFixed(3)}`);
  console.log(`    Abstention            ${abstention.toFixed(3)}`);
  console.log('\nGates:');
  for (const [name, ok] of Object.entries(GATES)) console.log(`    ${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

const allValidatorOk = vChecks.every(([, ok]) => ok);
const allGatesOk = Object.values(GATES).every(Boolean);

if (allValidatorOk && allGatesOk) {
  console.log('\nMATCH_RANK_BENCH_PASS');
  process.exit(0);
} else {
  console.log('\nMATCH_RANK_BENCH_FAIL');
  process.exit(1);
}
