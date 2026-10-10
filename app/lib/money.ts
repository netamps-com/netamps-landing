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
