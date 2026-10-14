/**
 * Harness for the append-only audit substrate: the order timeline and the
 * per-order email ledger.
 *
 * Exercises the ACTUAL modules against real SQLite via node:sqlite. What it
 * protects is the property every screen in this feature depends on — rows are
 * only ever added, sequence numbers are unique and ordered, and a count is a
 * count of real records rather than of whatever a mutable column currently
 * says.
 *
 * Run: node scripts/test-audit.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import {
  appendOrderEvent, readOrderEvents, readOrderEventsFor, deriveLadder,
  resetOrderEventsMemo, EVENT_KINDS
} from '../functions/api/audit/order-events.mjs';
import {
  logOrderEmail, readOrderEmails, summarizeOrderEmails,
  resetOrderEmailsMemo, EMAIL_CAUSES, EMAIL_OUTCOMES
} from '../functions/api/audit/order-emails.mjs';

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
    async batch(stmts) { return stmts; },
  };
  return { env: { DB: adapter }, db };
}

// ── 1. Append-only timeline ────────────────────────────────────────────────
{
  resetOrderEventsMemo();
  const { env, db } = makeEnv();

  const a = await appendOrderEvent(env, { requestId: 'B-T1', kind: 'created', rung: 'Pending', actor: 'buyer@example.com', detail: { intent: 'buy' } });
  const b = await appendOrderEvent(env, { requestId: 'B-T1', kind: 'accepted', rung: 'Order Accepted for Negotiation', actor: 'staff@netamps.com' });
  const c = await appendOrderEvent(env, { requestId: 'B-T1', kind: 'round', rung: 'Negotiation in Progress', actor: 'buyer@example.com', detail: { verb: 'offer', totalPaise: 8000000 } });
  const d = await appendOrderEvent(env, { requestId: 'B-T1', kind: 'round', rung: 'Accepted Final Price', actor: 'staff@netamps.com', detail: { verb: 'accept' } });
  const e = await appendOrderEvent(env, { requestId: 'B-T1', kind: 'round', rung: 'Order Deal Approved', actor: 'staff@netamps.com', detail: { verb: 'approve' } });

  t('every append succeeds', [a, b, c, d, e].every((r) => r.ok === true));
  t('sequence numbers increase strictly per order',
    a.seq === 1 && b.seq === 2 && c.seq === 3 && d.seq === 4 && e.seq === 5);

  const rows = await readOrderEvents(env, 'B-T1');
  t('events read back oldest first', rows.length === 5 && rows[0].seq === 1 && rows[4].seq === 5);
  t('detail survives as structured data', rows[2].detail.verb === 'offer' && rows[2].detail.totalPaise === 8000000);
  t('the actor is recorded', rows[1].actor === 'staff@netamps.com');
  t('every event carries a timestamp', rows.every((r) => typeof r.at === 'string' && r.at.length > 10));

  const other = await appendOrderEvent(env, { requestId: 'B-T2', kind: 'created', rung: 'Pending' });
  t('sequences are scoped per order, not global', other.seq === 1);
  t('reading one order never leaks another', (await readOrderEvents(env, 'B-T1')).length === 5);

  // An unknown kind is refused outright — a typo must not become a rung.
  const bad = await appendOrderEvent(env, { requestId: 'B-T1', kind: 'aprove', rung: 'Order Deal Approved' });
  t('an unknown event kind is refused', bad.ok === false);
  t('a refused append writes nothing', (await readOrderEvents(env, 'B-T1')).length === 5);
  t('the vocabulary is closed', EVENT_KINDS.includes('created') && !EVENT_KINDS.includes('aprove'));

  // APPEND-ONLY: the contract every consumer relies on. Assert it against the
  // table itself so a future "just fix that row" edit fails loudly here.
  const before = db.prepare('SELECT COUNT(*) AS n FROM order_events').get().n;
  await appendOrderEvent(env, { requestId: 'B-T1', kind: 'reconciled', rung: 'Negotiation in Progress', actor: 'system', detail: { from: 'Pending' } });
  const after = db.prepare('SELECT COUNT(*) AS n FROM order_events').get().n;
  t('growth is by insertion only', after === before + 1);

  // Sequence uniqueness is enforced by the schema, not by hoping.
  let uniqueBlocked = false;
  try {
    db.prepare('INSERT INTO order_events (id, request_id, seq, kind, rung, actor, detail, at) VALUES (?,?,?,?,?,?,?,?)')
      .run('dup-id', 'B-T1', 1, 'created', 'Pending', null, null, new Date().toISOString());
  } catch { uniqueBlocked = true; }
  t('a duplicate (order, seq) is rejected by the index', uniqueBlocked);

  // Batch read for the monitor list.
  const batched = await readOrderEventsFor(env, ['B-T1', 'B-T2', 'B-MISSING']);
  t('batch read returns every requested order', batched.has('B-T1') && batched.has('B-T2'));
  t('a missing order yields an empty list, not an error', Array.isArray(batched.get('B-MISSING')) && batched.get('B-MISSING').length === 0);
  t('batch read preserves ordering', batched.get('B-T1').every((r, i, arr) => i === 0 || arr[i - 1].seq < r.seq));
  const many = Array.from({ length: 60 }, (_, i) => `B-CHUNK-${i}`);
  await appendOrderEvent(env, { requestId: 'B-CHUNK-0', kind: 'created', rung: 'Pending' });
  const chunked = await readOrderEventsFor(env, many);
  t('60 ids read back (IN clause is chunked under the D1 parameter cap)',
    chunked.size === 60 && chunked.get('B-CHUNK-0').length === 1);
}

// ── 2. The ladder derives from history, not from a column ──────────────────
{
  const rungs = deriveLadder([
    { seq: 1, kind: 'created', rung: 'Pending', actor: 'a@x.com', at: '2026-01-01T10:00:00Z' },
    { seq: 2, kind: 'accepted', rung: 'Order Accepted for Negotiation', actor: 's@x.com', at: '2026-01-02T10:00:00Z' },
    { seq: 3, kind: 'round', rung: 'Negotiation in Progress', actor: 'a@x.com', at: '2026-01-03T10:00:00Z' },
    { seq: 4, kind: 'round', rung: 'Negotiation in Progress', actor: 's@x.com', at: '2026-01-04T10:00:00Z' },
    { seq: 5, kind: 'round', rung: 'Accepted Final Price', actor: 's@x.com', at: '2026-01-05T10:00:00Z' },
    { seq: 6, kind: 'round', rung: 'Order Deal Approved', actor: 's@x.com', at: '2026-01-06T10:00:00Z' }
  ], 'Order Deal Approved');

  t('the ladder follows chronological order', rungs.map((r) => r.rung).join('|') ===
    'Pending|Order Accepted for Negotiation|Negotiation in Progress|Accepted Final Price|Order Deal Approved');
  t('each rung carries the time it was FIRST reached', rungs[3].at === '2026-01-05T10:00:00Z');
  t('a repeated rung is counted, not duplicated',
    rungs[2].touches === 2 && rungs[2].lastAt === '2026-01-04T10:00:00Z');
  t('the last entry is the current position',
    rungs[rungs.length - 1].rung === 'Order Deal Approved');

  const empty = deriveLadder([], 'Negotiation in Progress');
  t('an unrecorded order still renders a rung from the order itself',
    empty.length === 1 && empty[0].rung === 'Negotiation in Progress' && empty[0].at === null);

  const noRun = deriveLadder([{ seq: 1, kind: 'reconciled', rung: null, at: 'x' }], null);
  t('events with no rung do not invent one', noRun.length === 0);
}

// ── 3. Per-order email ledger ──────────────────────────────────────────────
{
  resetOrderEmailsMemo();
  const { env, db } = makeEnv();

  const s1 = await logOrderEmail(env, {
    requestId: 'B-E1', intent: 'buy', cause: 'order_confirmation', outcome: 'sent',
    recipient: 'buyer@example.com', subject: 'Your Netamps request B-E1 is recorded',
    messageId: 'msg_1', detail: 'accepted by provider'
  });
  const s2 = await logOrderEmail(env, {
    requestId: 'B-E1', intent: 'buy', cause: 'order_confirmation_resend', outcome: 'sent',
    recipient: 'buyer@example.com', subject: 'Your Netamps request B-E1 is recorded',
    messageId: 'msg_2', detail: 'accepted by provider'
  });
  const d1 = await logOrderEmail(env, {
    requestId: 'B-E1', cause: 'order_confirmation', outcome: 'delivered',
    recipient: 'buyer@example.com', messageId: 'msg_1', detail: { providerEvent: 'email.delivered' }
  });
  const f1 = await logOrderEmail(env, {
    requestId: 'B-E1', intent: 'buy', cause: 'staff_notification', outcome: 'failed',
    recipient: 'ops@netamps.com', detail: 'provider rejected the send (HTTP 422)'
  });

  t('sends and provider events all record', [s1, s2, d1, f1].every((r) => r.ok === true));

  const rows = await readOrderEmails(env, 'B-E1');
  t('the ledger holds four entries', rows.length === 4);
  t('newest first', rows[0].at >= rows[rows.length - 1].at);
  t('a delivery event does not overwrite the send it follows',
    rows.filter((r) => r.messageId === 'msg_1').length === 2);
  t('the failure keeps its specific cause', rows.some((r) => r.cause === 'staff_notification' && r.outcome === 'failed'));

  const counts = (await summarizeOrderEmails(env, ['B-E1', 'B-NOSEND'])).get('B-E1');
  t('count is a count of records', counts.total === 4);
  t('breakdown by cause', counts.byCause.order_confirmation === 2
    && counts.byCause.order_confirmation_resend === 1
    && counts.byCause.staff_notification === 1);
  t('breakdown by outcome', counts.byOutcome.sent === 2 && counts.byOutcome.delivered === 1 && counts.byOutcome.failed === 1);
  t('an order with no email still reports a zero, not undefined',
    (await summarizeOrderEmails(env, ['B-NOSEND'])).get('B-NOSEND').total === 0);

  // Closed vocabularies: a misspelt cause or outcome would silently split a
  // count, which is the exact failure this module exists to prevent.
  const badCause = await logOrderEmail(env, { requestId: 'B-E1', cause: 'confirmation email', outcome: 'sent' });
  t('an unknown cause is refused', badCause.ok === false);
  const badOutcome = await logOrderEmail(env, { requestId: 'B-E1', cause: 'order_confirmation', outcome: 'opened' });
  t('an unknown outcome is refused', badOutcome.ok === false);
  const noId = await logOrderEmail(env, { requestId: '', cause: 'order_confirmation', outcome: 'sent' });
  t('an email is never recorded without an order to attribute it to', noId.ok === false);
  t('refused entries were not written', (await readOrderEmails(env, 'B-E1')).length === 4);
  t('the cause vocabulary is the expected one',
    EMAIL_CAUSES.includes('order_confirmation') && EMAIL_CAUSES.includes('escalation') && !EMAIL_CAUSES.includes('confirmation email'));
  t('the outcome vocabulary is the expected one',
    EMAIL_OUTCOMES.includes('delivered') && EMAIL_OUTCOMES.includes('bounced') && !EMAIL_OUTCOMES.includes('opened'));

  // BUY and SELL both ledged — an escalation is an event on both sides.
  await logOrderEmail(env, { requestId: 'B-E1', intent: 'buy', cause: 'escalation', outcome: 'sent', recipient: 'sales@netamps.com' });
  await logOrderEmail(env, { requestId: 'S-E1', intent: 'sell', cause: 'escalation', outcome: 'sent', recipient: 'sales@netamps.com' });
  t('SELL orders are ledged too', (await readOrderEmails(env, 'S-E1')).length === 1);
  t('a BUY order and a SELL order count independently',
    (await summarizeOrderEmails(env, ['B-E1'])).get('B-E1').total === 5
    && (await summarizeOrderEmails(env, ['S-E1'])).get('S-E1').total === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
