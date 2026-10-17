/**
 * Driver test for the NETAMPS AI module — registry, access policy, budgets,
 * validators and the governed invocation path.
 *
 * Uses real SQLite (node:sqlite) as a faithful D1 adapter and a stubbed
 * Workers AI binding, so it exercises the actual SQL, the actual gate order
 * and the actual validators — not hand-rolled stubs.
 *
 * Invariants under test:
 *   1. Registry integrity: every consumer's module is registered with the
 *      tier, token ceiling and route its real call site uses (route 'direct'
 *      for the gateway-callers, 'orchestrated' for modules already on
 *      invokeModule), plus the feed AI modules.
 *   2. Access: operators (admin/staff/@netamps.com) in; buyers, public and
 *      expired sessions out. Non-admins never review.
 *   3. Gate order: FORBIDDEN → UNKNOWN_MODULE → brake → module flag →
 *      budget → input cap → model → validators. Each gate provable by the
 *      exact reason (a budget denial must read BUDGET_EXCEEDED even with no
 *      AI binding present — otherwise the gate order is unverified).
 *   4. Validators: schema shape/enum/items, grounding (ids/indices/quotes),
 *      structural math (exact, tolerance, mismatch with both numbers).
 *   5. Audit: every attempt lands in ai_runs; suggestions flow
 *      submit → list → review → locked.
 *
 * Run: node tests/ai-orchestrator.test.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import {
  AI_MODULES, getModule, aiAuthorized, aiAdmin,
  setModuleState, validateSchema, checkGrounding, verifyMath,
  submitSuggestion, listSuggestions, reviewSuggestion,
} from '../functions/api/ai/registry.mjs';
import { invokeModule, listRuns, moduleHealth } from '../functions/api/ai/orchestrator.mjs';

let pass = 0, fail = 0;
const t = (n, c) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

function makeEnv(aiPayload = undefined) {
  const db = new DatabaseSync(':memory:');
  const adapter = {
    prepare(sql) {
      let binds = [];
      const stmt = {
        bind(...a) { binds = a; return stmt; },
        async first() { const r = db.prepare(sql).get(...binds); return r === undefined ? null : r; },
        async all() { return { results: db.prepare(sql).all(...binds) }; },
        async run() { db.prepare(sql).run(...binds); return { success: true }; },
      };
      return stmt;
    },
  };
  const env = { DB: adapter };
  let calls = 0;
  if (aiPayload !== undefined) {
    env.AI = {
      run: async () => {
        calls += 1;
        return { response: typeof aiPayload === 'string' ? aiPayload : JSON.stringify(aiPayload) };
      }
    };
  }
  return { env, db, aiCalls: () => calls };
}

const ADMIN = { email: 'admin@netamps.com', role: 'admin' };
const STAFF = { email: 'ops@netamps.com', role: 'staff' };
const DOMAIN_USER = { email: 'finance@netamps.com', role: 'user' };
const BUYER = { email: 'buyer@company.com', role: 'user' };

// ── 1. registry integrity ───────────────────────────────────────────────────
{
  // Every id is unique and the six original call-site modules survive.
  const ids = AI_MODULES.map((m) => m.id);
  t('module ids are unique', new Set(ids).size === ids.length);
  const CORE = ['normalize', 'enrich', 'buy_suggest', 'match_rank', 'order_search', 'track_milestone'];
  t('core six modules registered', CORE.every((id) => !!getModule(id)));
  const byId = Object.fromEntries(AI_MODULES.map((m) => [m.id, m]));
  t('tiers match call sites', byId.normalize.tier === 'auto' && byId.enrich.tier === 'auto'
    && byId.buy_suggest.tier === 'small' && byId.match_rank.tier === 'auto'
    && byId.order_search.tier === 'auto' && byId.track_milestone.tier === 'small');
  t('token ceilings match call sites', byId.normalize.maxTokens === 400 && byId.enrich.maxTokens === 400
    && byId.match_rank.maxTokens === 700 && byId.order_search.maxTokens === 400
    && byId.track_milestone.maxTokens === 256);
  // 'direct' = the call site still hits the gateway itself. 'orchestrated' =
  // it already goes through invokeModule (the feed AI endpoints).
  t('core modules stay direct until migrated', CORE.every((id) => byId[id].route === 'direct'));
  t('feed modules are orchestrated', byId.feed_optimize.route === 'orchestrated'
    && byId.feed_draft_ticker.route === 'orchestrated');
  t('route values are known', AI_MODULES.every((m) => m.route === 'direct' || m.route === 'orchestrated'));
  t('unknown module resolves null', getModule('nope') === null);
}

// ── 2. access policy ────────────────────────────────────────────────────────
{
  t('admin authorized', aiAuthorized(ADMIN) === true);
  t('staff authorized', aiAuthorized(STAFF) === true);
  t('netamps mailbox authorized', aiAuthorized(DOMAIN_USER) === true);
  t('buyer denied', aiAuthorized(BUYER) === false);
  t('anonymous denied', aiAuthorized(null) === false);
  t('empty object denied', aiAuthorized({}) === false);
  t('admin predicate', aiAdmin(ADMIN) === true && aiAdmin(STAFF) === false && aiAdmin(DOMAIN_USER) === false);
}

// ── 3. gate order ───────────────────────────────────────────────────────────
{
  // FORBIDDEN first — no DB touch, no model touch.
  const { env } = makeEnv({ candidates: ['a'], unmatched: false });
  const f = await invokeModule(env, { user: BUYER, moduleId: 'buy_suggest', userPrompt: '{}', context: { allowedIds: ['a'] } });
  t('buyer invocation forbidden', f.ok === false && f.reason === 'FORBIDDEN');

  // UNKNOWN_MODULE before any brake/flag/budget read.
  const u = await invokeModule(env, { user: ADMIN, moduleId: 'nope', userPrompt: '{}' });
  t('unknown module rejected', u.ok === false && u.reason === 'UNKNOWN_MODULE');

  // MODULE_DISABLED before budget/model.
  const { env: e2 } = makeEnv({ candidates: ['a'], unmatched: false });
  await setModuleState(e2, 'buy_suggest', { enabled: false });
  const d = await invokeModule(e2, { user: ADMIN, moduleId: 'buy_suggest', userPrompt: '{}', context: { allowedIds: ['a'] } });
  t('disabled module refuses', d.ok === false && d.reason === 'MODULE_DISABLED');

  // BUDGET_EXCEEDED with NO ai binding present: proves the budget gate runs
  // before any model touch (otherwise this would read NO_AI_BINDING).
  const { env: e3 } = makeEnv();
  await setModuleState(e3, 'buy_suggest', { dailyBudget: 1 });
  const first = await invokeModule(e3, {
    user: ADMIN, moduleId: 'buy_suggest', userPrompt: '{}', context: { allowedIds: ['a'] }
  });
  t('first call under budget reaches the (missing) model', first.ok === false && first.reason === 'NO_AI_BINDING');
  const over = await invokeModule(e3, {
    user: ADMIN, moduleId: 'buy_suggest', userPrompt: '{}', context: { allowedIds: ['a'] }
  });
  t('second call denied by budget, not by model', over.ok === false && over.reason === 'BUDGET_EXCEEDED');

  // INPUT_TOO_LARGE before the model.
  const { env: e4, aiCalls } = makeEnv({ candidates: ['a'], unmatched: false });
  const big = await invokeModule(e4, {
    user: ADMIN, moduleId: 'buy_suggest', userPrompt: 'x'.repeat(30000), context: { allowedIds: ['a'] }
  });
  t('oversize input refused pre-model', big.ok === false && big.reason === 'INPUT_TOO_LARGE' && aiCalls() === 0);

  // EMPTY_PROMPT before the model.
  const empty = await invokeModule(e4, { user: ADMIN, moduleId: 'buy_suggest' });
  t('empty prompt refused pre-model', empty.ok === false && empty.reason === 'EMPTY_PROMPT' && aiCalls() === 0);
}

// ── 4a. schema validator ────────────────────────────────────────────────────
{
  const mod = AI_MODULES.find((m) => m.id === 'track_milestone');
  const good = { events: [{ milestone: 8, quote: 'out for delivery, arriving today' }], unmatched: false };
  t('valid verdict passes schema', validateSchema(good, mod.schema).ok === true);
  t('missing key fails', validateSchema({ unmatched: false }, mod.schema).reason === 'SCHEMA_MISSING');
  t('milestone 7 fails enum', validateSchema(
    { events: [{ milestone: 7, quote: 'delivered yesterday morning' }], unmatched: false }, mod.schema
  ).reason === 'SCHEMA_ENUM');
  t('non-object fails', validateSchema([1, 2], mod.schema).reason === 'NOT_AN_OBJECT');
  const rank = AI_MODULES.find((m) => m.id === 'match_rank');
  t('bad item fails with index', validateSchema(
    { rankings: [{ index: 0, fit: 0.9, gaps: 'g', rationale: 'r' }, 'junk'] }, rank.schema
  ).reason === 'SCHEMA_ITEM');
}

// ── 4b. grounding validator ─────────────────────────────────────────────────
{
  t('ids inside shortlist pass', checkGrounding(
    { candidates: ['a', 'b'], unmatched: false },
    { kind: 'ids', listKey: 'allowedIds', max: 4 }, { allowedIds: ['a', 'b', 'c'] }
  ).ok === true);
  t('fabricated id fails', checkGrounding(
    { candidates: ['a', 'zz'], unmatched: false },
    { kind: 'ids', listKey: 'allowedIds', max: 4 }, { allowedIds: ['a', 'b'] }
  ).reason === 'ID_NOT_IN_SHORTLIST');
  t('over-cap fails', checkGrounding(
    { candidates: ['a', 'b', 'c', 'd', 'e'], unmatched: false },
    { kind: 'ids', listKey: 'allowedIds', max: 4 }, { allowedIds: ['a', 'b', 'c', 'd', 'e'] }
  ).reason === 'OVER_CAP');
  t('in-pool indices pass', checkGrounding(
    { indices: [0, 3] }, { kind: 'indices', sizeKey: 'poolSize', max: 25 }, { poolSize: 10 }
  ).ok === true);
  t('out-of-pool index fails', checkGrounding(
    { indices: [0, 99] }, { kind: 'indices', sizeKey: 'poolSize', max: 25 }, { poolSize: 10 }
  ).reason === 'INDEX_OUT_OF_POOL');
  t('duplicate index fails', checkGrounding(
    { indices: [2, 2] }, { kind: 'indices', sizeKey: 'poolSize' }, { poolSize: 10 }
  ).reason === 'DUPLICATE_INDEX');
  const page = 'Your package is out for delivery and will arrive today before 6pm.';
  t('verbatim quote passes', checkGrounding(
    { events: [{ milestone: 8, quote: 'out for delivery and will arrive today' }] },
    { kind: 'quotes', textKey: 'pageText', minLen: 8 }, { pageText: page }
  ).ok === true);
  t('invented quote fails', checkGrounding(
    { events: [{ milestone: 8, quote: 'delivered to your neighbour Dave' }] },
    { kind: 'quotes', textKey: 'pageText', minLen: 8 }, { pageText: page }
  ).reason === 'QUOTE_NOT_GROUNDED');
}

// ── 4c. math validator ──────────────────────────────────────────────────────
{
  const rules = [{ field: 'totalPaise', equals: { op: 'mul', args: ['qty', 'unitPaise'] }, tolerance: 0 }];
  t('exact arithmetic passes', verifyMath({ qty: 3, unitPaise: 10000, totalPaise: 30000 }, rules).ok === true);
  const bad = verifyMath({ qty: 3, unitPaise: 10000, totalPaise: 29999 }, rules);
  t('mismatch carries both numbers', bad.ok === false && bad.reason === 'MATH_MISMATCH'
    && bad.detail[0] === 'totalPaise:got-29999:expected-30000');
  t('tolerance forgives float dust', verifyMath(
    { a: 0.1, b: 0.2, c: 0.3000000001 },
    [{ field: 'c', equals: { op: 'add', args: ['a', 'b'] }, tolerance: 1e-6 }]
  ).ok === true);
  t('division works', verifyMath(
    { per: 50, total: 100, n: 2 }, [{ field: 'per', equals: { op: 'div', args: ['total', 'n'] }, tolerance: 0 }]
  ).ok === true);
  t('missing field fails named', verifyMath({ qty: 3 }, rules).reason === 'MATH_FIELD_MISSING');
  t('bad op fails named', verifyMath({ totalPaise: 1 },
    [{ field: 'totalPaise', equals: { op: 'sqrt', args: ['totalPaise'] } }]).reason === 'MATH_BAD_OP');
  t('empty rules skip honestly', verifyMath({ anything: 1 }, []).skipped === true);
}

// ── 5. governed invocation end-to-end ───────────────────────────────────────
{
  const payload = { candidates: ['s1'], unmatched: false };
  const { env, aiCalls } = makeEnv(payload);
  const r = await invokeModule(env, {
    user: STAFF, moduleId: 'buy_suggest', system: 's', userPrompt: 'u',
    context: { allowedIds: ['s1'] }, promptVersion: 'test-v1'
  });
  t('orchestrated call succeeds with checks', r.ok === true && r.checks.schema === 'pass'
    && r.model === '@cf/meta/llama-3.1-8b-instruct-fp8' && aiCalls() === 1);
  const runs = await listRuns(env, { moduleId: 'buy_suggest' });
  t('success lands in ai_runs', runs.length === 1 && runs[0].ok === 1 && runs[0].actor === 'ops@netamps.com');

  // Schema failure: no payload out, run logged as failed with the reason.
  const { env: e2 } = makeEnv({ candidates: 'not-an-array', unmatched: false });
  const bad = await invokeModule(e2, {
    user: STAFF, moduleId: 'buy_suggest', userPrompt: 'u', context: { allowedIds: ['s1'] }
  });
  t('schema failure blocks payload', bad.ok === false && bad.reason === 'SCHEMA_MISMATCH' && !bad.payload);
  const runs2 = await listRuns(e2, {});
  t('failure lands in ai_runs with reason', runs2.length === 1 && runs2[0].ok === 0 && runs2[0].reason === 'SCHEMA_MISMATCH');

  // Grounding failure via the milestone module.
  const { env: e3 } = makeEnv({ events: [{ milestone: 8, quote: 'handed to a passing stranger' }], unmatched: false });
  const ung = await invokeModule(e3, {
    user: ADMIN, moduleId: 'track_milestone', userPrompt: 'u',
    context: { pageText: 'out for delivery, arriving today' }
  });
  t('ungrounded verdict blocked', ung.ok === false && ung.reason === 'QUOTE_NOT_GROUNDED');

  // Health rollup reads the gateway telemetry table (absent here → zeros, honestly).
  const health = await (await import('../functions/api/ai/orchestrator.mjs')).moduleHealth(e3);
  t('health covers all modules', health.length === AI_MODULES.length && health.every((h) => h.calls24h === 0));

  // The feed AI modules are wired through the same governed path.
  const { env: fenv } = makeEnv({ title: 'Enterprise servers in stock', detail: 'Certified units, ready to ship.' });
  const fr = await invokeModule(fenv, {
    user: ADMIN, moduleId: 'feed_optimize', system: 's', userPrompt: 'u'
  });
  t('feed_optimize is orchestrated', fr.ok === true && fr.checks.schema === 'pass'
    && String(fr.payload.title).includes('servers'));
  const { env: tenv } = makeEnv({ text: 'Enterprise servers in stock and ready to ship' });
  const tr = await invokeModule(tenv, {
    user: ADMIN, moduleId: 'feed_draft_ticker', system: 's', userPrompt: 'u'
  });
  t('feed_draft_ticker is orchestrated', tr.ok === true && tr.checks.schema === 'pass');
}

// ── 6. suggestions inbox ────────────────────────────────────────────────────
{
  const { env } = makeEnv();
  const bad = await submitSuggestion(env, { kind: 'wish', title: 'x', actor: 'a@b.c' });
  t('bad kind refused', bad.ok === false && bad.reason === 'BAD_KIND');
  const noTitle = await submitSuggestion(env, { kind: 'review', title: '  ', actor: 'a@b.c' });
  t('empty title refused', noTitle.ok === false && noTitle.reason === 'TITLE_REQUIRED');
  const ghost = await submitSuggestion(env, { kind: 'review', title: 'x', moduleId: 'nope', actor: 'a@b.c' });
  t('unknown module refused', ghost.ok === false && ghost.reason === 'UNKNOWN_MODULE');
  const s1 = await submitSuggestion(env, { kind: 'roadmap', title: 'Route normalize via orchestrator', moduleId: 'normalize', actor: STAFF.email });
  t('suggestion filed', s1.ok === true && typeof s1.id === 'string');
  const open = await listSuggestions(env, { status: 'open' });
  t('inbox lists open item', open.length === 1 && open[0].title.includes('normalize'));
  const rev = await reviewSuggestion(env, { id: s1.id, decision: 'accepted', reviewer: ADMIN.email });
  t('review decides', rev.ok === true && rev.decision === 'accepted');
  const twice = await reviewSuggestion(env, { id: s1.id, decision: 'rejected', reviewer: ADMIN.email });
  t('decided item locked', twice.ok === false && twice.reason === 'ALREADY_DECIDED');
  const missing = await reviewSuggestion(env, { id: 'nope', decision: 'accepted', reviewer: ADMIN.email });
  t('missing item 404s', missing.ok === false && missing.reason === 'NOT_FOUND');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
