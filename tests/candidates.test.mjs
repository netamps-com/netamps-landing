/**
 * Driver test for the BUY → SELL best-match candidate pipeline.
 *
 * Uses real SQLite (node:sqlite) as a faithful D1 adapter and a mocked Workers
 * AI binding, so it exercises the actual SQL, the actual grounding validator and
 * the actual accept path — not a hand-rolled stub.
 *
 * Run: node candidates.test.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import {
  generateCandidatesForOrder, readCandidates, acceptCandidate,
  candidatesEnabled, ensureCandidateTables, sellBookVersion, bumpSellBookVersion,
  validateRanking, computeConfidence,
} from '../functions/api/matching/ranker.js';

let pass = 0, fail = 0;
const t = (n, c) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

function makeEnv({ aiPayload = null } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE match_meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE returns (id TEXT PRIMARY KEY, intent TEXT, products TEXT);
    CREATE TABLE match_lines (order_id TEXT, line_idx INTEGER, side TEXT, norm_name TEXT, norm_model TEXT, raw_cat TEXT, raw_det TEXT, qty INTEGER, ask_paise INTEGER);
    CREATE TABLE product_line_norm (requestId TEXT, lineIdx INTEGER, catalogId TEXT);
  `);
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
    async batch(stmts) { return stmts; },
  };
  const env = { DB: adapter };
  if (aiPayload !== null) {
    env.AI = { run: async () => ({ response: JSON.stringify(aiPayload) }) };
  }
  return { env, db };
}

function seedOrder(db, { id, intent, lines }) {
  db.prepare('INSERT INTO returns (id, intent, products) VALUES (?,?,?)').run(id, intent, JSON.stringify(lines));
  lines.forEach((l, i) => {
    db.prepare('INSERT INTO match_lines (order_id,line_idx,side,norm_name,norm_model,raw_cat,raw_det,qty,ask_paise) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, i, intent, String(l.category).toUpperCase(), String(l.details).toUpperCase(), l.category, l.details, l.qty ?? 1, null);
  });
}

const BUY_ASUS = { category: 'laptops', details: 'ASUS Laptop i5 11th Gen 16GB 512 GB', qty: 5 };
const SELL_DELL = { category: 'servers', details: 'DELL', qty: 1 };
const BUY_DL380 = { category: 'servers', details: 'HPE ProLiant DL380 Gen10', qty: 2 };
const SELL_DL380 = { category: 'servers', details: 'HPE ProLiant DL380 Gen9', qty: 1 };

// ── 1. Flag gate ─────────────────────────────────────────────────────────────
{
  const { env, db } = makeEnv();
  seedOrder(db, { id: 'B1', intent: 'buy', lines: [BUY_DL380] });
  seedOrder(db, { id: 'S1', intent: 'sell', lines: [SELL_DL380] });
  t('candidatesEnabled false when flag absent', (await candidatesEnabled(env)) === false);
  const s = await generateCandidatesForOrder(env, { requestId: 'B1' });
  t('disabled run emits nothing', s.enabled === false && s.emitted === 0 && s.reason === 'DISABLED');
}

// ── 2. Honest empty state (ASUS laptop vs DELL server) ───────────────────────
{
  const { env, db } = makeEnv({ aiPayload: { candidates: [{ index: 0, fit: 0.9 }] } });
  db.prepare("INSERT INTO match_meta (key,value) VALUES ('candidates_enabled','1')").run();
  seedOrder(db, { id: 'B2', intent: 'buy', lines: [BUY_ASUS] });
  seedOrder(db, { id: 'S2', intent: 'sell', lines: [SELL_DELL] });
  const s = await generateCandidatesForOrder(env, { requestId: 'B2' });
  t('unrelated classes → empty shortlist, no LLM, no emit',
    s.emitted === 0 && s.emptyLines === 1 && s.shortlisted === 0);
  const read = await readCandidates(env, { buyOrderId: 'B2' });
  t('read shows no candidates for empty state', read.candidates.length === 0 && read.enabled === true);
}

// ── 3. Positive: DL380 Gen10 vs Gen9 → validated candidate → read → accept ───
{
  const { env, db } = makeEnv({ aiPayload: { candidates: [{ index: 0, fit: 0.82, gaps: 'Gen9 vs Gen10 requested', rationale: 'same platform, one generation back' }] } });
  db.prepare("INSERT INTO match_meta (key,value) VALUES ('candidates_enabled','1')").run();
  seedOrder(db, { id: 'B3', intent: 'buy', lines: [BUY_DL380] });
  seedOrder(db, { id: 'S3', intent: 'sell', lines: [SELL_DL380] });

  const s = await generateCandidatesForOrder(env, { requestId: 'B3' });
  t('positive line emits exactly one candidate', s.emitted === 1 && s.model && s.shortlisted >= 1);

  const read = await readCandidates(env, { buyOrderId: 'B3' });
  t('read returns the candidate mapped to a real sell order', read.candidates.length === 1 && read.candidates[0].sellOrderId === 'S3');
  t('confidence is computed, in (0,1)', read.candidates[0].confidence > 0 && read.candidates[0].confidence <= 0.97);
  t('gaps/rationale preserved for the human', /Gen9/.test(read.candidates[0].gaps || ''));

  const acc = await acceptCandidate(env, { buyOrderId: 'B3', buyLineIdx: 0, sellOrderId: 'S3', sellLineIdx: 0, actor: 'admin@netamps.com' });
  t('accept succeeds for an existing candidate', acc.ok === true);
  const buyKey = db.prepare("SELECT norm_name, norm_model FROM match_lines WHERE order_id='B3' AND side='buy'").get();
  t('accept aligns BUY key to SELL key (existing exact matcher will pair)',
    buyKey.norm_name === 'SERVERS' && buyKey.norm_model === 'HPE PROLIANT DL380 GEN9');
  const fb = db.prepare("SELECT COUNT(*) n FROM match_candidate_feedback WHERE decision='accepted'").get();
  t('accept records feedback (training/eval signal)', fb.n === 1);

  const bogus = await acceptCandidate(env, { buyOrderId: 'B3', buyLineIdx: 0, sellOrderId: 'NOPE', sellLineIdx: 0, actor: 'x' });
  t('accept refuses a non-candidate pair', bogus.ok === false && bogus.reason === 'CANDIDATE_NOT_FOUND');
}

// ── 4. Hallucinated index is dropped end-to-end ──────────────────────────────
{
  const { env, db } = makeEnv({ aiPayload: { candidates: [{ index: 99, fit: 1, rationale: 'invented' }] } });
  db.prepare("INSERT INTO match_meta (key,value) VALUES ('candidates_enabled','1')").run();
  seedOrder(db, { id: 'B4', intent: 'buy', lines: [BUY_DL380] });
  seedOrder(db, { id: 'S4', intent: 'sell', lines: [SELL_DL380] });
  const s = await generateCandidatesForOrder(env, { requestId: 'B4' });
  t('model cannot invent a SELL order (index out of range dropped)', s.emitted === 0);
}

// ── 5. Unmatched-only: exact-matchable line is skipped ───────────────────────
{
  const { env, db } = makeEnv({ aiPayload: { candidates: [{ index: 0, fit: 0.9 }] } });
  db.prepare("INSERT INTO match_meta (key,value) VALUES ('candidates_enabled','1')").run();
  seedOrder(db, { id: 'B5', intent: 'buy', lines: [SELL_DL380] }); // identical to a SELL line
  seedOrder(db, { id: 'S5', intent: 'sell', lines: [SELL_DL380] });
  const s = await generateCandidatesForOrder(env, { requestId: 'B5' });
  t('exactly-matchable line produces no candidates (unmatched-only)', s.emitted === 0);
  const read = await readCandidates(env, { buyOrderId: 'B5' });
  t('no candidate rows for a native match', read.candidates.length === 0);
}

// ── 6. SELL-book version cache key ───────────────────────────────────────────
{
  const { env, db } = makeEnv();
  db.prepare("INSERT INTO match_meta (key,value) VALUES ('candidates_enabled','1')").run();
  seedOrder(db, { id: 'B6', intent: 'buy', lines: [BUY_DL380] });
  seedOrder(db, { id: 'S6', intent: 'sell', lines: [SELL_DL380] });
  env.AI = { run: async () => ({ response: JSON.stringify({ candidates: [{ index: 0, fit: 0.8 }] }) }) };
  await generateCandidatesForOrder(env, { requestId: 'B6' });
  const before = await readCandidates(env, { buyOrderId: 'B6' });
  t('cache not stale before any SELL change', before.stale === false);
  const next = await bumpSellBookVersion(env);
  t('bump increments sell_book_version', Number(next) === Number(before.sellBookVersion) + 1);
  const after = await readCandidates(env, { buyOrderId: 'B6' });
  t('cache marked stale after a SELL change', after.stale === true);
}

// ── 7. NON-BUY orders never generate ─────────────────────────────────────────
{
  const { env, db } = makeEnv({ aiPayload: { candidates: [{ index: 0 }] } });
  db.prepare("INSERT INTO match_meta (key,value) VALUES ('candidates_enabled','1')").run();
  seedOrder(db, { id: 'S7', intent: 'sell', lines: [SELL_DL380] });
  const s = await generateCandidatesForOrder(env, { requestId: 'S7' });
  t('SELL order is not processed', s.reason === 'NOT_BUY' && s.emitted === 0);
}

console.log(`\nCANDIDATES_PASS — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
