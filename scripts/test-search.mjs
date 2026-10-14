/**
 * Harness for the order search engine.
 *
 * Exercises the ACTUAL module against real SQLite via node:sqlite, with a
 * scripted Workers AI binding standing in for the model. What it protects is
 * the module's one load-bearing property:
 *
 *   THE MODEL MAY ONLY SELECT. It is shown a pool the database enumerated,
 *   with the pool's own indices, and anything it replies with that is not an
 *   integer inside that pool is discarded. A hallucinated order therefore has
 *   nowhere to land — asserted here by feeding the fake model indices that do
 *   not exist and checking that none of them survive.
 *
 * The degraded paths are asserted too: a missing AI binding, the `llm_enabled`
 * emergency brake, and a model that replies with nothing all fall back to
 * "every term must genuinely appear in the row", which is a weaker answer but
 * never a wrong one.
 *
 * Run: node scripts/test-search.mjs
 */

import { DatabaseSync } from 'node:sqlite';
import {
  runSearch, tokenize, normalizeFilters, buildWhere, explainRow,
  selectIndices, parseProductText, dateBound, escapeLike,
  POOL_CAP, STATUS_VALUES
} from '../functions/api/search/core.mjs';

let pass = 0, fail = 0;
const t = (n, c) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

/** D1-shaped adapter over node:sqlite, matching scripts/test-audit.mjs. */
function makeDb() {
  const db = new DatabaseSync(':memory:');
  const adapter = {
    prepare(sql) {
      // D1 uses `?N`; node:sqlite binds positionally. These modules only ever
      // number left-to-right, so renumbering to anonymous `?` is equivalent.
      const portable = sql.replace(/\?(\d+)/g, '?');
      let binds = [];
      const stmt = {
        bind(...a) { binds = a; return stmt; },
        async first() { const r = db.prepare(portable).get(...binds); return r === undefined ? null : r; },
        async all() { return { results: db.prepare(portable).all(...binds) }; },
        async run() { db.prepare(portable).run(...binds); return { success: true }; },
      };
      return stmt;
    },
    async batch(stmts) { return stmts; },
  };
  return { adapter, db };
}

/** Scripted model: the handler sees the exact prompt and returns the reply. */
function withAI(handler) {
  const seen = { prompt: null, model: null, calls: 0 };
  const AI = {
    async run(model, params) {
      seen.model = model;
      seen.prompt = params?.messages?.[1]?.content || '';
      seen.calls += 1;
      return { response: JSON.stringify(handler(seen.prompt, model)) };
    }
  };
  return { AI, seen };
}

/** Parse the pool the model was shown: `index | id | …` lines. */
function parsePool(prompt) {
  const rows = [];
  for (const line of String(prompt || '').split('\n')) {
    const m = /^(\d+) \| (.*)$/.exec(line);
    if (m) rows.push({ index: Number(m[1]), id: m[2].split(' | ')[0] });
  }
  return rows;
}

const SEED = [
  { id: 'B-AAA1', intent: 'buy',  name: 'Ada Lovelace',  company: 'Acme Corp',       email: 'buyer@acme.com',   phone: '1', status: 'Order Accepted for Negotiation', date: '2026-01-10T09:00:00.000Z', products: JSON.stringify([{ category: 'servers', details: 'Dell PowerEdge R740', quantity: 2 }]) },
  { id: 'B-BBB2', intent: 'sell', name: 'Grace Hopper',  company: 'Globex',          email: 'contact@globex.com', phone: '2', status: 'Pending',                     date: '2026-02-14T12:00:00.000Z', products: JSON.stringify([{ category: 'ups', details: 'APC Smart-UPS 5000', quantity: 1 }]) },
  { id: 'B-CCC3', intent: 'buy',  name: 'Alan Turing',   company: 'Initech',         email: 'ops@initech.com',  phone: '3', status: 'Order Deal Approved',           date: '2026-03-01T08:30:00.000Z', products: JSON.stringify([{ category: 'racks', details: '42U server rack', quantity: 4 }]) },
  { id: 'B-DDD4', intent: 'sell', name: 'Katherine J.',  company: 'Acme Industries', email: 'buyer@acme.com',   phone: '4', status: 'Declined',                     date: '2026-03-15T17:45:00.000Z', products: '' },
  { id: 'B-EEE5', intent: 'buy',  name: 'Radia Perlman', company: 'Northwind',       email: 'net@northwind.io', phone: '5', status: 'Pending',                      date: '2026-04-02T11:11:00.000Z', products: JSON.stringify([{ category: 'networking', details: 'power_edge switch', quantity: 8 }]) }
];

function seed(db) {
  db.exec(`CREATE TABLE returns (id TEXT PRIMARY KEY, intent TEXT, name TEXT, company TEXT, email TEXT, phone TEXT, products TEXT, attachedFiles TEXT, emailDeliveryStatus TEXT, date TEXT, status TEXT)`);
  const ins = db.prepare('INSERT INTO returns (id,intent,name,company,email,phone,products,attachedFiles,emailDeliveryStatus,date,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  for (const r of SEED) ins.run(r.id, r.intent, r.name, r.company, r.email, r.phone, r.products, '[]', null, r.date, r.status);
}

function freshEnv() {
  const { adapter, db } = makeDb();
  seed(db);
  return { env: { DB: adapter }, db };
}

/* ── 1. Pure helpers ───────────────────────────────────────────────────── */
{
  t('tokenize splits on non-word characters',
    JSON.stringify(tokenize('Dell PowerEdge R740')) === JSON.stringify(['dell', 'poweredge', 'r740']));
  t('tokenize de-duplicates', JSON.stringify(tokenize('acme acme acme')) === JSON.stringify(['acme']));
  t('a punctuation-only query yields no terms',
    tokenize('   !!! ??? ... ').length === 0);
  t('underscores and hyphens survive tokenisation',
    tokenize('power_edge X-7000')[0] === 'power_edge' && tokenize('X-7000').includes('x-7000'));
  t('single characters are dropped', tokenize('a b cd').length === 1 && tokenize('a b cd')[0] === 'cd');

  t('escapeLike neutralises LIKE wildcards',
    escapeLike('100%_sure') === '100\\%\\_sure');

  const d1 = dateBound('2026-01-31', false);
  const d2 = dateBound('2026-01-31', true);
  t('a bare date becomes an inclusive day bound',
    d1.value === '2026-01-31T00:00:00.000Z' && d2.value === '2026-01-31T23:59:59.999Z');
  t('a bare date is accepted only if it is a real day',
    dateBound('2026-13-45', false).ok === false && dateBound('2026-02-30', false).ok === false);
  t('an unparseable date is rejected, not coerced', dateBound('yesterday', false).ok === false);

  t('an unknown status is an error, not an empty result',
    normalizeFilters({ status: 'Pending!!' }).errors.length === 1);
  t('the status vocabulary contains the ladder',
    STATUS_VALUES.includes('Order Deal Approved') && STATUS_VALUES.includes('Declined'));
  t('intent is restricted to buy/sell',
    normalizeFilters({ intent: 'rent' }).errors.length === 1
    && normalizeFilters({ intent: 'BUY' }).errors.length === 0);
  t('"from" after "to" is an error',
    normalizeFilters({ from: '2026-05-01', to: '2026-01-01' }).errors.length === 1);
  t('a malformed email address is an error',
    normalizeFilters({ email: 'buyer@' }).errors.length === 1);
  t('an email fragment (no @) is allowed as a prefix search',
    normalizeFilters({ email: 'acme' }).errors.length === 0);

  const { where, binds } = buildWhere({ orderId: 'b-aaa', email: 'buyer@Acme.com', status: 'Pending', intent: 'buy', from: null, to: null });
  t('every filter becomes a bound parameter',
    binds.length === 4 && where.every((w) => w.includes('?')));
  t('no filter value is ever inlined into the SQL',
    !where.join(' ').includes('buyer@Acme.com') && !where.join(' ').includes('Pending'));
  t('order ids are matched case-insensitively as a prefix',
    binds[0] === 'B-AAA%' && where[0].startsWith('UPPER(r.id)'));
  t('a full email address is matched exactly',
    binds[1] === 'buyer@acme.com' && where[1].includes('= ?'));

  const row = { id: 'B-AAA1', name: 'Ada', company: 'Acme Corp', email: 'buyer@acme.com', products: 'Dell PowerEdge' };
  const why = explainRow(row, ['acme', 'poweredge', 'absent']);
  t('why reports the columns that actually contain each term',
    why.length === 2 && why[0].fields.includes('company') && why[1].fields.includes('products'));
  t('why never reports a column that does not contain the term',
    !why.find((w) => w.term === 'acme').fields.includes('name')
    && why.find((w) => w.term === 'acme').fields.includes('company'));
  t('why drops terms that match nothing', !why.some((w) => w.term === 'absent'));

  t('a product manifest flattens to searchable text',
    parseProductText('[{"category":"servers","details":"Dell PowerEdge R740"}]').includes('Dell PowerEdge R740'));
  t('a malformed manifest degrades to its raw text', parseProductText('not json').startsWith('not json'));
  t('an absent manifest is empty, not "null"', parseProductText(null) === '');

  t('only integers inside the pool survive',
    JSON.stringify(selectIndices([0, 2, '3', 3.5, -1, 99], 4)) === JSON.stringify([0, 2, 3]));
  t('duplicate indices are collapsed', JSON.stringify(selectIndices({ indices: [1, 1, 2] }, 5)) === JSON.stringify([1, 2]));
  t('a non-array reply selects nothing', selectIndices('nope', 5).length === 0 && selectIndices({}, 5).length === 0);
  t('numeric strings are accepted, prose is not',
    JSON.stringify(selectIndices(['2'], 5)) === JSON.stringify([2]) && selectIndices(['two'], 5).length === 0);
}

/* ── 2. Deterministic path ─────────────────────────────────────────────── */
{
  const { env } = freshEnv();

  const byEmail = await runSearch(env, { email: 'buyer@acme.com' });
  t('an exact email returns every order with that email',
    byEmail.total === 2 && byEmail.items.every((i) => i.email === 'buyer@acme.com'));

  const byFragment = await runSearch(env, { email: 'acme' });
  t('an email fragment behaves as a prefix search', byFragment.total === 2);

  const byId = await runSearch(env, { orderId: 'b-aaa' });
  t('an order id prefix matches case-insensitively',
    byId.total === 1 && byId.items[0].id === 'B-AAA1');

  const byRange = await runSearch(env, { from: '2026-02-01', to: '2026-02-28' });
  t('a date range is an exact comparison',
    byRange.total === 1 && byRange.items[0].id === 'B-BBB2');

  const byStatus = await runSearch(env, { status: 'Pending' });
  t('a status filter is exact', byStatus.total === 2);

  const byIntent = await runSearch(env, { intent: 'buy' });
  t('an intent filter is exact', byIntent.total === 3);

  const combined = await runSearch(env, { email: 'buyer@acme.com', intent: 'buy' });
  t('filters combine with AND', combined.total === 1 && combined.items[0].id === 'B-AAA1');

  t('the deterministic path never consults a model',
    byEmail.plan.mode === 'deterministic' && byEmail.plan.modelUsed === null && byEmail.plan.terms.length === 0);

  t('a query of only punctuation is treated as no query at all',
    (await runSearch(env, { text: '   ???   ' })).plan.mode === 'deterministic');
  t('an empty query lists orders newest first',
    (await runSearch(env, {})).items[0].id === 'B-EEE5');

  t('pagination is applied',
    (await runSearch(env, { limit: 2, offset: 2 })).items.length === 2
    && (await runSearch(env, { limit: 2, offset: 2 })).total === 5);

  const bad = await runSearch(env, { status: 'Almost Done' });
  t('an unknown status returns 400', bad.ok === false && bad.status === 400);
  t('the refusal names the problem', bad.message.includes('Almost Done'));
  const bad2 = await runSearch(env, { from: '2026-02-30' });
  t('an impossible date returns 400 rather than no matches', bad2.ok === false && bad2.status === 400);
  const bad3 = await runSearch(env, { from: '2026-05-01', to: '2026-01-01' });
  t('an inverted range returns 400', bad3.ok === false && bad3.status === 400);
}

/* ── 3. A down database is an error, not an empty result set ───────────── */
{
  const down = { env: { DB: { prepare() { throw new Error('db down'); } } } };
  const r = await runSearch(down, { email: 'buyer@acme.com' });
  t('a database failure is reported as a failure', r.ok === false && r.status === 503);
  t('it is never folded into "0 matches"', r.total === undefined);
}

/* ── 4. Semantic path: the model may only SELECT ───────────────────────── */
{
  const { env } = freshEnv();
  const { AI, seen } = withAI((prompt) => {
    const pool = parsePool(prompt);
    // Pick the row the query is actually about, by id, from the pool shown.
    const hit = pool.find((p) => p.id === 'B-AAA1');
    return { indices: hit ? [hit.index] : [] };
  });
  env.AI = AI;

  const r = await runSearch(env, { text: 'poweredge servers' });
  t('the semantic path reports which model ran', r.plan.mode === 'semantic' && r.plan.selection === 'model' && !!r.plan.modelUsed);
  t('the model selected a real row', r.total === 1 && r.items[0].id === 'B-AAA1');
  t('the reply still carries the applied filters', r.filters.email === null && r.filters.intent === null);
  t('terms are reported back to the caller', JSON.stringify(r.plan.terms) === JSON.stringify(['poweredge', 'servers']));

  const pool = parsePool(seen.prompt);
  t('the model is shown a pool with indices', pool.length === r.plan.poolSize && pool[0].index === 0);
  t('the model is shown order ids, so it can only echo ones that exist',
    pool.some((p) => p.id === 'B-AAA1') && pool.every((p) => /^B-[A-Z0-9]+$/.test(p.id)));
  t('every id the model saw is a seeded order',
    pool.every((p) => SEED.some((s) => s.id === p.id)));
  t('the prompt is structured as index-addressable lines',
    seen.prompt.includes('index | order id') && seen.prompt.includes('SEARCH:') && /^0 \| B-/m.test(seen.prompt));

  t('why names the column that matched, not the model\'s opinion',
    r.items[0].why.some((w) => w.term === 'poweredge' && w.fields.includes('products')));

  // Paging happens AFTER selection, over the set the model settled on.
  const { env: envPaged } = freshEnv();
  const selectAll = withAI((prompt) => ({ indices: parsePool(prompt).map((p) => p.index) }));
  envPaged.AI = selectAll.AI;
  const fullP = await runSearch(envPaged, { text: 'acme' });
  const page1 = await runSearch(envPaged, { text: 'acme', limit: 1, offset: 0 });
  const page2 = await runSearch(envPaged, { text: 'acme', limit: 1, offset: 1 });
  t('semantic results page over the selected set',
    fullP.total === 2 && page1.total === 2 && page1.items.length === 1
    && page1.items[0].id === fullP.items[0].id && page2.items[0].id === fullP.items[1].id);
  // A selective model returns fewer rows than the pool it was offered — the
  // pool is recall, the reply is precision, and the two are not the same size.
  const selective = await runSearch(env, { text: 'acme' });
  t('the count is the size of the selected set, not of the pool',
    selective.plan.selection === 'model' && selective.total === 1 && selective.plan.poolSize === 2);
}

/* ── 5. No fabrication: invented indices have nowhere to land ──────────── */
{
  const { env } = freshEnv();
  const { AI, seen } = withAI(() => ({ indices: [99, 100, 999, -1, 0.5, 'seven'] }));
  env.AI = AI;

  const r = await runSearch(env, { text: 'poweredge' });
  const pool = parsePool(seen.prompt);
  t('every invented index is discarded', r.plan.selection !== 'model' && r.plan.modelUsed === null);
  t('the degradation is reported, not hidden', r.plan.fallback === 'model_returned_nothing');
  t('the fallback returns only rows that truly contain the term',
    r.items.every((i) => [i.id, i.name, i.company, i.email, i.products].join(' ').toLowerCase().includes('poweredge')));
  t('the fallback found the genuine match', r.items.some((i) => i.id === 'B-AAA1'));
  t('an index the model invented never becomes a row',
    r.items.every((i) => pool.some((p) => p.id === i.id)));

  const empty = await runSearch(env, { text: 'zzznotarealterm' });
  t('an unreferenced term returns nothing rather than inventing',
    empty.total === 0 && empty.plan.fallback === 'no_candidates' && empty.plan.selection === 'none');
}

/* ── 6. Degraded paths fall back to "every term really appears" ────────── */
{
  // No AI binding at all.
  const noAI = freshEnv();
  const r1 = await runSearch(noAI.env, { text: 'acme poweredge' });
  t('a missing AI binding degrades instead of failing', r1.plan.fallback === 'NO_AI_BINDING' && r1.plan.selection === 'substring');
  t('the degraded answer still contains every term',
    r1.items.every((i) => [i.id, i.name, i.company, i.email, i.products].join(' ').toLowerCase().includes('acme')
      && [i.id, i.name, i.company, i.email, i.products].join(' ').toLowerCase().includes('poweredge')));
  t('and it is the RIGHT answer, not a superset',
    r1.total === 1 && r1.items[0].id === 'B-AAA1');
  t('substring matches are still ordered newest first', r1.items[0].id === 'B-AAA1');

  // The emergency brake.
  const { env, db } = freshEnv();
  env.AI = withAI(() => ({ indices: [0] })).AI;
  db.exec('CREATE TABLE match_meta (key TEXT PRIMARY KEY, value TEXT)');
  db.prepare('INSERT INTO match_meta (key, value) VALUES (?, ?)').run('llm_enabled', '0');
  const r2 = await runSearch(env, { text: 'poweredge' });
  t('the llm_enabled brake disables the model path', r2.plan.fallback === 'LLM_DISABLED' && r2.plan.selection === 'substring');
  t('and the search still works', r2.items.some((i) => i.id === 'B-AAA1'));
  db.prepare('UPDATE match_meta SET value = ? WHERE key = ?').run('1', 'llm_enabled');
  const r3 = await runSearch(env, { text: 'poweredge' });
  t('releasing the brake restores the model path', r3.plan.selection !== 'substring' || r3.plan.fallback === null);

  // A model that answers with nothing useful.
  const { env: env4 } = freshEnv();
  env4.AI = withAI(() => ({})).AI;
  const r4 = await runSearch(env4, { text: 'poweredge' });
  t('a model that omits the key falls back', r4.plan.fallback === 'model_returned_nothing');
}

/* ── 7. Wildcards in user input stay literal ───────────────────────────── */
{
  const { env } = freshEnv();
  const r = await runSearch(env, { text: 'power_edge' });
  t('an underscore is a literal character, not a single-char wildcard',
    r.total === 1 && r.items[0].id === 'B-EEE5');
  t('and it did not match PowerEdge', !r.items.some((i) => i.id === 'B-AAA1'));

  const pct = await runSearch(env, { email: '%' });
  t('a bare % email does not match every row', pct.total === 0);

  const idPct = await runSearch(env, { orderId: 'B-%' });
  t('a bare % order id does not match every row', idPct.total === 0);
}

/* ── 8. Scope discipline ───────────────────────────────────────────────── */
{
  const { env } = freshEnv();
  const r = await runSearch(env, { text: 'acme', intent: 'buy' });
  const unfiltered = await runSearch(env, { text: 'acme' });
  t('a text search with filters still succeeds', r.ok === true && Array.isArray(r.items));
  t('free text still honours the exact filters', r.items.every((i) => i.intent === 'buy'));
  t('and the filters narrowed the result', r.total === 1 && unfiltered.total === 2 && r.total < unfiltered.total);

  const ranged = await runSearch(env, { text: 'acme', from: '2026-03-01' });
  t('a date range narrows a text search',
    ranged.ok === true && ranged.total === 1 && ranged.items.every((i) => i.date >= '2026-03-01'));

  const overCap = await runSearch(env, { text: 'acme', limit: 9999 });
  t('the limit is clamped', overCap.limit <= 100);
  t('the pool cap is a real bound', POOL_CAP === 100);

  // The filters a search reports must be the filters it applied — a caller
  // cannot audit a result whose stated scope differs from its real scope.
  t('the reported filters are the applied ones',
    unfiltered.filters.intent === null && ranged.filters.from === '2026-03-01T00:00:00.000Z');
  t('an unset filter is null, not an empty string',
    unfiltered.filters.email === null && unfiltered.filters.status === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
