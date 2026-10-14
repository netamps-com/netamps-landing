/**
 * Harness for the price-negotiation feature.
 *
 * Exercises the ACTUAL modules (core.mjs + store.mjs) against real SQLite via
 * node:sqlite — not a stub. Covers the price-version freeze, the staleness
 * guard, the total state machine, the chronological order lifecycle, the single
 * closing verb, buyer/staff verb separation, thread persistence, the
 * final-price-only audit trail and email-scoped buyer tokens.
 *
 * Run: node scripts/test-negotiate.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import {
  validateRound, applyRound, capturePriceSnapshot, isStale, summarize,
  orderBaselinePaise, STATUS, MAX_NOTE, MAX_CONSIDERATION_PAISE,
  normalizeStatus, isClosed, isNegotiable, statusRank, CHRONOLOGY
} from '../functions/api/negotiate/core.mjs';
import {
  ensureNegotiationSchema, getOrderById, serializeOrderRow, findOrCreateNegotiation,
  appendRound, readRounds, readNegotiation, listNegotiations, listNegotiationsForOrder,
  mintBuyerToken, verifyBuyerToken, listOrdersByEmail, finalizeDeal, setOrderStatus
} from '../functions/api/negotiate/store.mjs';

let pass = 0, fail = 0;
const t = (n, c) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n); } };

function makeEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE returns (
      id TEXT PRIMARY KEY, intent TEXT, name TEXT, company TEXT, email TEXT, phone TEXT,
      products TEXT, attachedFiles TEXT, emailDeliveryStatus TEXT, date TEXT, status TEXT,
      totalAmount REAL, pricingBasis TEXT, lotConsiderationPaise INTEGER, manifest TEXT, finalPrice TEXT
    );
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
  return { env: { DB: adapter }, db };
}

function seedOrder(db, { id, intent = 'buy', email = 'buyer@example.com', lines = [{ category: 'servers', details: 'Dell R740', quantity: 2, pricePaise: 4500000 }], finalPrice = null, pricingBasis = 'per_product', lotConsiderationPaise = null, manifest = null, status = 'Pending' }) {
  db.prepare(
    'INSERT INTO returns (id, intent, name, company, email, phone, products, attachedFiles, date, status, pricingBasis, lotConsiderationPaise, manifest, finalPrice) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(id, intent, 'Buyer', 'Acme', email, '9999999999', JSON.stringify(lines), '[]', new Date().toISOString(), status, pricingBasis, lotConsiderationPaise, manifest ? JSON.stringify(manifest) : null, finalPrice ? JSON.stringify(finalPrice) : null);
}

// ── 1. Round validation: verbs per side, amounts, notes ──────────────────────
{
  t('buyer may offer', validateRound({ side: 'buyer', kind: 'offer', totalPaise: 100 }).ok === true);
  t('buyer may not reject', validateRound({ side: 'buyer', kind: 'reject' }).ok === false);
  t('buyer may not approve the deal', validateRound({ side: 'buyer', kind: 'approve' }).ok === false);
  t('staff may offer (opens seller side)', validateRound({ side: 'staff', kind: 'offer', totalPaise: 100 }).ok === true);
  t('staff may approve the deal', validateRound({ side: 'staff', kind: 'approve' }).ok === true);
  t('staff may not withdraw', validateRound({ side: 'staff', kind: 'withdraw' }).ok === false);
  t('unknown side refused', validateRound({ side: 'seller', kind: 'offer', totalPaise: 1 }).ok === false);
  t('unknown verb refused', validateRound({ side: 'buyer', kind: 'haggle', totalPaise: 1 }).ok === false);
  t('missing amount refused for offer', validateRound({ side: 'buyer', kind: 'offer' }).ok === false);
  t('negative amount refused', validateRound({ side: 'buyer', kind: 'offer', totalPaise: -1 }).ok === false);
  t('zero is a valid explicit amount', validateRound({ side: 'buyer', kind: 'offer', totalPaise: 0 }).ok === true);
  t('amount over cap refused', validateRound({ side: 'buyer', kind: 'offer', totalPaise: MAX_CONSIDERATION_PAISE + 1 }).ok === false);
  t('float amount refused', validateRound({ side: 'buyer', kind: 'offer', totalPaise: 1.5 }).ok === false);
  t('reject carries no amount', validateRound({ side: 'staff', kind: 'reject', totalPaise: 5 }).ok === false);
  t('reject without amount ok', validateRound({ side: 'staff', kind: 'reject' }).ok === true);
  t('approve carries no amount', validateRound({ side: 'staff', kind: 'approve', totalPaise: 5 }).ok === false);
  t('accept needs no amount — it takes the figure on the table', validateRound({ side: 'buyer', kind: 'accept' }).ok === true);
  t('accept may restate an amount', validateRound({ side: 'buyer', kind: 'accept', totalPaise: 12 }).ok === true);
  t('accept with a bad amount refused', validateRound({ side: 'buyer', kind: 'accept', totalPaise: -3 }).ok === false);
  t('over-long note refused', validateRound({ side: 'buyer', kind: 'offer', totalPaise: 1, note: 'x'.repeat(MAX_NOTE + 1) }).ok === false);
  t('note is trimmed', validateRound({ side: 'buyer', kind: 'offer', totalPaise: 1, note: '  hi  ' }).value.note === 'hi');
}

// ── 2. Price-version capture ─────────────────────────────────────────────────
{
  const approved = { finalPrice: { version: 3, basis: 'negotiated', totalPaise: 123456, manifestHashAtApproval: 'abc' } };
  const snap = capturePriceSnapshot(approved, { at: 'T' });
  t('approved order freezes approval snapshot', snap.version === 3 && snap.totalPaise === 123456 && snap.basis === 'negotiated');
  t('frozen snapshot records time', snap.capturedAt === 'T');

  const evalOnly = { products: [{ quantity: 2, pricePaise: 1000 }, { quantity: 1, pricePaise: 500 }] };
  const base = capturePriceSnapshot(evalOnly, { at: 'T' });
  t('unapproved order freezes evaluated baseline at v0', base.version === 0 && base.totalPaise === 2500);

  t('baseline is null when nothing priced', orderBaselinePaise({ products: [{ quantity: 1 }] }) === null);
  t('lot order baseline uses lot consideration', orderBaselinePaise({ pricingBasis: 'lot', lotConsiderationPaise: 777 }) === 777);
  t('legacy rupee float converts once', orderBaselinePaise({ products: [{ quantity: 1, price: 10.5 }] }) === 1050);
}

// ── 3. Staleness guard ───────────────────────────────────────────────────────
{
  t('same snapshot is not stale', isStale({ version: 1, totalPaise: 100 }, { version: 1, totalPaise: 100 }) === false);
  t('version bump is stale', isStale({ version: 1, totalPaise: 100 }, { version: 2, totalPaise: 100 }) === true);
  t('total change is stale', isStale({ version: 1, totalPaise: 100 }, { version: 1, totalPaise: 200 }) === true);
  t('missing snapshot is never stale', isStale(null, { version: 1, totalPaise: 1 }) === false);
}

// ── 4. Lifecycle + state machine ─────────────────────────────────────────────
{
  t('ladder is chronological', CHRONOLOGY.indexOf(STATUS.PENDING) < CHRONOLOGY.indexOf(STATUS.ACCEPTED)
    && CHRONOLOGY.indexOf(STATUS.ACCEPTED) < CHRONOLOGY.indexOf(STATUS.IN_PROGRESS)
    && CHRONOLOGY.indexOf(STATUS.IN_PROGRESS) < CHRONOLOGY.indexOf(STATUS.AGREED)
    && CHRONOLOGY.indexOf(STATUS.AGREED) < CHRONOLOGY.indexOf(STATUS.DEAL));
  t('statusRank orders the rungs', statusRank(STATUS.PENDING) === 0 && statusRank(STATUS.DEAL) === 4);
  t('declined sits off the ladder', statusRank(STATUS.DECLINED) === 99);

  t('legacy open head normalises', normalizeStatus('open') === STATUS.ACCEPTED);
  t('legacy open head with rounds is in progress', normalizeStatus('open', 3) === STATUS.IN_PROGRESS);
  t('legacy accepted head normalises to accepted price', normalizeStatus('accepted') === STATUS.AGREED);
  t('legacy rejected head normalises to declined', normalizeStatus('rejected') === STATUS.DECLINED);

  t('offer moves the thread to in-progress', applyRound({ status: STATUS.ACCEPTED }, { kind: 'offer', totalPaise: 10 }).status === STATUS.IN_PROGRESS);
  t('a counter re-opens an agreed thread', applyRound({ status: STATUS.AGREED, currentTotalPaise: 10 }, { kind: 'counter', totalPaise: 11 }).status === STATUS.IN_PROGRESS);

  const acc = applyRound({ status: STATUS.IN_PROGRESS, currentTotalPaise: 11 }, { kind: 'accept' });
  t('accept moves to accepted-final-price at the table figure', acc.status === STATUS.AGREED && acc.currentTotalPaise === 11);
  t('accept does NOT close the thread', isClosed(acc.status) === false);
  t('accept may restate an explicit figure', applyRound({ status: STATUS.IN_PROGRESS, currentTotalPaise: 99 }, { kind: 'accept', totalPaise: 12 }).currentTotalPaise === 12);
  t('accept with nothing on the table refused', applyRound({ status: STATUS.ACCEPTED, currentTotalPaise: null }, { kind: 'accept' }).ok === false);

  t('reject declines', applyRound({ status: STATUS.IN_PROGRESS, currentTotalPaise: 5 }, { kind: 'reject' }).status === STATUS.DECLINED);
  t('withdraw declines', applyRound({ status: STATUS.IN_PROGRESS, currentTotalPaise: 5 }, { kind: 'withdraw' }).status === STATUS.DECLINED);
  t('decline is closed', isClosed(STATUS.DECLINED) === true);

  t('approve refused before a price is accepted', applyRound({ status: STATUS.IN_PROGRESS, currentTotalPaise: 11 }, { kind: 'approve' }).ok === false);
  t('approve refused when the request is still pending', applyRound({ status: STATUS.PENDING, currentTotalPaise: 11 }, { kind: 'approve' }).ok === false);
  const ap = applyRound({ status: STATUS.AGREED, currentTotalPaise: 42 }, { kind: 'approve' });
  t('approve closes at the accepted price', ap.status === STATUS.DEAL && ap.currentTotalPaise === 42);
  t('deal is closed', isClosed(STATUS.DEAL) === true);

  t('no rounds after approval', applyRound({ status: STATUS.DEAL }, { kind: 'offer', totalPaise: 1 }).ok === false);
  t('no rounds after decline', applyRound({ status: STATUS.DECLINED }, { kind: 'accept' }).ok === false);
  t('legacy accepted head can still be approved', applyRound({ status: 'accepted', currentTotalPaise: 7 }, { kind: 'approve' }).status === STATUS.DEAL);

  t('negotiable only after staff accept', isNegotiable(STATUS.PENDING) === false && isNegotiable(STATUS.ACCEPTED) === true);
  t('negotiable through the agreed rung', isNegotiable(STATUS.IN_PROGRESS) && isNegotiable(STATUS.AGREED));
  t('not negotiable once closed', isNegotiable(STATUS.DEAL) === false && isNegotiable(STATUS.DECLINED) === false);
}

// ── 5. Store: schema, order read, lifecycle, tokens ──────────────────────────
{
  const { env, db } = makeEnv();
  await ensureNegotiationSchema(env);

  seedOrder(db, { id: 'B-ABC123', lines: [{ category: 'servers', details: 'Dell R740', quantity: 2, pricePaise: 4500000 }] });
  seedOrder(db, { id: 'S-SELL99', intent: 'sell', email: 'buyer@example.com', lines: [{ category: 'laptops', details: 'ThinkPad', quantity: 1, pricePaise: 900000 }] });
  seedOrder(db, { id: 'B-OTHER1', email: 'someone.else@example.com' });

  const order = await getOrderById(env, 'b-abc123');
  t('order read is case-insensitive', order && order.id === 'B-ABC123');
  t('order products parsed', Array.isArray(order.products) && order.products.length === 1);

  const neg = await findOrCreateNegotiation(env, order);
  t('thread opens on the first rung', neg.status === STATUS.ACCEPTED && neg.price_version === 0 && neg.buyer_email === 'buyer@example.com');
  t('opening mirrors the rung onto the order', db.prepare('SELECT status FROM returns WHERE id = ?').get('B-ABC123').status === STATUS.ACCEPTED);

  const again = await findOrCreateNegotiation(env, order);
  t('a live thread is reused', again.id === neg.id);
  t('a Pending order with a thread is healed onto the rung', (await getOrderById(env, 'B-ABC123')).status === STATUS.ACCEPTED);

  // Buyer offers, freezing the v0 baseline.
  const buyerOffer = validateRound({ side: 'buyer', kind: 'offer', totalPaise: 8000000 }).value;
  const snap0 = capturePriceSnapshot(order);
  const st1 = applyRound({ status: neg.status, currentTotalPaise: null }, buyerOffer);
  await appendRound(env, neg, buyerOffer, snap0, order.email, st1);

  // Staff counters.
  const staffCounter = validateRound({ side: 'staff', kind: 'counter', totalPaise: 8500000 }).value;
  const st2 = applyRound({ status: st1.status, currentTotalPaise: st1.currentTotalPaise }, staffCounter);
  await appendRound(env, neg, staffCounter, snap0, 'staff@netamps.com', st2);

  let rounds = await readRounds(env, neg.id);
  t('two rounds persisted in order', rounds.length === 2 && rounds[0].seq === 1 && rounds[1].seq === 2);
  t('round freezes the price it was made against', rounds[0].price_version === 0 && rounds[0].price_total_paise === 9000000);
  t('staff round records the actor', rounds[1].actor_email === 'staff@netamps.com');
  t('a round advances the order to in-progress', db.prepare('SELECT status FROM returns WHERE id = ?').get('B-ABC123').status === STATUS.IN_PROGRESS);

  let head = await readNegotiation(env, neg.id);
  t('negotiation head tracks latest amount', head.current_total_paise === 8500000 && head.status === STATUS.IN_PROGRESS);

  // The order is later priced at a DIFFERENT total → the thread is stale.
  db.prepare('UPDATE returns SET finalPrice = ? WHERE id = ?').run(JSON.stringify({ version: 1, basis: 'negotiated', totalPaise: 8550000, manifestHashAtApproval: null }), 'B-ABC123');
  const approvedOrder = await getOrderById(env, 'B-ABC123');
  rounds = await readRounds(env, neg.id);
  const summary = summarize(head, rounds, approvedOrder);
  t('thread is flagged stale after a re-priced order', summary.stale === true);
  t('summary exposes the current frozen price', summary.current.version === 1 && summary.current.totalPaise === 8550000);

  // Accept → "Accepted Final Price": an AGREEMENT, not a closure.
  const accept = validateRound({ side: 'staff', kind: 'accept', totalPaise: 8600000 }).value;
  const st3 = applyRound({ status: head.status, currentTotalPaise: head.current_total_paise }, accept);
  await appendRound(env, neg, accept, capturePriceSnapshot(approvedOrder), 'staff@netamps.com', st3);
  head = await readNegotiation(env, neg.id);
  t('accept moves to accepted-final-price', head.status === STATUS.AGREED);
  t('the thread is still open after accepting', (await findOrCreateNegotiation(env, approvedOrder)).id === neg.id);
  t('the order shows accepted-final-price too', db.prepare('SELECT status FROM returns WHERE id = ?').get('B-ABC123').status === STATUS.AGREED);

  // The ONE closing action: freeze the price + mirror the rung + ONE audit row.
  const snapshot = capturePriceSnapshot(await getOrderById(env, 'B-ABC123'));
  const approve = validateRound({ side: 'staff', kind: 'approve' }).value;
  const st4 = applyRound({ status: head.status, currentTotalPaise: head.current_total_paise }, approve);
  const dealOrder = await getOrderById(env, 'B-ABC123');
  const finalSnap = await finalizeDeal(env, { order: dealOrder, totalPaise: st4.currentTotalPaise, actor: 'staff@netamps.com' });
  await appendRound(env, neg, approve, snapshot, 'staff@netamps.com', st4);
  head = await readNegotiation(env, neg.id);
  t('approve closes the thread', head.status === STATUS.DEAL);
  t('the order is deal-approved', db.prepare('SELECT status FROM returns WHERE id = ?').get('B-ABC123').status === STATUS.DEAL);
  t('final snapshot freezes the agreed total at a new version', finalSnap.version === 2 && finalSnap.totalPaise === 8600000 && finalSnap.basis === 'negotiated');

  const history = db.prepare('SELECT product_id, old_paise, new_paise, actor FROM price_history WHERE request_id = ?').all('B-ABC123');
  t('exactly ONE permanent price row — the final price', history.length === 1);
  t('the row is previous-final → agreed-total', history[0].old_paise === 8550000 && history[0].new_paise === 8600000);
  t('the row is order-level, not per-line', history[0].product_id === null);
  t('the row carries the deciding actor', history[0].actor === 'staff@netamps.com');

  // A deal-approved order can never be reopened — only a new thread on an
  // order still on the ladder.
  let threw = null;
  try { await findOrCreateNegotiation(env, await getOrderById(env, 'B-ABC123')); } catch (e) { threw = e; }
  t('a deal-approved order refuses a new thread', threw && threw.code === 'ORDER_CLOSED');

  const second = await findOrCreateNegotiation(env, await getOrderById(env, 'S-SELL99'));
  t('a closed thread is not reused — a new order opens its own', second.id !== neg.id);

  const openList = await listNegotiations(env, { status: 'open' });
  t('list filters to live threads', openList.length === 1 && openList[0].id === second.id);
  const agreedList = await listNegotiations(env, { status: 'agreed' });
  t('agreed filter is empty once approved', agreedList.length === 0);
  const dealList = await listNegotiations(env, { status: 'deal' });
  t('deal filter finds the closed thread', dealList.length === 1 && dealList[0].id === neg.id);
  const unknownList = await listNegotiations(env, { status: 'nonsense' });
  t('an unknown filter never widens to everything', unknownList.length === 1 && unknownList[0].id === second.id);
  const allList = await listNegotiations(env, { status: 'all' });
  t('list all returns history', allList.length === 2);
  const forOrder = await listNegotiationsForOrder(env, 'B-ABC123');
  t('per-order list returns the threads for that order', forOrder.length === 1);

  // Email-scoped buyer tokens.
  const { token } = await mintBuyerToken(env, { email: 'BUYER@example.com' });
  const sess = await verifyBuyerToken(env, token);
  t('minted token verifies to its email', sess && sess.email === 'buyer@example.com');
  t('unknown token rejected', (await verifyBuyerToken(env, 'deadbeef')) === null);

  await env.DB.prepare('INSERT INTO buyer_tokens (token, email, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)')
    .bind('expiredtoken', 'buyer@example.com', new Date(Date.now() - 1000).toISOString(), new Date().toISOString()).run();
  t('expired token rejected', (await verifyBuyerToken(env, 'expiredtoken')) === null);

  // One email → every order filed under it, nothing else.
  const mine = await listOrdersByEmail(env, 'Buyer@Example.com');
  t('orders listed by email, case-insensitively', mine.length === 2 && mine.some(o => o.id === 'B-ABC123') && mine.some(o => o.id === 'S-SELL99'));
  const theirs = await listOrdersByEmail(env, 'someone.else@example.com');
  t('another buyer sees only their own', theirs.length === 1 && theirs[0].id === 'B-OTHER1');
  t('an address with no orders returns none', (await listOrdersByEmail(env, 'nobody@example.com')).length === 0);
  t('a blank address never matches everything', (await listOrdersByEmail(env, '')).length === 0);

  // setOrderStatus is best-effort and never throws on an unknown order.
  await setOrderStatus(env, 'B-NOPE', STATUS.DECLINED);
  t('setting a missing order status is harmless', true);

  // serializeOrderRow handles snake/alt casing from D1.
  const mapped = serializeOrderRow({ id: 'X', products: '[]', attachedfiles: '[]', pricingbasis: 'lot', lotconsiderationpaise: 5, finalprice: JSON.stringify({ version: 1, totalPaise: 5 }) });
  t('serialize handles alternate column casing', mapped.pricingBasis === 'lot' && mapped.lotConsiderationPaise === 5 && mapped.finalPrice.version === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
