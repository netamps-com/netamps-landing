// Shared money contract for consideration (ask), evaluated, lot and final
// prices across Returns form, Dashboard, Intake and Email push.
//
// Rules (load-bearing, do not relax):
//  - Integer paise everywhere. Floats never cross a function boundary.
//  - null = unstated. 0 = explicit zero. Never conflate the two.
//  - Line consideration already includes all units: NEVER multiply by qty.
//  - Evaluated price is per-unit: ALWAYS multiply by qty for line totals.

export const MAX_CONSIDERATION_PAISE = 999999999900; // ₹99,99,99,999 cap

export function sanitizeMoneyInput(raw: string): string {
  const cleaned = raw.replace(/[₹,\s]/g, '').replace(/[^0-9.]/g, '');
  const dot = cleaned.indexOf('.');
  if (dot === -1) return cleaned;
  const int = cleaned.slice(0, dot);
  const dec = cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  return `${int}.${dec}`;
}

export function moneyStringToPaise(s: string): number | null {
  const t = s.replace(/[₹,\s]/g, '').trim();
  if (t === '' || t === '.') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  const paise = Math.round(n * 100);
  if (!Number.isInteger(paise) || paise > MAX_CONSIDERATION_PAISE) return null;
  return paise;
}

/** Render paise as ₹ with en-IN grouping; null/undefined renders as em dash. */
export function formatPaise(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return '—';
  return '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Canonical evaluated unit price in paise. Prefers pricePaise; converts
 * legacy rupee-float `price` once. Returns null when unstated/unparseable.
 */
export function evalUnitPaise(p: { pricePaise?: number | null; price?: number | null }): number | null {
  if (Number.isInteger(p.pricePaise) && (p.pricePaise as number) >= 0) return p.pricePaise as number;
  if (typeof p.price !== 'number') return null;
  if (!Number.isFinite(p.price) || p.price < 0) return null;
  return Math.round(p.price * 100);
}

export interface BreakdownLineInput {
  qty: number;
  basePaise: number | null;
}

export interface LotBreakdownRow {
  qty: number;
  basePaise: number | null;
  lineTotal: number | null; // qty × basePaise, exact; null when base unstated or unsafe
}

export interface LotBreakdown {
  rows: LotBreakdownRow[];
  sumLines: number | null;
  variance: number | null; // lotPaise − sumLines; null when either side unstated
  partial: boolean; // some (not all) lines stated
}

/**
 * Single authoritative lot-breakdown computation. Line totals are qty × base
 * (integers, exact). Unsafe-integer results degrade to null + partial rather
 * than corrupt figures. Dashboard ledger, email renderer (ported), form
 * preview and exports must all use this shape — never inline arithmetic.
 */
export function lotBreakdownOf(
  lines: BreakdownLineInput[],
  lotPaise: number | null | undefined
): LotBreakdown {
  const rows: LotBreakdownRow[] = lines.map(l => {
    const qty = Number.isInteger(l.qty) && l.qty > 0 ? l.qty : 1;
    const base = l.basePaise ?? null;
    if (base === null) return { qty, basePaise: null, lineTotal: null };
    const total = qty * base;
    if (!Number.isSafeInteger(total)) return { qty, basePaise: base, lineTotal: null };
    return { qty, basePaise: base, lineTotal: total };
  });
  const stated = rows.filter(r => r.lineTotal !== null);
  const sumLines = stated.length === 0
    ? null
    : stated.reduce((a, r) => a + (r.lineTotal as number), 0);
  const lot = lotPaise ?? null;
  return {
    rows,
    sumLines,
    variance: (lot === null || sumLines === null) ? null : lot - sumLines,
    partial: stated.length < rows.length
  };
}
