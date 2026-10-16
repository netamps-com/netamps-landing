/**
 * Driver test for the stock ledger — buy & sell inventory connected through
 * an append-only movement ledger.
 *
 * Uses real SQLite (node:sqlite) as a faithful D1 adapter, so it exercises
 * the actual SQL, the actual guards and the actual idempotency paths — not a
 * hand-rolled stub.
 *
 * Invariants under test:
 *   1. Writers refuse while the flag is OFF (fail-closed, dark tables).
 *   2. RECEIPT is idempotent per (sell order, line) — no double stock.
 *   3. RESERVE is guarded by availability and idempotent per outstanding ref.
 *   4. RELEASE returns holds; never more than held.
 *   5. ISSUE consumes the ref's own hold first, then availability; shortfall
 *      is reported, never silent.
 *   6. VOID closes lots, auto-releases outstanding, blocks new movements.
 *   7. ADJUST is signed + reasoned and can never drive a lot negative.
 *   8. Availability aggregates across lots and excludes closed lots.
 *   9. End-to-end: sell DEAL → receive; accept → reserve; buy DEAL → issue;
 *      decline → release.
 *
 * Run: node tests/stock-ledger.test.mjs   (or: node --test tests/stock-ledger.test.mjs)
 */
import { DatabaseSync } from 'node:sqlite';
import {
  ensureStockTables, stockEnabled, setStockEnabled,
  receiveSellOrder, reserveStock, releaseStock, releaseOrderReservations,
  issueStock, issueBuyOrder, voidSellOrder, adjustStock,
  lotBalance, openLotsByKey, availableByKey, movementsFor, reservationsForBuy,
} from '../functions/api/stock/ledger.mjs';

let pass = 0, fail = 0;
const t = (n, c) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

function makeEnv() {
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
  return { env: { DB: adapter }, db };
}

const SELL_DL380 = [
  { category: 'servers', details: 'HPE ProLiant DL380 Gen10', quantity: 5 },
  { category: 'servers', details: 'Dell PowerEdge R740', quantity: 2 },
];
const BUY_LINE = (details, quantity) => [{ category: 'servers', details, quantity }];

// ── 1. flag gates every writer ──────────────────────────────────────────────
{
  const { env } = makeEnv();
  t('flag defaults OFF on a cold DB', (await stockEnabled(env)) === false);
  const r = await receiveSellOrder(env, { orderId: 'S1', products: SELL_DL380 });
  t('receive refuses while disabled', r.ok === false && r.reason === 'DISABLED');
  const q = await reserveStock(env, { sellOrderId: 'S1', sellLineIdx: 0, buyOrderId: 'B1', buyLineIdx: 0, qty: 1 });
  t('reserve refuses while disabled', q.ok === false && q.reason === 'DISABLED');
  await setStockEnabled(env, true);
  t('flag reads back ON', (await stockEnabled(env)) === true);
}

// ── 2. receipt + idempotency ────────────────────────────────────────────────
{
  const { env } = makeEnv();
  await setStockEnabled(env, true);
  const r1 = await receiveSellOrder(env, { orderId: 'S1', products: SELL_DL380, actor: 'staff@netamps.com' });
  t('receive creates one lot per line', r1.ok && r1.received === 2 && r1.existing === 0);
  const r2 = await receiveSellOrder(env, { orderId: 'S1', products: SELL_DL380 });
  t('re-receipt is idempotent (no double stock)', r2.ok && r2.received === 0 && r2.existing === 2);
  const lots = await openLotsByKey(env, 'SERVERS', 'HPE PROLIANT DL380 GEN10');
  t('lot found by normalized key', lots.length === 1 && lots[0].qty_total === 5);
  const bal = await lotBalance(env, lots[0].id);
  t('fresh lot balance is all-available', bal.available === 5 && bal.outstanding === 0);
  const bad = await receiveSellOrder(env, { orderId: '', products: SELL_DL380 });
  t('receive rejects bad input', bad.ok === false);
}

// ── 3. reserve guards ───────────────────────────────────────────────────────
{
  const { env } = makeEnv();
  await setStockEnabled(env, true);
  await receiveSellOrder(env, { orderId: 'S1', products: SELL_DL380 });
  const r1 = await reserveStock(env, { sellOrderId: 'S1', sellLineIdx: 0, buyOrderId: 'B1', buyLineIdx: 0, qty: 3, actor: 'admin' });
  t('reserve holds within availability', r1.ok && r1.reserved === 3 && !r1.duplicate);
  const lots = await openLotsByKey(env, 'SERVERS', 'HPE PROLIANT DL380 GEN10');
  const bal = await lotBalance(env, lots[0].id);
  t('available drops by the hold', bal.available === 2 && bal.outstanding === 3);
  const over = await reserveStock(env, { sellOrderId: 'S1', sellLineIdx: 0, buyOrderId: 'B2', buyLineIdx: 0, qty: 3 });
  t('over-reserve fails closed with the number', over.ok === false && over.reason === 'INSUFFICIENT_AVAILABLE' && over.available === 2);
  const dup = await reserveStock(env, { sellOrderId: 'S1', sellLineIdx: 0, buyOrderId: 'B1', buyLineIdx: 0, qty: 3 });
  t('re-reserve of a held ref dedupes', dup.ok && dup.duplicate === true && dup.reserved === 3);
  const ghost = await reserveStock(env, { sellOrderId: 'NOPE', sellLineIdx: 0, buyOrderId: 'B1', buyLineIdx: 0, qty: 1 });
  t('reserve of a missing lot fails', ghost.ok === false && ghost.reason === 'LOT_NOT_FOUND');
  const badQty = await reserveStock(env, { sellOrderId: 'S1', sellLineIdx: 0, buyOrderId: 'B9', buyLineIdx: 0, qty: 0 });
  t('reserve rejects non-positive qty', badQty.ok === false && badQty.reason === 'BAD_QTY');
}

// ── 4. release ──────────────────────────────────────────────────────────────
{
  const { env } = makeEnv();
  await setStockEnabled(env, true);
  await receiveSellOrder(env, { orderId: 'S1', products: SELL_DL380 });
  await reserveStock(env, { sellOrderId: 'S1', sellLineIdx: 0, buyOrderId: 'B1', buyLineIdx: 0, qty: 3 });
  const part = await releaseStock(env, { sellOrderId: 'S1', sellLineIdx: 0, buyOrderId: 'B1', buyLineIdx: 0, qty: 1, reason: 'partial' });
  t('partial release returns one unit', part.ok && part.released === 1);
  const over = await releaseStock(env, { sellOrderId: 'S1', sellLineIdx: 0, buyOrderId: 'B1', buyLineIdx: 0, qty: 9 });
  t('release beyond held fails', over.ok === false && over.reason === 'EXCEEDS_RESERVED' && over.outstanding === 2);
  const full = await releaseStock(env, { sellOrderId: 'S1', sellLineIdx: 0, buyOrderId: 'B1', buyLineIdx: 0, reason: 'declined' });
  t('default release frees the rest', full.ok && full.released === 2);
  const lots = await openLotsByKey(env, 'SERVERS', 'HPE PROLIANT DL380 GEN10');
  const bal = await lotBalance(env, lots[0].id);
  t('availability fully restored', bal.available === 5 && bal.outstanding === 0);
  const none = await releaseStock(env, { sellOrderId: 'S1', sellLineIdx: 0, buyOrderId: 'B1', buyLineIdx: 0 });
  t('release with nothing held fails', none.ok === false && none.reason === 'NOTHING_RESERVED');
}

// ── 5. issue consumes the hold first ────────────────────────────────────────
{
  const { env } = makeEnv();
  await setStockEnabled(env, true);
  await receiveSellOrder(env, { orderId: 'S1', products: SELL_DL380 });
  await reserveStock(env, { sellOrderId: 'S1', sellLineIdx: 0, buyOrderId: 'B1', buyLineIdx: 0, qty: 3 });
  const iss = await issueStock(env, { sellOrderId: 'S1', sellLineIdx: 0, buyOrderId: 'B1', buyLineIdx: 0, qty: 2 });
  t('issue fulfills from the hold', iss.ok && iss.issued === 2 && iss.shortfall === 0);
  const lots = await openLotsByKey(env, 'SERVERS', 'HPE PROLIANT DL380 GEN10');
  const bal = await lotBalance(env, lots[0].id);
  t('issue consumes hold then availability (5-2 issued, 1 still held → 2 free)', bal.available === 2 && bal.outstanding === 1 && bal.ISSUE === 2);
  const over = await issueStock(env, { sellOrderId: 'S1', sellLineIdx: 0, buyOrderId: 'B2', buyLineIdx: 0, qty: 9 });
  t('oversized issue partial-fills with shortfall', over.ok && over.issued === 2 && over.shortfall === 7);
}

// ── 6. void ─────────────────────────────────────────────────────────────────
{
  const { env } = makeEnv();
  await setStockEnabled(env, true);
  await receiveSellOrder(env, { orderId: 'S1', products: SELL_DL380 });
  await reserveStock(env, { sellOrderId: 'S1', sellLineIdx: 0, buyOrderId: 'B1', buyLineIdx: 0, qty: 2 });
  const v = await voidSellOrder(env, { sellOrderId: 'S1', reason: 'order_deleted' });
  t('void closes both lots', v.ok && v.voided.length === 2);
  const lots = await openLotsByKey(env, 'SERVERS', 'HPE PROLIANT DL380 GEN10');
  t('voided lots vanish from availability', lots.length === 0);
  const again = await voidSellOrder(env, { sellOrderId: 'S1' });
  t('re-void is a clean no-op', again.ok && again.voided.length === 0);
  const blocked = await reserveStock(env, { sellOrderId: 'S1', sellLineIdx: 1, buyOrderId: 'B9', buyLineIdx: 0, qty: 1 });
  t('closed lots refuse new movements', blocked.ok === false && blocked.reason === 'LOT_NOT_OPEN');
  const keys = await availableByKey(env, {});
  t('voided stock excluded from the board', !keys.some((k) => k.norm_model === 'DELL POWEREDGE R740'));
}

// ── 7. adjust ───────────────────────────────────────────────────────────────
{
  const { env } = makeEnv();
  await setStockEnabled(env, true);
  await receiveSellOrder(env, { orderId: 'S1', products: SELL_DL380 });
  const up = await adjustStock(env, { sellOrderId: 'S1', sellLineIdx: 0, delta: 2, reason: 'recount found two more' });
  t('positive adjustment adds stock', up.ok && up.available === 7);
  const down = await adjustStock(env, { sellOrderId: 'S1', sellLineIdx: 0, delta: -3, reason: 'one unit damaged' });
  t('negative adjustment writes down', down.ok && down.available === 4);
  const neg = await adjustStock(env, { sellOrderId: 'S1', sellLineIdx: 0, delta: -9, reason: 'too much' });
  t('adjustment below zero is refused', neg.ok === false && neg.reason === 'WOULD_GO_NEGATIVE');
  const noreason = await adjustStock(env, { sellOrderId: 'S1', sellLineIdx: 0, delta: 1, reason: '' });
  t('adjustment requires a reason', noreason.ok === false && noreason.reason === 'REASON_REQUIRED');
}

// ── 8. board aggregation ────────────────────────────────────────────────────
{
  const { env } = makeEnv();
  await setStockEnabled(env, true);
  await receiveSellOrder(env, { orderId: 'S1', products: SELL_DL380 });
  await receiveSellOrder(env, { orderId: 'S2', products: BUY_LINE('HPE ProLiant DL380 Gen10', 4) });
  const keys = await availableByKey(env, {});
  const dl380 = keys.find((k) => k.norm_model === 'HPE PROLIANT DL380 GEN10');
  t('same key aggregates across lots (5+4)', !!dl380 && Number(dl380.available) === 9 && Number(dl380.lots) === 2);
}

// ── 9. end-to-end lifecycle ─────────────────────────────────────────────────
{
  const { env } = makeEnv();
  await setStockEnabled(env, true);
  // SELL DEAL → receipt
  await receiveSellOrder(env, { orderId: 'S1', products: SELL_DL380, actor: 'staff' });
  // candidate accepted → reserve 3 of 5
  const res = await reserveStock(env, { sellOrderId: 'S1', sellLineIdx: 0, buyOrderId: 'B1', buyLineIdx: 0, qty: 3, actor: 'admin' });
  t('e2e: accept reserves', res.ok && !res.duplicate);
  // BUY DEAL → issue consumes the hold
  const deal = await issueBuyOrder(env, { orderId: 'B1', products: BUY_LINE('HPE ProLiant DL380 Gen10', 3), actor: 'system' });
  t('e2e: buy deal issues in full', deal.ok && deal.totalIssued === 3 && deal.totalShortfall === 0);
  const lots = await openLotsByKey(env, 'SERVERS', 'HPE PROLIANT DL380 GEN10');
  const bal = await lotBalance(env, lots[0].id);
  t('e2e: lot left with 2 free, nothing held', bal.available === 2 && bal.outstanding === 0);
  // second BUY over-asks → partial + shortfall, no silent failure
  await reserveStock(env, { sellOrderId: 'S1', sellLineIdx: 0, buyOrderId: 'B2', buyLineIdx: 0, qty: 2 });
  const deal2 = await issueBuyOrder(env, { orderId: 'B2', products: BUY_LINE('HPE ProLiant DL380 Gen10', 5) });
  t('e2e: over-ask partial-fills with explicit shortfall', deal2.totalIssued === 2 && deal2.totalShortfall === 3);
  // decline releases a fresh hold
  await receiveSellOrder(env, { orderId: 'S3', products: BUY_LINE('Dell PowerEdge R740', 2) });
  await reserveStock(env, { sellOrderId: 'S3', sellLineIdx: 0, buyOrderId: 'B3', buyLineIdx: 0, qty: 2 });
  const rel = await releaseOrderReservations(env, { buyOrderId: 'B3', reason: 'order_declined' });
  t('e2e: decline releases the hold', rel.ok && rel.released.length === 1 && rel.released[0].released === 2);
  const held = await reservationsForBuy(env, 'B3');
  t('e2e: nothing outstanding after release', held.length === 0);
  // readers
  const moves = await movementsFor(env, { buyOrderId: 'B1' });
  t('e2e: buy ledger readable', moves.length >= 3 && moves.every((m) => m.ref_buy_order === 'B1'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
