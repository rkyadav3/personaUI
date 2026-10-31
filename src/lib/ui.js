// Small display helpers shared by the home page and the public profile.
export const compact = n => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);
export const initials = name => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
const hue = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 360;
/** A stable colourful gradient per name, used where there is no picture. */
export const gradient = s => { const h = hue(s); return `linear-gradient(135deg, hsl(${h} 58% 40%), hsl(${(h + 55) % 360} 62% 22%))`; };
export function ago(ts) {
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  if (!ts || Number.isNaN(d)) return '';
  return d < 1 ? 'Today' : d === 1 ? 'Yesterday' : d < 30 ? `${d} days ago` : d < 365 ? `${Math.floor(d / 30)} mo ago` : `${Math.floor(d / 365)} yr ago`;
}
/** Only http(s) links are ever put in an href. */
export const safeHref = u => { try { const x = new URL(String(u || '')); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch { return null; } };
