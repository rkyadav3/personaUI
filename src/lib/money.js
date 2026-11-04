/** "₹599", "Free", "Paid" (no price set) or "" (unspecified). */
export function fmtPrice(o, fallbackCur = 'INR') {
  if (o.pricing === 'free') return 'Free';
  if (o.pricing !== 'paid') return '';
  if (o.price == null) return 'Paid';
  const cur = String(o.currency || fallbackCur || '').trim(), code = cur.toUpperCase(), n = Number(o.price);
  if (/^[A-Z]{3}$/.test(code)) {
    try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: code, maximumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n); } catch { /* fall through */ }
  }
  return cur.length <= 2 ? `${cur}${n}` : `${cur} ${n}`.trim();
}
export const cartable = o => o.pricing === 'paid' && o.price != null;
