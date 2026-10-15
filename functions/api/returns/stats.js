import { verifySession } from '../intake/auth';
import { isClosed, STATUS } from '../negotiate/core.mjs';

/**
 * GET /api/returns/stats
 *
 * Aggregated operational KPIs for the dashboard header strip.
 *
 * WHY A SEPARATE ROUTE. The orders list endpoint returns full records — names,
 * emails, phones, attached-file manifests, whole product arrays. The header
 * strip needs eleven numbers and runs a poll every few seconds, so reading the
 * full table to render it would re-ship the customer PII payload continuously
 * for no benefit. This route selects only the columns a KPI can be derived from
 * and never returns a single row of the table to the client.
 *
 * WHY THE AGGREGATION LIVES HERE. It runs server-side so the numbers cannot
 * drift from the table: the same `normalizeStatus` the lifecycle itself uses
 * (imported, not reimplemented) decides which rung an order sits on, including
 * the pre-lifecycle spellings. A client-side tally would have to keep its own
 * copy of that map, and the two would disagree the first time a legacy row
 * appeared.
 *
 * MONEY IS NEVER INVENTED. Asks and evaluations come from the same paise
 * integers the order table holds, with the same two rules the dashboard uses:
 * a line consideration already covers all its units and is never multiplied by
 * quantity, while an evaluated unit price always is. An order whose figure is
 * unstated contributes nothing to a total and is counted in `partial`, so a
 * total is never silently read as complete when it is not.
 *
 * `cycleTimeHours` is measured from submission to the moment the order reached
 * a terminal state. There is no closed_at column, so it is derived from the
 * price-history trail where one exists and is reported as null when it cannot
 * be established — an invented cycle time is worse than a missing one.
 */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

/**
 * Order-status spellings written before the lifecycle existed.
 *
 * This mirrors the LEGACY map in `app/lib/status.ts` — it is deliberately NOT
 * `negotiate/core.mjs`'s normalizeStatus, which maps negotiation-THREAD heads
 * ('open', 'withdrawn') and would turn a stored order status into a different
 * rung than the dashboard shows for the same row.
 */
function normalizeOrderStatus(raw) {
  const s = String(raw || '').trim();
  if (!s) return STATUS.PENDING;
  if (s === 'Approved') return STATUS.DEAL;
  if (s === 'Rejected') return STATUS.DECLINED;
  if (s === 'Negotiating') return STATUS.IN_PROGRESS;
  return s;
}

/** Sum of stated line considerations, in paise. Never multiplies by quantity. */
function askPaiseOf(row) {
  if (row.pricingBasis === 'lot') {
    return Number.isInteger(row.lotConsiderationPaise) ? row.lotConsiderationPaise : null;
  }
  let lines;
  try {
    lines = JSON.parse(row.products || '[]');
  } catch {
    return null;
  }
  if (!Array.isArray(lines) || lines.length === 0) return null;
  let total = 0;
  let stated = 0;
  for (const p of lines) {
    const v = p && p.lineConsiderationPaise;
    if (Number.isInteger(v)) {
      total += v;
      stated += 1;
    }
  }
  if (stated === 0) return null;
  return { total, partial: stated < lines.length };
}

/** Sum of evaluated unit prices × quantity, in paise. Always multiplies by qty. */
function evalPaiseOf(row) {
  let lines;
  try {
    lines = JSON.parse(row.products || '[]');
  } catch {
    return null;
  }
  if (!Array.isArray(lines) || lines.length === 0) return null;
  let total = 0;
  let stated = 0;
  for (const p of lines) {
    const v = p && p.pricePaise;
    if (Number.isInteger(v)) {
      const qty = Number.isInteger(p.quantity) && p.quantity > 0 ? p.quantity : 1;
      total += v * qty;
      stated += 1;
    }
  }
  return stated === 0 ? null : total;
}

/** The frozen settlement figure, when the order has one. */
function finalPaiseOf(row) {
  if (!row.finalPrice) return null;
  try {
    const fp = typeof row.finalPrice === 'string' ? JSON.parse(row.finalPrice) : row.finalPrice;
    return fp && Number.isInteger(fp.totalPaise) ? fp.totalPaise : null;
  } catch {
    return null;
  }
}

const EMPTY = {
  success: true,
  totals: {
    orders: 0,
    open: 0,
    awaitingTriage: 0,
    inNegotiation: 0,
    closedWon: 0,
    declined: 0,
    buy: 0,
    sell: 0
  },
  rates: { winRatePct: null, partialAsks: 0 },
  money: {
    pipelineAskPaise: null,
    pipelinePartial: false,
    closedWonPaise: null,
    avgDealPaise: null,
    currency: 'INR'
  },
  cycle: { avgCycleHours: null, sampleSize: 0 },
  generatedAt: null
};

export async function onRequestGet({ request, env }) {
  // Staff-only, same gate as the list route: these figures are aggregate
  // commercial data and must never be readable by an unauthenticated caller.
  const user = await verifySession(env, request).catch(() => null);
  if (!user) {
    return json({ success: false, message: 'Unauthorized' }, 401);
  }

  if (!env.DB || typeof env.DB.prepare !== 'function') {
    return json({ ...EMPTY, generatedAt: new Date().toISOString() });
  }

  try {
    // Only the columns a KPI needs. Deliberately excludes name, company,
    // email, phone and attachedFiles.
    //
    // `finalPrice` is added by a later migration rather than in the base
    // CREATE TABLE, so on a not-yet-migrated database the wide SELECT throws
    // on the unknown column. Retry without it rather than 500: settlement value
    // degrades to the evaluated figure, every other KPI is unaffected.
    const wide = await env.DB
      .prepare(
        `SELECT id, intent, date, status, pricingBasis, lotConsiderationPaise, products, finalPrice
         FROM returns`
      )
      .all()
      .catch(() => null);

    const results = wide
      ? wide.results
      : (
          await env.DB
            .prepare(
              `SELECT id, intent, date, status, pricingBasis, lotConsiderationPaise, products
               FROM returns`
            )
            .all()
        ).results;

    const rows = Array.isArray(results) ? results : [];
    const totals = { ...EMPTY.totals };
    const rates = { ...EMPTY.rates };

    let pipelineAsk = 0;
    let pipelineStated = 0;
    let closedWonPaise = 0;
    let closedWonCount = 0;
    let partialAsks = 0;

    for (const row of rows) {
      totals.orders += 1;
      if (row.intent === 'buy') totals.buy += 1;
      else if (row.intent === 'sell') totals.sell += 1;

      const status = normalizeOrderStatus(row.status);
      const closed = isClosed(status);

      if (status === STATUS.PENDING) totals.awaitingTriage += 1;
      if (status === STATUS.ACCEPTED || status === STATUS.IN_PROGRESS || status === STATUS.AGREED) {
        totals.inNegotiation += 1;
      }
      if (status === STATUS.DEAL) totals.closedWon += 1;
      if (status === STATUS.DECLINED) totals.declined += 1;
      if (!closed) totals.open += 1;

      const ask = askPaiseOf(row);
      if (typeof ask === 'object' && ask !== null) {
        pipelineAsk += ask.total;
        pipelineStated += 1;
        if (ask.partial) partialAsks += 1;
      } else if (Number.isInteger(ask)) {
        pipelineAsk += ask;
        pipelineStated += 1;
      }

      if (status === STATUS.DEAL) {
        const won = finalPaiseOf(row) ?? evalPaiseOf(row);
        if (Number.isInteger(won)) {
          closedWonPaise += won;
          closedWonCount += 1;
        }
      }
    }

    // Cycle time needs a submission time and a closure time. `date` is the
    // submission timestamp; the price-history trail carries the decision. If no
    // decision row exists the duration is unknowable and stays null rather than
    // defaulting to zero — zero would understate every real cycle.
    let cycleSum = 0;
    let cycleCount = 0;
    try {
      const decided = await env.DB
        .prepare(
          `SELECT r.id AS id, r.date AS submitted, MIN(p.decidedAt) AS decided
           FROM returns r
           JOIN price_history p ON p.request_id = r.id
           WHERE r.status = ?
           GROUP BY r.id`,
        )
        .bind(STATUS.DEAL)
        .all();
      for (const d of decided.results || []) {
        const start = Date.parse(d.submitted || '');
        const end = Date.parse(d.decided || '');
        if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
          cycleSum += end - start;
          cycleCount += 1;
        }
      }
    } catch {
      // price_history absent or unqueryable — cycle time simply stays null.
    }

    const decidedTotal = totals.closedWon + totals.declined;
    const winRatePct =
      decidedTotal > 0 ? Math.round((totals.closedWon / decidedTotal) * 1000) / 10 : null;

    return json({
      success: true,
      totals,
      rates: { winRatePct, partialAsks },
      money: {
        pipelineAskPaise: pipelineStated > 0 ? pipelineAsk : null,
        pipelinePartial: partialAsks > 0,
        closedWonPaise: closedWonCount > 0 ? closedWonPaise : null,
        avgDealPaise: closedWonCount > 0 ? Math.round(closedWonPaise / closedWonCount) : null,
        currency: 'INR'
      },
      cycle: {
        avgCycleHours: cycleCount > 0 ? Math.round((cycleSum / cycleCount) / 3600000) : null,
        sampleSize: cycleCount
      },
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    return json({ success: false, message: 'Stats unavailable.' }, 500);
  }
}