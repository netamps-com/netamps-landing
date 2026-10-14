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

export const KINDS = Object.freeze(['offer', 'counter', 'accept', 'reject', 'withdraw']);
export const SIDES = Object.freeze(['buyer', 'staff']);

export const STATUS = Object.freeze({
  OPEN: 'open',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn'
});

const CLOSED = new Set([STATUS.ACCEPTED, STATUS.REJECTED, STATUS.WITHDRAWN]);

/** A closed negotiation accepts no further rounds, from either side. */
export function isClosed(status) {
  return CLOSED.has(status);
}

export const MAX_NOTE = 500;

// Which verbs each side may use. The buyer proposes/counters/accepts/withdraws;
// staff (acting for the seller) may open with an offer, counter, accept or
// reject. Neither side can forge the other's verbs — enforced here, not in the
// endpoint.
const ALLOWED = {
  buyer: new Set(['offer', 'counter', 'accept', 'withdraw']),
  staff: new Set(['offer', 'counter', 'accept', 'reject'])
};

/** Amount-carrying verbs; reject/withdraw are bare decisions. */
const NEEDS_AMOUNT = new Set(['offer', 'counter', 'accept']);

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
  } else if (totalPaise !== undefined && totalPaise !== null) {
    return { ok: false, error: 'This action does not carry an amount.' };
  }

  if (note !== undefined && note !== null && typeof note !== 'string') {
    return { ok: false, error: 'Invalid note.' };
  }
  const cleanNote = (note == null ? '' : note).trim();
  if (cleanNote.length > MAX_NOTE) {
    return { ok: false, error: `Note must be ${MAX_NOTE} characters or fewer.` };
  }

  return { ok: true, value: { side, kind, totalPaise: needsAmount ? totalPaise : null, note: cleanNote } };
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
 * `state` = { status, currentTotalPaise }.
 * Returns { ok:true, status, currentTotalPaise } | { ok:false, error }.
 */
export function applyRound(state, value) {
  const status = state && state.status ? state.status : STATUS.OPEN;
  if (isClosed(status)) {
    return { ok: false, error: 'This negotiation is already closed.' };
  }
  const current = state && Number.isInteger(state.currentTotalPaise) ? state.currentTotalPaise : null;

  switch (value.kind) {
    case 'accept':
      return { ok: true, status: STATUS.ACCEPTED, currentTotalPaise: value.totalPaise };
    case 'reject':
      return { ok: true, status: STATUS.REJECTED, currentTotalPaise: current };
    case 'withdraw':
      return { ok: true, status: STATUS.WITHDRAWN, currentTotalPaise: current };
    case 'offer':
    case 'counter':
      return { ok: true, status: STATUS.OPEN, currentTotalPaise: value.totalPaise };
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
  return {
    id: negotiation.id,
    requestId: negotiation.request_id,
    intent: negotiation.intent,
    status: negotiation.status,
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
