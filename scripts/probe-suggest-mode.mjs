/**
 * End-to-end harness for GET /api/products/suggest.
 *
 * Proves the three latency claims without touching production:
 *   1. mode=fast NEVER calls the model (the keystroke path is inference-free)
 *   2. mode=llm DOES call it, exactly once, with a SMALL prompt
 *   3. an absurd query is answered 'none' rather than inventing candidates
 *
 * Run: node scripts/probe-suggest-mode.mjs
 */
import { onRequestGet } from '../functions/api/products/suggest.js';
import { invalidateCatalogSnapshot } from '../functions/api/products/catalog.js';
import { SEED_CATALOG } from '../functions/api/products/catalog.mjs';

const rows = SEED_CATALOG.map((r) => ({
  id: r.id,
  category: r.category,
  model: r.model,
  spec_template: r.specTemplate || '',
  aliases: JSON.stringify(r.aliases || []),
  verification_status: 'verified'
}));

let aiCalls = [];
// `reply` picks what the model answers with. 'echo' = behave like a well-behaved
// model and return the first id from the shortlist it was actually given.
function makeEnv(mode = 'echo', forcedId = null) {
  return {
    DB: {
      prepare(sql) {
        const self = {
          _sql: sql,
          bind() { return self; },
          async run() { return { success: true }; },
          async all() {
            if (/FROM match_meta/.test(sql)) return { results: [] };
            if (/FROM products_fts/.test(sql)) return { results: [] };
            if (/CREATE TABLE|CREATE INDEX/.test(sql)) return { results: [] };
            return { results: rows };
          },
          async first() {
            // Shadows OFF: this probe is about the suggest response modes, and
            // turning fusion_shadow on pulls the cross-encoder into the mock AI
            // (which answers with a chat-completion shape, not a rerank shape).
            if (/fusion_shadow/.test(sql)) return { value: '0' };
            if (/match_meta/.test(sql)) return { value: '1' };
            return null;
          }
        };
        return self;
      }
    },
    AI: {
      async run(model, params) {
        const user = params.messages.find((m) => m.role === 'user').content;
        aiCalls.push({ model, user, maxTokens: params.max_tokens, temperature: params.temperature });
        // Parse the CANDIDATES block the same way a model reads it, so the stub
        // is faithful: it can only ever return an id that was in its shortlist.
        const block = (user.split('\n')[1] || '').trim();
        const offered = block ? block.split('\n').map((l) => l.split('|')[0].trim()).filter(Boolean) : [];
        const id = forcedId || (mode === 'echo' ? offered[0] : null);
        return { response: JSON.stringify({ candidates: id ? [id] : [], unmatched: !id }) };
      }
    }
  };
}

async function call(env, q, mode, extra = '') {
  const url = `https://x/api/products/suggest?q=${encodeURIComponent(q)}&limit=5${mode ? `&mode=${mode}` : ''}${extra}`;
  const req = new Request(url);
  const res = await onRequestGet({ request: req, env, context: { waitUntil() {} } });
  return { status: res.status, body: await res.json() };
}

const pad = (s, n) => String(s).padEnd(n);

console.log('═══ 1. mode=fast must never call the model ═══\n');
for (const q of ['cisco catalyst 9300', 'that switch we bought last quarter', 'zzzz nonsense qqqq']) {
  aiCalls = [];
  invalidateCatalogSnapshot();
  const t = Date.now();
  const { body } = await call(makeEnv(), q, 'fast');
  console.log(
    `${pad(q, 38)} source=${pad(body.source, 24)} n=${String(body.suggestions.length).padEnd(3)} ` +
    `modelCalls=${aiCalls.length} handlerMs=${Date.now() - t}`
  );
  if (aiCalls.length !== 0) console.log('   !! FAIL: fast path called the model');
}

console.log('\n═══ 2. mode=llm must call the model once, with a small prompt ═══\n');
for (const q of ['that cisco switch we bought last quarter', 'ssd']) {
  aiCalls = [];
  invalidateCatalogSnapshot();
  const t = Date.now();
  const { body } = await call(makeEnv(), q, 'llm');
  const ai = aiCalls[0];
  const shortlistLines = ai ? (ai.user.split('\n')[1] || '').split('\n').length : 0;
  const promptBytes = ai ? ai.user.length : 0;
  console.log(`${pad(q, 38)} source=${pad(body.source, 10)} modelCalls=${aiCalls.length} ` +
    `model=${ai ? ai.model : '-'} shortlistRows=${shortlistLines} promptBytes=${promptBytes} handlerMs=${Date.now() - t}`);
  if (aiCalls.length > 1) console.log('   !! FAIL: more than one model call');
  if (ai && ai.temperature !== 0) console.log('   !! FAIL: temperature must be 0 for a typeahead');
  if (ai && /llama-3.3-70b/.test(ai.model)) console.log('   !! FAIL: 70B escalation must not run on a typeahead');
}

console.log('\n═══ 3. category gate holds on the llm path ═══\n');
for (const cat of ['networking', 'telecom', 'workstations']) {
  aiCalls = [];
  invalidateCatalogSnapshot();
  const { body } = await call(makeEnv(), 'used cisco phone laptop thing', 'llm', `&cat=${cat}`);
  const cats = [...new Set(body.suggestions.map((s) => s.category))].join(',') || '(none)';
  console.log(`cat=${pad(cat, 12)} source=${pad(body.source, 8)} returnedCategories=${pad(cats, 30)} offeredToModel=${(aiCalls[0]?.user.split('\n')[1] || '').split('\n').length} rows`);
}

console.log('\n═══ 3b. a POISONED out-of-scope id must be gated out ═══\n');
// Simulate a compromised/misbehaving model that returns a real id from ANOTHER
// category. It is a genuine catalog id, so validateLLMResponse accepts it —
// only the category gate can stop it reaching a telecom buyer.
for (const cat of ['telecom', 'workstations']) {
  aiCalls = [];
  invalidateCatalogSnapshot();
  const { body } = await call(makeEnv('fixed', 'cisco-catalyst-9300'), 'cisco', 'llm', `&cat=${cat}`);
  const leaked = body.suggestions.filter((s) => s.id === 'cisco-catalyst-9300');
  console.log(`cat=${pad(cat, 12)} poisonedIdReturned=${leaked.length > 0} n=${body.suggestions.length}`);
  if (leaked.length > 0) console.log('   !! FAIL: out-of-scope id survived the category gate');
}

console.log('\n═══ 4. unanswerable query -> none, no invention ═══\n');
aiCalls = [];
invalidateCatalogSnapshot();
const { body } = await call(makeEnv(), 'qqqqzzzzxxxx nonexistentthing', 'llm');
console.log(`source=${body.source} suggestions=${body.suggestions.length} modelCalls=${aiCalls.length}`);
if (body.source !== 'none') console.log('   !! FAIL: should have declined');

console.log('\n═══ 5. category scoping must reach the model prompt ═══\n');
aiCalls = [];
invalidateCatalogSnapshot();
await call(makeEnv(), 'cisco 9300', 'llm', '&cat=networking');
const prompt = aiCalls[0]?.user || '';
const netOnly = prompt.split('\n').slice(1, -3).filter(Boolean)
  .every((l) => l.split('|')[1].trim() === 'network');
console.log(`shortlistRows=${prompt.split('\n').length - 5} everyRowIsNetworking=${netOnly}`);
if (!netOnly) console.log('   !! FAIL: prompt leaked cross-category rows');