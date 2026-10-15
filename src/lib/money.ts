/** Minor-unit (paise) money math — integers only, no float drift. */
export function toMinor(major: number | string): number {
  const n = typeof major === 'string' ? Number(major) : major;
  if (!Number.isFinite(n)) throw new Error('Invalid amount');
  return Math.round(n * 100);
}

export function toMajor(minor: number): number {
  return Math.round(minor) / 100;
}

export interface LineInput {
  selected_quantity: number;
  unit_cost: number | string;
}

export function lineTotalMinor(line: LineInput): number {
  const qty = line.selected_quantity;
  if (!Number.isInteger(qty) || qty < 0) throw new Error('selected_quantity must be a non-negative integer');
  return qty * toMinor(line.unit_cost);
}

/** Sum lines + tax. taxRate as decimal fraction string/number (e.g. 0.18). */
export function totalsMinor(lines: LineInput[], taxRate: number | string): { subtotal: number; tax: number; total: number } {
  const rate = typeof taxRate === 'string' ? Number(taxRate) : taxRate;
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) throw new Error('tax_rate must be within [0,1]');
  const subtotal = lines.reduce((acc, l) => acc + lineTotalMinor(l), 0);
  const tax = Math.round(subtotal * rate);
  return { subtotal, tax, total: subtotal + tax };
}

/** GDPR-friendly IP masking: last IPv4 octet → 0; IPv6 → /64. */
export function maskIp(ip: string): string {
  const v = (ip || '').trim();
  if (!v || v === 'unknown') return 'unknown';
  if (v.includes('.') && !v.includes(':')) {
    const parts = v.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    return 'invalid';
  }
  if (v.includes(':')) {
    const head = v.split(':').slice(0, 4).join(':');
    return head ? `${head}::/64` : 'invalid';
  }
  return 'invalid';
}
