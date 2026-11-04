// What the owner can customise on their public page (/p/<slug>). Shared by the editor, the page and the server.
// Empty text means "work it out from my real profile" (see ProfilePage.jsx), so a brand-new profile already looks right.
import { CATEGORIES } from './profileSchema.js';

export const ACCENTS = {
  violet: ['#6d4aff', '#a855f7'], blue: ['#2563eb', '#38bdf8'], emerald: ['#059669', '#34d399'],
  rose: ['#e11d48', '#fb7185'], amber: ['#d97706', '#fbbf24'], slate: ['#334155', '#64748b'],
};
export const PLACEMENTS = { store: 'Store grid', side: 'Sidebar', hidden: 'Hidden' };
export const PLACEMENT_DEFAULTS = {
  'Books': 'store', 'Other Contributions': 'store', 'Content': 'side', 'Information & Knowledge': 'side',
  'In-Person Discussions': 'side', 'Advice & Suggestions': 'side', 'Talk Shows': 'side',
};
export const SECTION_LABELS = { store: 'Store', expertise: 'Expertise', education: 'Education', experience: 'Experience' };

export const PAGE_DEFAULTS = {
  headline: '', headlineAccent: '', subtitle: '', placeholder: '', tagline: '', about: '',
  chips: [],                                   // [{ label, prompt }], up to 6. Empty = chips made from what you offer.
  storeTitle: 'Store', storeSubtitle: '', storeLimit: 10,
  openLabel: 'Open persona', talkLabel: 'Talk to me',
  accent: 'violet', currency: 'INR', cart: true,
  placement: PLACEMENT_DEFAULTS,
  sections: { store: true, expertise: true, education: true, experience: true },
  hero: { zoom: 1, x: 50, y: 25 },
};

const s = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const num = (v, lo, hi, d) => { const n = v == null || v === '' ? NaN : Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

/** Whatever comes in (database, browser), what comes out is always safe to store and render. */
export function normalizePage(input) {
  const i = input && typeof input === 'object' ? input : {}, d = PAGE_DEFAULTS;
  const placement = { ...PLACEMENT_DEFAULTS };
  for (const c of CATEGORIES) if (Object.keys(PLACEMENTS).includes(i.placement?.[c])) placement[c] = i.placement[c];
  const sections = { ...d.sections };
  for (const k of Object.keys(sections)) if (typeof i.sections?.[k] === 'boolean') sections[k] = i.sections[k];
  const chips = (Array.isArray(i.chips) ? i.chips : []).slice(0, 6)
    .map(c => ({ label: s(c?.label, 32), prompt: s(c?.prompt, 200) })).filter(c => c.label)
    .map(c => ({ ...c, prompt: c.prompt || c.label }));
  return {
    headline: s(i.headline, 60), headlineAccent: s(i.headlineAccent, 40), subtitle: s(i.subtitle, 220), placeholder: s(i.placeholder, 120),
    tagline: s(i.tagline, 120), about: s(i.about, 600), chips,
    storeTitle: s(i.storeTitle, 40) || d.storeTitle, storeSubtitle: s(i.storeSubtitle, 140), storeLimit: Math.round(num(i.storeLimit, 2, 40, d.storeLimit)),
    openLabel: s(i.openLabel, 24) || d.openLabel, talkLabel: s(i.talkLabel, 24) || d.talkLabel,
    accent: ACCENTS[i.accent] ? i.accent : d.accent, currency: s(i.currency, 6) || d.currency, cart: typeof i.cart === 'boolean' ? i.cart : d.cart,
    placement, sections,
    hero: { zoom: num(i.hero?.zoom, 1, 3, d.hero.zoom), x: num(i.hero?.x, 0, 100, d.hero.x), y: num(i.hero?.y, 0, 100, d.hero.y) },
  };
}
