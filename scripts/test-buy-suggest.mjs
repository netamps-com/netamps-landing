/**
 * BUY suggestion harness — `node scripts/test-buy-suggest.mjs`
 *
 * Acceptance coverage:
 *  1. catalog-match matrix ("dell r7" surfaces the R740 family; gibberish → none)
 *  2. LLM-contract rejections (poisoned/hallucinated catalog ids are dropped
 *     server-side; unparseable output → explicit unmatched, never a silent accept)
 *  3. debounce/abort behavior of the shared suggest session (one request per
 *     burst, stale responses dropped, short queries never hit the network)
 *
 * Imports the exact modules the site ships (catalog.mjs, suggestClient.mjs),
 * so a green run means the deployed behavior matches this contract.
 */
import assert from 'node:assert/strict';
import {
  SEED_UNIQUE, matchCatalog, validateLLMResponse, foldText, scoreEntry, MIN_SCORE
} from '../functions/api/products/catalog.mjs';
import { createSuggestSession } from '../app/returns/suggestClient.mjs';

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.error(`FAIL  ${name}\n      ${err.message}`);
  }
}

const idsOf = (m) => m.map((e) => e.id);

// ── 1. Catalog-match matrix ────────────────────────────────────────────────

console.log('\n[1] catalog-match matrix');

await test('"dell r7" surfaces the R740 family', () => {
  const m = matchCatalog(SEED_UNIQUE, 'dell r7');
  assert.ok(m.length > 0, 'expected matches');
  const ids = idsOf(m);
  assert.ok(ids.includes('dell-poweredge-r740'), `R740 missing: ${ids}`);
  assert.ok(ids.includes('dell-poweredge-r740xd'), `R740xd missing: ${ids}`);
  // R6xx/R4xx must NOT match "dell r7" — no fabricated family expansion.
  assert.ok(!ids.includes('dell-poweredge-r640'), 'R640 must not match "dell r7"');
  assert.ok(!ids.includes('dell-poweredge-r440'), 'R440 must not match "dell r7"');
  assert.equal(m[0].id, 'dell-poweredge-r740', 'R740 must rank first');
});

await test('"dl380 gen10" resolves to HPE ProLiant DL380 Gen10', () => {
  const m = matchCatalog(SEED_UNIQUE, 'hpe dl380 gen10');
  assert.ok(idsOf(m).includes('hpe-proliant-dl380-gen10'), `got: ${idsOf(m)}`);
});

await test('"cisco catalyst 9300" resolves exactly', () => {
  const m = matchCatalog(SEED_UNIQUE, 'cisco catalyst 9300');
  assert.ok(idsOf(m).includes('cisco-catalyst-9300'), `got: ${idsOf(m)}`);
});

await test('compact form "dl380gen10" still matches (folded matching)', () => {
  const m = matchCatalog(SEED_UNIQUE, 'dl380gen10');
  assert.ok(idsOf(m).includes('hpe-proliant-dl380-gen10'), `got: ${idsOf(m)}`);
});

await test('typo "catalst 9300" matches via bounded edit distance', () => {
  const m = matchCatalog(SEED_UNIQUE, 'catalst 9300');
  assert.ok(idsOf(m).includes('cisco-catalyst-9300'), `got: ${idsOf(m)}`);
});

await test('gibberish yields zero matches (Custom path, never a fabrication)', () => {
  for (const q of ['xkqzv 9931', 'zzzz qqqq', 'asdfghjkl']) {
    assert.deepEqual(matchCatalog(SEED_UNIQUE, q), [], `unexpected match for ${q}`);
  }
});

await test('single character below the min-length gate yields zero matches', () => {
  assert.deepEqual(matchCatalog(SEED_UNIQUE, 'd'), []);
  assert.deepEqual(matchCatalog(SEED_UNIQUE, ''), []);
});

await test('every seed entry is indexed and structurally sound', () => {
  assert.ok(SEED_UNIQUE.length >= 50, `expected >=50 seed entries, got ${SEED_UNIQUE.length}`);
  for (const e of SEED_UNIQUE) {
    assert.equal(typeof e.id, 'string');
    assert.ok(e.category, `missing category: ${e.id}`);
    assert.ok(e.model, `missing model: ${e.id}`);
    assert.ok(e.spec && e.spec.length > 10, `missing spec template: ${e.id}`);
    assert.ok(foldText(e.id).length >= 2, `unindexable id: ${e.id}`);
  }
});

await test('scores are bounded and below-threshold results are excluded', () => {
  const s = scoreEntry(SEED_UNIQUE[0], 'dell', ['dell'], 'dell');
  assert.ok(s >= MIN_SCORE && s <= 100, `score out of range: ${s}`);
  assert.ok(scoreEntry(SEED_UNICODE_guard(), '', [], '') === 0, 'empty query must score 0');
});

function SEED_UNICODE_guard() {
  // Non-ASCII folding must not crash matching (diacritics stripped).
  const entry = { id: 'test-café', category: 'mixed', brand: 'Test', model: 'Café', aliases: ['café'], spec: 'x' };
  return entry;
}

// ── 2. LLM-contract rejections ─────────────────────────────────────────────

console.log('\n[2] LLM-contract rejections (poisoned-model tests)');

const validLLM = JSON.stringify({ candidates: ['dell-poweredge-r740', 'hpe-proliant-dl380-gen10'], unmatched: false });

await test('valid contract passes with both ids kept', () => {
  const v = validateLLMResponse(validLLM, SEED_UNIQUE);
  assert.deepEqual(v.candidates, ['dell-poweredge-r740', 'hpe-proliant-dl380-gen10']);
  assert.equal(v.unmatched, false);
  assert.deepEqual(v.dropped, []);
});

await test('poisoned candidate absent from the catalog is dropped server-side', () => {
  const poisoned = JSON.stringify({ candidates: ['dell-poweredge-r999', 'made-up-model-x1'], unmatched: false });
  const v = validateLLMResponse(poisoned, SEED_UNIQUE);
  assert.deepEqual(v.candidates, [], 'hallucinated ids must never survive');
  assert.equal(v.unmatched, true, 'all-dropped must resolve to unmatched (Custom path)');
  assert.deepEqual(v.dropped, ['dell-poweredge-r999', 'made-up-model-x1']);
});

await test('mixed valid + poisoned keeps only catalog ids', () => {
  const mixed = JSON.stringify({ candidates: ['dell-poweredge-r740', 'nvidia-phantom-9000'], unmatched: false });
  const v = validateLLMResponse(mixed, SEED_UNIQUE);
  assert.deepEqual(v.candidates, ['dell-poweredge-r740']);
  assert.deepEqual(v.dropped, ['nvidia-phantom-9000']);
});

await test('prose-wrapped and fenced JSON are tolerated, not trusted blindly', () => {
  const fenced = '```json\n' + validLLM + '\n```';
  const v1 = validateLLMResponse(fenced, SEED_UNIQUE);
  assert.equal(v1.candidates.length, 2);
  const prose = 'Sure! Here are the matches: ' + validLLM + ' Let me know.';
  const v2 = validateLLMResponse(prose, SEED_UNIQUE);
  assert.equal(v2.candidates.length, 2);
});

await test('unparseable output → unmatched, never a silent accept', () => {
  for (const bad of ['', '   ', 'I could not find anything matching that.', '{candidates: broken', null, undefined, 42]) {
    const v = validateLLMResponse(bad, SEED_UNIQUE);
    assert.deepEqual(v.candidates, [], `bad input accepted: ${JSON.stringify(bad)}`);
    assert.equal(v.unmatched, true);
  }
});

await test('wrong shape (missing candidates) is rejected', () => {
  for (const bad of ['{"unmatched":false}', '{"candidates":"dell-poweredge-r740"}', '{"results":["dell-poweredge-r740"]}']) {
    const v = validateLLMResponse(bad, SEED_UNIQUE);
    assert.equal(v.unmatched, true, `shape accepted: ${bad}`);
    assert.deepEqual(v.candidates, []);
  }
});

await test('duplicate and case-mangled ids are normalized and deduped', () => {
  const dup = JSON.stringify({ candidates: ['Dell-PowerEdge-R740', ' dell-poweredge-r740 ', 'dell-poweredge-r640'], unmatched: false });
  const v = validateLLMResponse(dup, SEED_UNIQUE);
  assert.deepEqual(v.candidates, ['dell-poweredge-r740', 'dell-poweredge-r640']);
});

await test('candidate list is capped (prompt-stuffing defense)', () => {
  const many = JSON.stringify({ candidates: Array.from({ length: 40 }, (_, i) => SEED_UNIQUE[i % SEED_UNIQUE.length].id), unmatched: false });
  const v = validateLLMResponse(many, SEED_UNIQUE);
  assert.ok(v.candidates.length <= 12, `cap exceeded: ${v.candidates.length}`);
});

// ── 3. debounce / abort behavior ───────────────────────────────────────────

console.log('\n[3] debounce + abort (suggestClient session)');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await test('a keystroke burst issues exactly one request (debounce)', async () => {
  const calls = [];
  const session = createSuggestSession({
    debounceMs: 30,
    fetchImpl: async (url) => { calls.push(url); return { json: async () => ({ suggestions: [] }) }; }
  });
  for (const q of ['d', 'de', 'del', 'dell', 'dell r', 'dell r7']) session.request(q, {});
  await sleep(90);
  assert.equal(calls.length, 1, `expected 1 request, got ${calls.length}`);
  assert.ok(calls[0].includes(encodeURIComponent('dell r7')), `last query not used: ${calls[0]}`);
  session.cancel();
});

await test('queries under min length never hit the network', async () => {
  let fetched = 0;
  const session = createSuggestSession({
    debounceMs: 10,
    minLength: 2,
    fetchImpl: async () => { fetched++; return { json: async () => ({ suggestions: [] }) }; }
  });
  let tooShort = null;
  session.request('d', { onTooShort: (q) => { tooShort = q; } });
  session.request('', { onTooShort: (q) => { tooShort = q; } });
  await sleep(50);
  assert.equal(fetched, 0, 'short query hit the network');
  assert.equal(tooShort, '', 'onTooShort should fire for the cleared query');
  session.cancel();
});

await test('a superseding request aborts the previous in-flight call', async () => {
  const signals = [];
  const session = createSuggestSession({
    debounceMs: 5,
    fetchImpl: (url, opts) => new Promise((resolve, reject) => {
      signals.push(opts && opts.signal);
      if (signals.length === 1) {
        opts.signal.addEventListener('abort', () => {
          const err = new Error('aborted'); err.name = 'AbortError'; reject(err);
        });
      } else {
        resolve({ json: async () => ({ suggestions: [{ id: 'x' }] }) });
      }
    })
  });
  const responses = [];
  session.request('aaa', { onResponse: (b) => responses.push(b) });
  await sleep(30); // let first fire
  session.request('bbb', { onResponse: (b) => responses.push(b) });
  await sleep(60);
  assert.equal(signals.length, 2, `expected 2 fetches, got ${signals.length}`);
  assert.equal(signals[0].aborted, true, 'previous in-flight request was not aborted');
  assert.equal(responses.length, 1, 'stale response must not be delivered');
});

await test('cancel() flushes pending debounce and in-flight work', async () => {
  let fetched = 0;
  const session = createSuggestSession({
    debounceMs: 20,
    fetchImpl: async () => { fetched++; return { json: async () => ({}) }; }
  });
  session.request('dell r7', {});
  session.cancel();
  await sleep(60);
  assert.equal(fetched, 0, 'cancelled request still fired');
});

await test('URL shape matches the deployed endpoint', async () => {
  const seen = [];
  const session = createSuggestSession({
    apiUrl: 'https://netamps.com',
    debounceMs: 5,
    fetchImpl: async (url) => { seen.push(url); return { json: async () => ({}) }; }
  });
  session.request('dell r7', {});
  await sleep(40);
  assert.equal(seen[0], 'https://netamps.com/api/products/suggest?q=dell%20r7');
  session.cancel();
});

// ── summary ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
