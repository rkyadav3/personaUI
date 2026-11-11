// The portfolio-style public site (/p/<slug>, /p/<slug>/work, /products, /experience, /talks, /about).
// Every profile owns its own copy of all of this. Empty means "not there": the page leaves that block out and the
// layout re-flows, so a profile with three fields and a profile with fifty both look finished.
// Shared by the editor, the page and the server. Whatever comes in, what comes out is safe to store and render.
import { ENQUIRY_TYPES } from './enquiryTypes.js';

export const PUBLIC_NAV_PAGES = ['home', 'activity', 'store', 'chat', 'contact'];
export const PORTFOLIO_PAGES = [...PUBLIC_NAV_PAGES, 'work', 'products', 'experience', 'talks', 'updates', 'about'];
export const PAGE_LABELS = { home: 'Home', activity: 'Activity', store: 'Store', work: 'Projects', products: 'Store', experience: 'Experience', talks: 'Talks', updates: 'Events & updates', about: 'About', chat: 'Chat', contact: 'Contact' };
export const ACTIVITY_SECTIONS = { projects: 'Projects', events: 'Events & updates', talks: 'Talks', recognition: 'Recognition', awards: 'Awards', certificates: 'Certificates', testimonials: 'Testimonials', experience: 'Experience' };
export const PUBLIC_PAGE_ALIASES = { work: { page: 'activity', section: 'projects' }, updates: { page: 'activity', section: 'events' }, talks: { page: 'activity', section: 'talks' }, experience: { page: 'activity', section: 'experience' }, products: { page: 'store' }, about: { page: 'home' } };
export const SOCIAL_KINDS = { github: 'GitHub', linkedin: 'LinkedIn', x: 'X (Twitter)', instagram: 'Instagram', youtube: 'YouTube', email: 'Email', website: 'Website' };
export const ICON_NAMES = ['spark', 'cpu', 'box', 'layers', 'cloud', 'code', 'chart', 'book', 'mic', 'users', 'globe', 'shield', 'pen', 'briefcase', 'heart', 'trophy'];
export const PRODUCT_STATUS = ['', 'Live', 'Beta', 'In progress', 'Concept'];

export const PORTFOLIO_DEFAULTS = {
  brand: '', greeting: '', heroName: '', titleLine: '', bio: '', photoStyle: 'bw',
  availability: { show: false, text: '' },
  awards: [], socials: [], domains: [],
  cta: { label: '', url: '' }, intro: { label: '', url: '' }, navCta: { label: '', url: '' },
  stats: [],
  projectsKicker: '', projectsTitle: '', projects: [],
  productsKicker: '', productsTitle: '', products: [],
  experience: [], talks: [], recognition: [], certificates: [], testimonials: [],
  about: { title: '', body: '', skills: '' },
  navLabels: {}, footerNote: '',
  enquiry: { enabled: true, title: '', intro: '', thanks: '', types: [] },   // the contact form on /p/<slug>/contact
};

const clean = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const long = (v, n) => (typeof v === 'string' ? v.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, n) : '');
const list = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);
const pick = (v, allowed, d = '') => (allowed.includes(v) ? v : d);

/** Links: http(s), mailto, tel, or a path on this site. A bare "github.com/me" gets https://, a bare email gets mailto:.
 *  Anything else (javascript:, data:, //host …) becomes empty, so nothing dangerous can reach an <a href>. */
export function cleanUrl(v, n = 500) {
  const u = clean(v, n);
  if (!u) return '';
  if (/^(https?:\/\/|mailto:|tel:)/i.test(u) || (u[0] === '/' && u[1] !== '/') || u[0] === '#') return u;
  if (/^[^\s@/]+@[^\s@/]+\.[a-z]{2,}$/i.test(u)) return `mailto:${u}`;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(u)) return `https://${u}`;
  return '';
}
/** Pictures: https (or http / a path on this site) only. */
export function cleanImg(v) {
  const u = clean(v, 600);
  return /^https?:\/\//i.test(u) || (u[0] === '/' && u[1] !== '/') ? u : '';
}

function productPrice(p) {
  const legacy = clean(p?.price, 24);
  const legacyAmount = /^(?:₹|INR\s*)?\s*\d+(?:,\d{3})*(?:\.\d{1,2})?$/i.test(legacy) ? Number(legacy.replace(/₹|INR|,|\s/gi, '')) : null;
  const pricing = ['free', 'paid', 'unspecified'].includes(p?.pricing) ? p.pricing : /^free$/i.test(legacy) ? 'free' : legacyAmount != null ? 'paid' : 'unspecified';
  const number = p?.amount === '' || p?.amount == null ? legacyAmount : Number(p.amount);
  const amount = pricing === 'free' ? 0 : pricing === 'paid' && Number.isFinite(number) && number > 0 && number < 1e7 ? number : null;
  return { pricing, amount, currency: /^[A-Z]{3}$/.test(String(p?.currency || '').toUpperCase()) ? String(p.currency).toUpperCase() : 'INR' };
}

export function normalizePortfolio(input) {
  const i = input && typeof input === 'object' ? input : {};
  const o = {
    brand: clean(i.brand, 40), greeting: clean(i.greeting, 30), heroName: clean(i.heroName, 60), titleLine: clean(i.titleLine, 70),
    bio: clean(i.bio, 320), photoStyle: pick(i.photoStyle, ['bw', 'color'], 'bw'),
    availability: { show: i.availability?.show === true, text: clean(i.availability?.text, 60) },
    awards: list(i.awards, 3).map(a => ({ title: clean(a?.title, 50), sub: clean(a?.sub, 60) })).filter(a => a.title || a.sub),
    socials: list(i.socials, 7).map(s => ({ kind: pick(s?.kind, Object.keys(SOCIAL_KINDS), 'website'), url: cleanUrl(s?.url) })).filter(s => s.url),
    domains: list(i.domains, 8).map(d => ({ label: clean(d?.label, 40), icon: pick(d?.icon, ICON_NAMES) })).filter(d => d.label),
    cta: { label: clean(i.cta?.label, 24), url: cleanUrl(i.cta?.url) },
    intro: { label: clean(i.intro?.label, 24), url: cleanUrl(i.intro?.url) },
    navCta: { label: clean(i.navCta?.label, 24), url: cleanUrl(i.navCta?.url) },
    stats: list(i.stats, 4).map(s => ({ value: clean(s?.value, 12), label: clean(s?.label, 30) })).filter(s => s.value),
    projectsKicker: clean(i.projectsKicker, 30), projectsTitle: clean(i.projectsTitle, 40),
    projects: list(i.projects, 24).map(p => ({
      title: clean(p?.title, 80), tag: clean(p?.tag, 40), summary: clean(p?.summary, 240), description: long(p?.description, 1600),
      image: cleanImg(p?.image), tech: clean(p?.tech, 160), award: clean(p?.award, 60), awardSub: clean(p?.awardSub, 60), year: clean(p?.year, 10),
      demoUrl: cleanUrl(p?.demoUrl), demoLabel: clean(p?.demoLabel, 24), repoUrl: cleanUrl(p?.repoUrl), repoLabel: clean(p?.repoLabel, 24), featured: p?.featured === true,
    })).filter(p => p.title),
    productsKicker: clean(i.productsKicker, 40), productsTitle: clean(i.productsTitle, 40),
    products: list(i.products, 24).map((p, index) => ({
      id: /^[a-zA-Z0-9_-]{1,80}$/.test(p?.id || '') ? p.id : `legacy-${index}`,
      title: clean(p?.title, 80), summary: clean(p?.summary, 240), icon: pick(p?.icon, ICON_NAMES), status: clean(p?.status, 20),
      price: clean(p?.price, 24), image: cleanImg(p?.image), url: cleanUrl(p?.url), linkLabel: clean(p?.linkLabel, 24),
      ...productPrice(p), deliveryUrl: cleanImg(p?.deliveryUrl),
      ...(typeof p?.accessReady === 'boolean' ? { accessReady: p.accessReady } : {}),
    })).filter(p => p.title),
    experience: list(i.experience, 20).map(e => ({ role: clean(e?.role, 80), company: clean(e?.company, 80), period: clean(e?.period, 40), summary: clean(e?.summary, 500) })).filter(e => e.role || e.company),
    talks: list(i.talks, 24).map(t => ({ title: clean(t?.title, 100), event: clean(t?.event, 100), date: clean(t?.date, 30), summary: clean(t?.summary, 300), url: cleanUrl(t?.url) })).filter(t => t.title),
    recognition: list(i.recognition, 24).map(r => ({ kind: pick(r?.kind, ['recognition', 'award'], 'recognition'), title: clean(r?.title, 100), issuer: clean(r?.issuer, 100), date: clean(r?.date, 30), summary: clean(r?.summary, 500), url: cleanUrl(r?.url) })).filter(r => r.title),
    certificates: list(i.certificates, 24).map(c => ({ title: clean(c?.title, 100), issuer: clean(c?.issuer, 100), date: clean(c?.date, 30), summary: clean(c?.summary, 500), url: cleanUrl(c?.url) })).filter(c => c.title),
    testimonials: list(i.testimonials, 24).map(t => ({ author: clean(t?.author, 100), role: clean(t?.role, 100), quote: long(t?.quote, 1200), url: cleanUrl(t?.url) })).filter(t => t.author && t.quote),
    about: { title: clean(i.about?.title, 60), body: long(i.about?.body, 3000), skills: clean(i.about?.skills, 400) },
    navLabels: Object.fromEntries(PORTFOLIO_PAGES.map(k => [k, clean(i.navLabels?.[k], 16)]).filter(([, v]) => v)),
    footerNote: clean(i.footerNote, 120),
    enquiry: {
      enabled: i.enquiry?.enabled !== false, title: clean(i.enquiry?.title, 60), intro: clean(i.enquiry?.intro, 300), thanks: clean(i.enquiry?.thanks, 200),
      types: [...new Set(list(i.enquiry?.types, 8).filter(t => ENQUIRY_TYPES[t]))],   // empty = every kind of enquiry is offered
    },
  };
  // at most one featured project
  let seen = false;
  for (const p of o.projects) { if (p.featured && seen) p.featured = false; if (p.featured) seen = true; }
  return o;
}

export function publicPortfolio(input) {
  const portfolio = normalizePortfolio(input);
  return { ...portfolio, products: portfolio.products.map(({ deliveryUrl, ...product }) => ({ ...product, accessReady: !!deliveryUrl })) };
}
