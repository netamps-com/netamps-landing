/**
 * Exercises the stats aggregation against a fake D1 so the KPI maths is
 * verified, not assumed. Run: node --experimental-vm-modules tests/stats.test.mjs
 *
 * Deliberately covers the three things most likely to be wrong: the legacy
 * status spellings, the "never multiply a line consideration by quantity" rule,
 * and the difference between an unstated figure (—) and an explicit zero.
 */

import { onRequestGet } from '../functions/api/returns/stats.js';

const P = (paise) => paise;

/** Minimal D1 stand-in: only the two statements stats.js issues. */
function fakeDB(rows, priceHistory = []) {
  return {
    prepare(sql) {
      if (sql.includes('FROM returns') && !sql.includes('JOIN')) {
        return {
          bind: () => ({ all: async () => ({ results: rows }) }),
          all: async () => ({ results: rows })
        };
      }
      if (sql.includes('JOIN price_history')) {
        return {
          bind: () => ({ all: async () => ({ results: priceHistory }) })
        };
      }
      throw new Error('unexpected SQL: ' + sql);
    }
  };
}

async function run(rows, priceHistory = []) {
  const res = await onRequestGet({
    request: new Request('https://x.internal/api/returns/stats'),
    env: { DB: fakeDB(rows, priceHistory) }
  });
  return { status: res.status, body: await res.json() };
}

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

const line = (id, consider, qty = 1) => ({
  id,
  lineConsiderationPaise: consider,
  pricePaise: null,
  quantity: qty
});

// ── 1. Status ladder, including pre-lifecycle spellings ──────────────────
console.log('\nstatus normalisation');
{
  const { body } = await run([
    { id: 'S-1', intent: 'sell', date: '2026-10-01T00:00:00Z', status: 'Pending', products: '[]' },
    { id: 'S-2', intent: 'sell', date: '2026-10-01T00:00:00Z', status: 'Order Accepted for Negotiation', products: '[]' },
    { id: 'S-3', intent: 'sell', date: '2026-10-01T00:00:00Z', status: 'Negotiation in Progress', products: '[]' },
    { id: 'S-4', intent: 'sell', date: '2026-10-01T00:00:00Z', status: 'Accepted Final Price', products: '[]' },
    { id: 'S-5', intent: 'sell', date: '2026-10-01T00:00:00Z', status: 'Order Deal Approved', products: '[]' },
    { id: 'S-6', intent: 'sell', date: '2026-10-01T00:00:00Z', status: 'Declined', products: '[]' },
    // Legacy spellings must land on the same rungs as their modern equivalents.
    { id: 'S-7', intent: 'sell', date: '2026-10-01T00:00:00Z', status: 'Approved', products: '[]' },
    { id: 'S-8', intent: 'buy', date: '2026-10-01T00:00:00Z', status: 'Rejected', products: '[]' },
    { id: 'S-9', intent: 'buy', date: '2026-10-01T00:00:00Z', status: 'Negotiating', products: '[]' }
  ]);
  const t = body.totals;
  check('awaitingTriage = Pending only', t.awaitingTriage, 1);
  check('inNegotiation = accepted+in-progress+agreed', t.inNegotiation, 4);
  check('closedWon counts legacy Approved', t.closedWon, 2);
  check('declined counts legacy Rejected', t.declined, 2);
  check('open excludes the 4 closed', t.open, 5);
  check('win rate = 2 won / 4 decided', body.rates.winRatePct, 50);
}

// ── 2. Money rules ────────────────────────────────────────────────────────
console.log('\nmoney: line consideration is NEVER x quantity');
{
  const { body } = await run([
    {
      id: 'S-1', intent: 'sell', date: '2026-10-01T00:00:00Z', status: 'Pending',
      products: JSON.stringify([line('a', P(50000), 10), line('b', P(25000), 4)])
    }
  ]);
  check('50000 + 25000, qty ignored', body.money.pipelineAskPaise, 75000);
}
console.log('\nmoney: lot basis reads the lot column, not the lines');
{
  const { body } = await run([
    {
      id: 'S-1', intent: 'sell', date: '2026-10-01T00:00:00Z', status: 'Pending',
      pricingBasis: 'lot', lotConsiderationPaise: 999999,
      products: JSON.stringify([line('a', P(1), 99)])
    }
  ]);
  check('lot figure wins', body.money.pipelineAskPaise, 999999);
}
console.log('\nmoney: unstated is not zero');
{
  const { body } = await run([
    { id: 'S-1', intent: 'sell', date: '2026-10-01T00:00:00Z', status: 'Pending', products: JSON.stringify([{ id: 'a', quantity: 2 }]) }
  ]);
  check('no stated figure -> null, not 0', body.money.pipelineAskPaise, null);
}
console.log('\nmoney: an explicit zero IS a stated figure');
{
  const { body } = await run([
    {
      id: 'S-1', intent: 'sell', date: '2026-10-01T00:00:00Z', status: 'Pending',
      products: JSON.stringify([line('a', 0, 1)])
    }
  ]);
  check('stated zero is reported as 0', body.money.pipelineAskPaise, 0);
}
console.log('\nmoney: a partially-stated ask is flagged, not silently completed');
{
  const { body } = await run([
    {
      id: 'S-1', intent: 'sell', date: '2026-10-01T00:00:00Z', status: 'Pending',
      products: JSON.stringify([line('a', 10000, 1), { id: 'b', quantity: 1 }])
    }
  ]);
  check('partial flagged', body.money.pipelinePartial, true);
  check('stated half still totals', body.money.pipelineAskPaise, 10000);
}

// ── 3. Cycle time ─────────────────────────────────────────────────────────
console.log('\ncycle time');
{
  const submitted = '2026-10-01T00:00:00Z';
  const { body } = await run(
    [{ id: 'S-1', intent: 'sell', date: submitted, status: 'Order Deal Approved', products: '[]' }],
    [{ id: 'S-1', submitted, decided: '2026-10-03T12:00:00Z' }] // 60 hours
  );
  check('60 hours', body.cycle.avgCycleHours, 60);
  check('sample size reported', body.cycle.sampleSize, 1);
}
console.log('\ncycle time is null when no decision row exists');
{
  const { body } = await run([
    { id: 'S-1', intent: 'sell', date: '2026-10-01T00:00:00Z', status: 'Order Deal Approved', products: '[]' }
  ]);
  check('no sample -> null', body.cycle.avgCycleHours, null);
  check('no sample size', body.cycle.sampleSize, 0);
}

// ── 4. Closed-won value prefers the frozen settlement ─────────────────────
console.log('\nclosed-won value uses the frozen snapshot when present');
{
  const { body } = await run([
    {
      id: 'S-1', intent: 'sell', date: '2026-10-01T00:00:00Z', status: 'Order Deal Approved',
      products: JSON.stringify([{ id: 'a', pricePaise: 100000, quantity: 2 }]),
      finalPrice: JSON.stringify({ version: 1, totalPaise: 175000 })
    }
  ]);
  check('settlement beats evaluation', body.money.closedWonPaise, 175000);
  check('avg deal = settlement', body.money.avgDealPaise, 175000);
}
console.log('\nclosed-won value falls back to evaluation x qty');
{
  const { body } = await run([
    {
      id: 'S-1', intent: 'sell', date: '2026-10-01T00:00:00Z', status: 'Order Deal Approved',
      products: JSON.stringify([{ id: 'a', pricePaise: 100000, quantity: 2 }])
    }
  ]);
  check('evaluated unit x qty', body.money.closedWonPaise, 200000);
}

// ── 5. Fail-closed on auth ───────────────────────────────────────────────
console.log('\nunauthenticated callers are refused');
{
  const res = await onRequestGet({
    request: new Request('https://x.internal/api/returns/stats', { headers: { 'x-test-anon': '1' } }),
    env: { DB: fakeDB([]) }
  });
  check('401 without a session', res.status, 401);
}

console.log(failures === 0 ? '\nAll stats assertions passed.' : `\n${failures} assertion(s) failed.`);
process.exit(failures === 0 ? 0 : 1);