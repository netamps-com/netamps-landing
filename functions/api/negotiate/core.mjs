/**
 * Pure negotiation core — the single source of truth for price negotiation,
 * imported unchanged by:
 *   - functions/api/track/negotiate.js      (buyer side, order-token auth)
 *   - functions/api/negotiations.js         (staff/seller side, session auth)
 *   - scripts/test-negotiate.mjs            (Node harness over real SQLite)
 *
 * Doctrine (load-bearing):
 *  1. PRICE-VERSION CAPTURE. The price a party negotiates against is FROZEN at
 *     the instant they act. A round never re-derives a price; it records the
 *     exact snapshot the actor was shown, so a negotiation against a superseded
 *     price is *detectable* (staleness) instead of silently corrupt.
 *  2. NO FABRICATION. Amounts are integer paise. null = unstated, 0 = explicit
 *     zero, and the two are never conflated.
 *  3. THE STATE MACHINE IS TOTAL. Every verb is defined for every state and
 *     every side; an illegal verb returns a refusal, never a throw.
 */

export const MAX_CONSIDERATION_PAISE = 999999999900; // ₹99,99,99,999 cap (mirrors app/lib/money.ts)

export const KINDS = Object.freeze(['offer', 'counter', 'accept', 'reject', 'withdraw', 'approve']);
export const SIDES = Object.freeze(['buyer', 'staff']);

/**
 * THE ORDER/NEGOTIATION LIFECYCLE — one vocabulary shared by the order record,
 * the negotiation head, the buyer Track module and the staff monitor, so a
 * status phrase can never mean two different things in two places.
 *
 * The order is strictly chronological:
 *
 *   Pending → Order Accepted for Negotiation → Negotiation in Progress
 *           → Accepted Final Price           → Order Deal Approved
 *
 * `Declined` is the only other terminal state. Two rules are load-bearing:
 *  - only staff can move an order to "Order Accepted for Negotiation" and
 *    "Order Deal Approved";
 *  - NOTHING closes a negotiation except "Order Deal Approved" (or an explicit
 *    decline/withdraw). "Accepted Final Price" is an agreement, NOT a closure —
 *    the deal is only final when staff presses the one closing button.
 */
export const STATUS = Object.freeze({
  PENDING: 'Pending',
  ACCEPTED: 'Order Accepted for Negotiation',
  IN_PROGRESS: 'Negotiation in Progress',
  AGREED: 'Accepted Final Price',
  DEAL: 'Order Deal Approved',
  DECLINED: 'Declined'
});

/** The chronological ladder (Declined sits outside it by design). */
export const CHRONOLOGY = Object.freeze([
  STATUS.PENDING, STATUS.ACCEPTED, STATUS.IN_PROGRESS, STATUS.AGREED, STATUS.DEAL
]);

const CLOSED = new Set([STATUS.DEAL, STATUS.DECLINED]);

/** A closed negotiation accepts no further rounds, from either side. */
export function isClosed(status) {
  return CLOSED.has(status);
}

/** 0-based position on the ladder; anything off-ladder ranks 99 (Declined). */
export function statusRank(status) {
  const i = CHRONOLOGY.indexOf(status);
  return i === -1 ? 99 : i;
}

/**
 * Normalise a stored head onto the ladder. Rows written before the lifecycle
 * existed ('open'/'accepted'/'rejected'/'withdrawn') are mapped, never trusted:
 * a pre-existing thread keeps working instead of silently falling off it.
 * An 'open' head with rounds behind it is genuinely in progress.
 */
export function normalizeStatus(raw, roundCount = 0) {
  if (raw === 'open') return roundCount > 0 ? STATUS.IN_PROGRESS : STATUS.ACCEPTED;
  if (raw === 'accepted') return STATUS.AGREED;
  if (raw === 'rejected' || raw === 'withdrawn') return STATUS.DECLINED;
  if (raw === 'Approved') return STATUS.DEAL; // legacy order status
  return raw || STATUS.PENDING;
}

/** An order at this status may be opened / continue a negotiation thread. */
export function isNegotiable(status) {
  const s = normalizeStatus(status);
  return s === STATUS.ACCEPTED || s === STATUS.IN_PROGRESS || s === STATUS.AGREED;
}

export const MAX_NOTE = 500;

// Which verbs each side may use.
//  buyer  → proposes, counters, accepts what is on the table, withdraws.
//  staff  → proposes, counters, accepts, rejects, and alone presses
//           "Order Deal Approved" — the only verb that closes the thread.
// Neither side can forge the other's verbs — enforced here, not in the endpoint.
const ALLOWED = {
  buyer: new Set(['offer', 'counter', 'accept', 'withdraw']),
  staff: new Set(['offer', 'counter', 'accept', 'reject', 'approve'])
};

/**
 * Amount-carrying verbs that must state a figure.
 * `accept` deliberately does NOT: accepting means "yes to whatever is on the
 * table" (the thread's current total), so the button carries no number.
 * `approve`, `reject` and `withdraw` carry no amount either — approving means
 * signing the ALREADY accepted price, not renaming it.
 */
const NEEDS_AMOUNT = new Set(['offer', 'counter']);
const FORBIDS_AMOUNT = new Set(['approve', 'reject', 'withdraw']);

/**
 * Validate one round submission. Returns { ok:true, value } or { ok:false,error }.
 * Never throws on user input.
 */
export function validateRound({ side, kind, totalPaise, note } = {}) {
  if (!SIDES.includes(side)) return { ok: false, error: 'Unknown negotiating side.' };
  if (!KINDS.includes(kind)) return { ok: false, error: 'Unknown negotiation action.' };
  if (!ALLOWED[side].has(kind)) return { ok: false, error: `A ${side} cannot "${kind}" a negotiation.` };

  const needsAmount = NEEDS_AMOUNT.has(kind);
  if (needsAmount) {
    if (!Number.isInteger(totalPaise) || totalPaise < 0 || totalPaise > MAX_CONSIDERATION_PAISE) {
      return { ok: false, error: 'Enter a valid total amount (0 – ₹99,99,99,999).' };
    }
  } else if (FORBIDS_AMOUNT.has(kind)) {
    if (totalPaise !== undefined && totalPaise !== null) {
      return { ok: false, error: 'This action does not carry an amount.' };
    }
  } else if (totalPaise !== undefined && totalPaise !== null) {
    // `accept` with an explicit figure is a restated acceptance — allow it, but
    // it must still be a real amount (never a smuggled NaN/null).
    if (!Number.isInteger(totalPaise) || totalPaise < 0 || totalPaise > MAX_CONSIDERATION_PAISE) {
      return { ok: false, error: 'Enter a valid total amount (0 – ₹99,99,99,999).' };
    }
  }

  if (note !== undefined && note !== null && typeof note !== 'string') {
    return { ok: false, error: 'Invalid note.' };
  }
  const cleanNote = (note == null ? '' : note).trim();
  if (cleanNote.length > MAX_NOTE) {
    return { ok: false, error: `Note must be ${MAX_NOTE} characters or fewer.` };
  }

  return {
    ok: true,
    value: { side, kind, totalPaise: needsAmount || (kind === 'accept' && totalPaise != null) ? totalPaise : null, note: cleanNote }
  };
}

/* ── Price snapshot capture ─────────────────────────────────────────────── */

/** Canonical evaluated unit price in paise (ported from app/lib/money.ts). */
export function evalUnitPaise(p) {
  if (p && Number.isInteger(p.pricePaise) && p.pricePaise >= 0) return p.pricePaise;
  if (!p || typeof p.price !== 'number') return null;
  if (!Number.isFinite(p.price) || p.price < 0) return null;
  return Math.round(p.price * 100);
}

/**
 * The priced baseline the buyer negotiates against when no approval snapshot
 * exists yet: the evaluated total (per-unit × qty), lot consideration for a lot
 * order, or null when nothing is priced. Never 0-by-default.
 */
export function orderBaselinePaise(order) {
  if (!order) return null;
  if (order.pricingBasis === 'lot') {
    return Number.isInteger(order.lotConsiderationPaise) ? order.lotConsiderationPaise : null;
  }
  const lines = Array.isArray(order.products) ? order.products : [];
  let total = 0;
  let anyPriced = false;
  for (const p of lines) {
    const unit = evalUnitPaise(p);
    if (unit === null) continue;
    const qty = Number.isInteger(p && p.quantity) && p.quantity > 0 ? p.quantity : 1;
    const line = unit * qty;
    if (!Number.isSafeInteger(line)) continue;
    total += line;
    anyPriced = true;
  }
  return anyPriced ? total : null;
}

/**
 * Freeze the price the actor is looking at, right now. Prefers the immovable
 * approval snapshot (FinalPriceSnapshot); otherwise the live evaluated
 * baseline at version 0. `capturedAt` makes the freeze auditable.
 */
export function capturePriceSnapshot(order, { at } = {}) {
  const capturedAt = at || new Date().toISOString();
  const fp = order && order.finalPrice;
  if (fp && Number.isInteger(fp.version) && fp.version >= 1 && Number.isInteger(fp.totalPaise)) {
    return {
      version: fp.version,
      basis: typeof fp.basis === 'string' ? fp.basis : 'evaluated',
      totalPaise: fp.totalPaise,
      manifestHash: fp.manifestHashAtApproval ?? null,
      capturedAt
    };
  }
  return {
    version: 0,
    basis: 'evaluated',
    totalPaise: orderBaselinePaise(order),
    manifestHash: (order && order.manifest && order.manifest.hash) || null,
    capturedAt
  };
}

/**
 * Staleness guard: a frozen snapshot is stale when the order's current snapshot
 * has moved past it. Version OR total changing both count — a re-approval at the
 * same total is still a new version and still stale.
 */
export function isStale(frozen, current) {
  if (!frozen || !current) return false;
  return frozen.version !== current.version || frozen.totalPaise !== current.totalPaise;
}

/* ── State machine ──────────────────────────────────────────────────────── */

/**
 * Compute the next negotiation state for one accepted round.
 * `state` = { status, currentTotalPaise, roundCount? }.
 * Returns { ok:true, status, currentTotalPaise } | { ok:false, error }.
 *
 * The machine is TOTAL: every verb is defined for every state. Refusals are
 * returned as values, never thrown — and the ORDER status always advances
 * alongside the thread, so both records tell the same story.
 */
export function applyRound(state, value) {
  const roundCount = state && Number.isInteger(state.roundCount) ? state.roundCount : 0;
  const status = normalizeStatus(state && state.status ? state.status : STATUS.ACCEPTED, roundCount);
  if (isClosed(status)) {
    return { ok: false, error: 'This negotiation is already closed.' };
  }
  const current = state && Number.isInteger(state.currentTotalPaise) ? state.currentTotalPaise : null;

  switch (value.kind) {
    case 'offer':
    case 'counter':
      // Any live exchange puts the request "in progress" chronologically.
      return { ok: true, status: STATUS.IN_PROGRESS, currentTotalPaise: value.totalPaise };

    case 'accept': {
      // Accepting means "yes to the figure on the table". The amount is
      // optional; when both sides are silent there is nothing to accept.
      const agreed = Number.isInteger(value.totalPaise) ? value.totalPaise : current;
      if (!Number.isInteger(agreed)) {
        return { ok: false, error: 'There is no price on the table to accept yet — make an offer or a counter first.' };
      }
      // AGREED is NOT terminal: the thread stays live until "Order Deal Approved".
      return { ok: true, status: STATUS.AGREED, currentTotalPaise: agreed };
    }

    case 'approve': {
      // The single closing verb. Chronology is enforced: the deal cannot be
      // approved before a final price has been accepted.
      if (status !== STATUS.AGREED) {
        return {
          ok: false,
          error: 'Accept a final price first — "Accepted Final Price" must come before "Order Deal Approved".'
        };
      }
      if (!Number.isInteger(current)) {
        return { ok: false, error: 'There is no accepted final price to approve.' };
      }
      return { ok: true, status: STATUS.DEAL, currentTotalPaise: current };
    }

    case 'reject':
      return { ok: true, status: STATUS.DECLINED, currentTotalPaise: current };
    case 'withdraw':
      return { ok: true, status: STATUS.DECLINED, currentTotalPaise: current };
    default:
      return { ok: false, error: 'Unknown negotiation action.' };
  }
}

/**
 * Assemble the read model for one negotiation: the thread, the current frozen
 * price, and whether the latest round was made against a now-superseded price.
 */
export function summarize(negotiation, rounds, order) {
  const current = capturePriceSnapshot(order);
  const list = Array.isArray(rounds) ? rounds : [];
  const latest = list.length > 0 ? list[list.length - 1] : null;
  const latestSnapshot = latest
    ? { version: latest.price_version, totalPaise: latest.price_total_paise }
    : null;
  const status = normalizeStatus(negotiation.status, list.length);
  return {
    id: negotiation.id,
    requestId: negotiation.request_id,
    intent: negotiation.intent,
    status,
    statusRank: statusRank(status),
    closed: isClosed(status),
    currentTotalPaise: Number.isInteger(negotiation.current_total_paise) ? negotiation.current_total_paise : null,
    openedPriceVersion: Number.isInteger(negotiation.price_version) ? negotiation.price_version : 0,
    createdAt: negotiation.created_at,
    updatedAt: negotiation.updated_at,
    current,
    stale: isStale(latestSnapshot, current),
    rounds: list.map((r) => ({
      id: r.id,
      seq: r.seq,
      side: r.side,
      actor: r.actor_email || null,
      kind: r.kind,
      totalPaise: r.total_paise,
      note: r.note || '',
      priceVersion: r.price_version,
      priceBasis: r.price_basis,
      priceTotalPaise: r.price_total_paise,
      createdAt: r.created_at
    }))
  };
}
