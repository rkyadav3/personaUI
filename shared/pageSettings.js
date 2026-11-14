// What the owner can customise on their public page (/p/<slug>). Shared by the editor, the page and the server.
// Empty text uses the published profile as a fallback on the portfolio and its Chat page.
import { CATEGORIES } from './profileSchema.js';
import { CUSTOMIZATION_DEFAULTS, normalizeCustomization } from './customization.js';
import { cleanImg } from './portfolio.js';

export const ACCENTS = {
  violet: ['#6d4aff', '#a855f7'], blue: ['#2563eb', '#38bdf8'], emerald: ['#059669', '#34d399'],
  rose: ['#e11d48', '#fb7185'], amber: ['#d97706', '#fbbf24'], slate: ['#334155', '#64748b'], lime: ['#84cc16', '#bef264'],
};
export const PLACEMENTS = { store: 'Store grid', side: 'Sidebar', hidden: 'Hidden' };
export const PLACEMENT_DEFAULTS = {
  'Books': 'store', 'Other Contributions': 'store', 'Content': 'side', 'Information & Knowledge': 'side',
  'In-Person Discussions': 'side', 'Advice & Suggestions': 'side', 'Talk Shows': 'side',
};
export const SECTION_LABELS = { store: 'Store', expertise: 'Expertise', education: 'Education', experience: 'Experience' };

export const PAGE_DEFAULTS = {
  customization: CUSTOMIZATION_DEFAULTS,
  template: 'portfolio',                          // one public portfolio, including its Chat page
  headline: '', headlineAccent: '', subtitle: '', placeholder: '', tagline: '', about: '',
  chips: [],                                   // [{ label, prompt }], up to 6. Empty = chips made from what you offer.
  storeTitle: 'Store', storeSubtitle: '', storeLimit: 10,
  openLabel: 'Open persona', talkLabel: 'Talk to me',
  accent: 'violet', currency: 'INR', cart: true,
  placement: PLACEMENT_DEFAULTS,
  sections: { store: true, expertise: true, education: true, experience: true },
  hero: { zoom: 1, x: 50, y: 25, imageUrl: '' },
  accentHex: '',                                   // '' = use the preset above; '#rrggbb' = your own colour
  theme: { bg: 'orbs', bgColor: '#ffffff', wash: 55, font: 'sans', radius: 28, maxWidth: 1380 },
  glass: { on: true, refraction: 55, blur: 14, tint: 55, dispersion: 25, rim: 70, shadow: 50 },
  layout: { sidebar: 'right', photo: 'left' },
  ball: { show: true, size: 220 },
  chat: { mic: true, sources: true },
};
export const BG_MODES = { orbs: 'White with soft colour', plain: 'Plain', color: 'Solid colour', image: 'My background image' };
export const FONTS = { sans: 'Modern (Figtree)', serif: 'Editorial (Newsreader)', system: 'System', mono: 'Monospace' };
export const FONT_STACK = { sans: "'Figtree', system-ui, sans-serif", serif: "'Newsreader', Georgia, serif", system: "system-ui, -apple-system, 'Segoe UI', sans-serif", mono: "ui-monospace, 'SFMono-Regular', Menlo, monospace" };
export const GLASS_LIMITS = { refraction: [0, 100], blur: [0, 40], tint: [0, 100], dispersion: [0, 100], rim: [0, 100], shadow: [0, 100] };

const HEX = /^#[0-9a-f]{6}$/i;
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
    customization: normalizeCustomization(i.customization),
    template: 'portfolio',
    headline: s(i.headline, 60), headlineAccent: s(i.headlineAccent, 40), subtitle: s(i.subtitle, 220), placeholder: s(i.placeholder, 120),
    tagline: s(i.tagline, 120), about: s(i.about, 600), chips,
    storeTitle: s(i.storeTitle, 40) || d.storeTitle, storeSubtitle: s(i.storeSubtitle, 140), storeLimit: Math.round(num(i.storeLimit, 2, 40, d.storeLimit)),
    openLabel: s(i.openLabel, 24) || d.openLabel, talkLabel: s(i.talkLabel, 24) || d.talkLabel,
    accent: ACCENTS[i.accent] ? i.accent : d.accent, currency: s(i.currency, 6) || d.currency, cart: typeof i.cart === 'boolean' ? i.cart : d.cart,
    placement, sections,
    hero: { zoom: num(i.hero?.zoom, 1, 3, d.hero.zoom), x: num(i.hero?.x, 0, 100, d.hero.x), y: num(i.hero?.y, 0, 100, d.hero.y), imageUrl: cleanImg(i.hero?.imageUrl) },
    accentHex: HEX.test(i.accentHex) ? i.accentHex.toLowerCase() : '',
    theme: {
      bg: BG_MODES[i.theme?.bg] ? i.theme.bg : d.theme.bg, bgColor: HEX.test(i.theme?.bgColor) ? i.theme.bgColor.toLowerCase() : d.theme.bgColor,
      wash: Math.round(num(i.theme?.wash, 0, 95, d.theme.wash)), font: FONTS[i.theme?.font] ? i.theme.font : d.theme.font,
      radius: Math.round(num(i.theme?.radius, 6, 44, d.theme.radius)), maxWidth: Math.round(num(i.theme?.maxWidth, 1000, 1700, d.theme.maxWidth)),
    },
    glass: {
      on: typeof i.glass?.on === 'boolean' ? i.glass.on : d.glass.on,
      ...Object.fromEntries(Object.entries(GLASS_LIMITS).map(([k, [lo, hi]]) => [k, Math.round(num(i.glass?.[k], lo, hi, d.glass[k]))])),
    },
    layout: { sidebar: i.layout?.sidebar === 'left' ? 'left' : 'right', photo: ['left', 'right', 'none'].includes(i.layout?.photo) ? i.layout.photo : 'left' },
    ball: { show: typeof i.ball?.show === 'boolean' ? i.ball.show : d.ball.show, size: Math.round(num(i.ball?.size, 140, 320, d.ball.size)) },
    chat: { mic: typeof i.chat?.mic === 'boolean' ? i.chat.mic : true, sources: typeof i.chat?.sources === 'boolean' ? i.chat.sources : true },
  };
}
