/**
 * Harness for the price-negotiation feature.
 *
 * Exercises the ACTUAL modules (core.mjs + store.mjs) against real SQLite via
 * node:sqlite — not a stub. Covers the price-version freeze, the staleness
 * guard, the total state machine, buyer/staff verb separation, thread
 * persistence and order-access tokens.
 *
 * Run: node scripts/test-negotiate.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import {
  validateRound, applyRound, capturePriceSnapshot, isStale, summarize,
  orderBaselinePaise, STATUS, MAX_NOTE, MAX_CONSIDERATION_PAISE
} from '../functions/api/negotiate/core.mjs';
import {
  ensureNegotiationSchema, getOrderById, serializeOrderRow, findOrCreateNegotiation,
  appendRound, readRounds, readNegotiation, listNegotiations, listNegotiationsForOrder,
  mintOrderToken, verifyOrderToken
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

function seedOrder(db, { id, intent = 'buy', email = 'buyer@example.com', lines = [{ category: 'servers', details: 'Dell R740', quantity: 2, pricePaise: 4500000 }], finalPrice = null, pricingBasis = 'per_product', lotConsiderationPaise = null, manifest = null }) {
  db.prepare(
    'INSERT INTO returns (id, intent, name, company, email, phone, products, attachedFiles, date, status, pricingBasis, lotConsiderationPaise, manifest, finalPrice) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(id, intent, 'Buyer', 'Acme', email, '9999999999', JSON.stringify(lines), '[]', new Date().toISOString(), 'Pending', pricingBasis, lotConsiderationPaise, manifest ? JSON.stringify(manifest) : null, finalPrice ? JSON.stringify(finalPrice) : null);
}

// ── 1. Round validation: verbs per side, amounts, notes ──────────────────────
{
  t('buyer may offer', validateRound({ side: 'buyer', kind: 'offer', totalPaise: 100 }).ok === true);
  t('buyer may not reject', validateRound({ side: 'buyer', kind: 'reject' }).ok === false);
  t('staff may offer (opens seller side)', validateRound({ side: 'staff', kind: 'offer', totalPaise: 100 }).ok === true);
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

// ── 4. State machine ─────────────────────────────────────────────────────────
{
  t('offer keeps thread open', applyRound({ status: 'open' }, { kind: 'offer', totalPaise: 10 }).status === STATUS.OPEN);
  t('counter keeps thread open', applyRound({ status: 'open' }, { kind: 'counter', totalPaise: 11 }).status === STATUS.OPEN);
  const acc = applyRound({ status: 'open' }, { kind: 'accept', totalPaise: 12 });
  t('accept closes accepted at the amount', acc.status === STATUS.ACCEPTED && acc.currentTotalPaise === 12);
  t('reject closes rejected', applyRound({ status: 'open' }, { kind: 'reject' }).status === STATUS.REJECTED);
  t('withdraw closes withdrawn', applyRound({ status: 'open' }, { kind: 'withdraw' }).status === STATUS.WITHDRAWN);
  t('no rounds after close', applyRound({ status: 'accepted' }, { kind: 'offer', totalPaise: 1 }).ok === false);
}

// ── 5. Store: schema, order read, lifecycle, tokens ──────────────────────────
{
  const { env, db } = makeEnv();
  await ensureNegotiationSchema(env);

  seedOrder(db, { id: 'B-ABC123', lines: [{ category: 'servers', details: 'Dell R740', quantity: 2, pricePaise: 4500000 }] });
  const order = await getOrderById(env, 'b-abc123');
  t('order read is case-insensitive', order && order.id === 'B-ABC123');
  t('order products parsed', Array.isArray(order.products) && order.products.length === 1);

  const neg = await findOrCreateNegotiation(env, order);
  t('negotiation opens against v0', neg.status === 'open' && neg.price_version === 0 && neg.buyer_email === 'buyer@example.com');

  const again = await findOrCreateNegotiation(env, order);
  t('open negotiation is reused', again.id === neg.id);

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

  let head = await readNegotiation(env, neg.id);
  t('negotiation head tracks latest amount', head.current_total_paise === 8500000 && head.status === 'open');

  // The order is later approved at a DIFFERENT total → the thread is stale.
  db.prepare('UPDATE returns SET finalPrice = ? WHERE id = ?').run(JSON.stringify({ version: 1, basis: 'negotiated', totalPaise: 8600000, manifestHashAtApproval: null }), 'B-ABC123');
  const approvedOrder = await getOrderById(env, 'B-ABC123');
  rounds = await readRounds(env, neg.id);
  const summary = summarize(head, rounds, approvedOrder);
  t('thread is flagged stale after a re-priced order', summary.stale === true);
  t('summary exposes the current frozen price', summary.current.version === 1 && summary.current.totalPaise === 8600000);

  // Accept closes the thread; a fresh negotiation then opens on new activity.
  const accept = validateRound({ side: 'staff', kind: 'accept', totalPaise: 8600000 }).value;
  const st3 = applyRound({ status: head.status, currentTotalPaise: head.current_total_paise }, accept);
  await appendRound(env, neg, accept, capturePriceSnapshot(approvedOrder), 'staff@netamps.com', st3);
  head = await readNegotiation(env, neg.id);
  t('thread closes on accept', head.status === 'accepted');

  const reopened = await findOrCreateNegotiation(env, approvedOrder);
  t('a closed thread is not reused — a new one opens', reopened.id !== neg.id);

  const openList = await listNegotiations(env, { status: 'open' });
  t('list filters to open threads', openList.length === 1 && openList[0].id === reopened.id);
  const allList = await listNegotiations(env, { status: 'all' });
  t('list all returns history', allList.length === 2);
  const forOrder = await listNegotiationsForOrder(env, 'B-ABC123');
  t('per-order list returns both threads', forOrder.length === 2);

  // Order-access tokens.
  const { token } = await mintOrderToken(env, { requestId: 'B-ABC123', email: 'BUYER@example.com' });
  const sess = await verifyOrderToken(env, token);
  t('minted token verifies to its order', sess && sess.requestId === 'B-ABC123' && sess.email === 'buyer@example.com');
  t('unknown token rejected', (await verifyOrderToken(env, 'deadbeef')) === null);

  // Expired token rejected + swept.
  await env.DB.prepare('INSERT INTO order_access_tokens (token, request_id, email, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind('expiredtoken', 'B-ABC123', 'buyer@example.com', new Date(Date.now() - 1000).toISOString(), new Date().toISOString()).run();
  t('expired token rejected', (await verifyOrderToken(env, 'expiredtoken')) === null);

  // serializeOrderRow handles snake/alt casing from D1.
  const mapped = serializeOrderRow({ id: 'X', products: '[]', attachedfiles: '[]', pricingbasis: 'lot', lotconsiderationpaise: 5, finalprice: JSON.stringify({ version: 1, totalPaise: 5 }) });
  t('serialize handles alternate column casing', mapped.pricingBasis === 'lot' && mapped.lotConsiderationPaise === 5 && mapped.finalPrice.version === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
