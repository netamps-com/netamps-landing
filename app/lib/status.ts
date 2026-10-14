/**
 * The order/negotiation lifecycle — the FRONTEND twin of
 * functions/api/negotiate/core.mjs. One vocabulary, imported everywhere a
 * status is rendered or gated, so a phrase can never mean two things:
 *
 *   Pending → Order Accepted for Negotiation → Negotiation in Progress
 *           → Accepted Final Price           → Order Deal Approved
 *
 * `Declined` is the only other terminal state.
 *
 * Two rules the UI must respect:
 *  - only staff press "Order Accepted for Negotiation" and "Order Deal Approved";
 *  - NOTHING closes a deal except "Order Deal Approved" — "Accepted Final
 *    Price" is an agreement, not a closure.
 */

export const ORDER_STATUS = {
  PENDING: 'Pending',
  ACCEPTED: 'Order Accepted for Negotiation',
  IN_PROGRESS: 'Negotiation in Progress',
  AGREED: 'Accepted Final Price',
  DEAL: 'Order Deal Approved',
  DECLINED: 'Declined'
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

/** The chronological ladder (Declined sits outside it by design). */
export const CHRONOLOGY: string[] = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.ACCEPTED,
  ORDER_STATUS.IN_PROGRESS,
  ORDER_STATUS.AGREED,
  ORDER_STATUS.DEAL
];

/**
 * Orders already on file before the lifecycle shipped, mapped onto the ladder.
 * Never trusted as-is: a legacy 'Approved' means the deal already went through.
 */
const LEGACY: Record<string, string> = {
  Approved: ORDER_STATUS.DEAL,
  Rejected: ORDER_STATUS.DECLINED,
  Negotiating: ORDER_STATUS.IN_PROGRESS
};

export function normalizeStatus(status?: string | null): string {
  const s = String(status || '').trim();
  if (!s) return ORDER_STATUS.PENDING;
  return LEGACY[s] || s;
}

/** 0-based rung on the ladder; off-ladder (Declined) ranks 99. */
export function statusRank(status?: string | null): number {
  const i = CHRONOLOGY.indexOf(normalizeStatus(status));
  return i === -1 ? 99 : i;
}

/**
 * Has the request been finally closed? `Order Deal Approved` and `Declined`
 * (plus their pre-lifecycle spellings) — and only those.
 */
export function isClosedStatus(status?: string | null): boolean {
  const s = normalizeStatus(status);
  return s === ORDER_STATUS.DEAL || s === ORDER_STATUS.DECLINED;
}

/** The price is frozen: no more evaluated-price edits once a deal is closed. */
export function isPriceLocked(status?: string | null): boolean {
  return isClosedStatus(status);
}

/**
 * May the buyer/staff negotiate at this rung? Anything before
 * "Order Accepted for Negotiation" still has no negotiation to join.
 */
export function isNegotiable(status?: string | null): boolean {
  const s = normalizeStatus(status);
  return s === ORDER_STATUS.ACCEPTED || s === ORDER_STATUS.IN_PROGRESS || s === ORDER_STATUS.AGREED;
}

/** Show the evaluation block once the request has actually been decided. */
export function showsEvaluation(status?: string | null): boolean {
  return isClosedStatus(status);
}

/** Tailwind classes for the status chip — one definition, four screens. */
export function statusChip(status?: string | null): string {
  switch (normalizeStatus(status)) {
    case ORDER_STATUS.DEAL:
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case ORDER_STATUS.AGREED:
      return 'bg-teal-100 text-teal-700 border-teal-200';
    case ORDER_STATUS.IN_PROGRESS:
      return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    case ORDER_STATUS.ACCEPTED:
      return 'bg-amber-100 text-amber-700 border-amber-200';
    case ORDER_STATUS.DECLINED:
      return 'bg-red-100 text-red-700 border-red-200';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-300';
  }
}

/** Short human label for a round's verb. */
export function kindLabel(kind: string): string {
  switch (kind) {
    case 'offer': return 'Offer';
    case 'counter': return 'Counter';
    case 'accept': return 'Accepted';
    case 'reject': return 'Rejected';
    case 'withdraw': return 'Withdrawn';
    case 'approve': return 'Deal approved';
    default: return kind;
  }
}

/**
 * The same mapping on the dark dashboard chrome — `statusChip` is tuned for the
 * light buyer/monitor screens and would wash out on slate-950.
 */
export function statusChipDark(status?: string | null): string {
  switch (normalizeStatus(status)) {
    case ORDER_STATUS.DEAL:
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case ORDER_STATUS.AGREED:
      return 'bg-teal-500/10 text-teal-400 border-teal-500/20';
    case ORDER_STATUS.IN_PROGRESS:
      return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
    case ORDER_STATUS.ACCEPTED:
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case ORDER_STATUS.DECLINED:
      return 'bg-red-500/10 text-red-400 border-red-500/20';
    default:
      return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  }
}
