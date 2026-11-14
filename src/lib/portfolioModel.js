// Turns what the server sent (the visibility-filtered profile + the owner's portfolio text) into exactly what the page draws.
// This is where "if it isn't there, it isn't shown" is decided: every list is already filtered, `pages` says which
// sub-pages exist, and each hero block says whether it should render. The components never test raw data themselves.
import { PAGE_LABELS, PUBLIC_NAV_PAGES, ICON_NAMES, normalizePortfolio } from '../../shared/portfolio.js';
import { resolveHomeAwards } from '../../shared/customizationReferences.js';
import { fmtPrice } from './money.js';
import { normalizePage } from '../../shared/pageSettings.js';

export const split = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const firstWord = s => String(s || '').trim().split(/\s+/)[0];
const initials = s => String(s || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '·';
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length <= n ? s : `${s.slice(0, n).replace(/\s+\S*$/, '')}…`; };

const RULES = [
  [/\b(ai|ml|machine|neural|llm|deep|vision|robot)/i, 'cpu'], [/\b(iot|embedded|hardware|arduino|sensor)/i, 'cpu'],
  [/product|startup|saas/i, 'box'], [/design|ui|ux|brand|creative/i, 'pen'], [/cloud|devops|aws|infra|server/i, 'cloud'],
  [/web|software|code|develop|react|python|engineer|program/i, 'code'], [/data|analytic|finance|market/i, 'chart'],
  [/teach|train|mentor|coach|communit/i, 'users'], [/write|book|content|research|educat/i, 'book'], [/speak|talk|podcast|show|interview/i, 'mic'],
  [/secur|privacy/i, 'shield'], [/system|architect|platform/i, 'layers'],
];
export const guessIcon = (label, i = 0) => RULES.find(([re]) => re.test(label))?.[1] || ICON_NAMES[i % 6];
const CAT_ICON = { Books: 'book', Content: 'pen', 'Information & Knowledge': 'layers', 'In-Person Discussions': 'users', 'Advice & Suggestions': 'spark', 'Talk Shows': 'mic', 'Other Contributions': 'box' };
const SINGULAR = { Books: 'Book', 'Other Contributions': 'Other', 'Information & Knowledge': 'Knowledge', 'Advice & Suggestions': 'Advice', 'In-Person Discussions': 'Discussion', 'Talk Shows': 'Talk show' };

export function resolveSite(data, slug, heroOverride) {
  const p = normalizePortfolio(data.portfolio), page = normalizePage(data.page), cur = page.currency;
  const name = data.name || '', me = firstWord(name), email = data.contact?.email || '';
  const photo = (heroOverride !== undefined ? heroOverride : page.hero.imageUrl || data.hero) || '';
  const label = k => p.navLabels[k] || (k === 'store' ? p.navLabels.products : '') || PAGE_LABELS[k];

  // ---- offerings from the owner's categories (respecting hidden categories)
  const offers = [], talkOffers = [], offerOptions = [];
  for (const k of data.contributions || []) {
    if ((page.placement || {})[k.category] === 'hidden') continue;
    for (const o of k.offerings || []) {
      const item = { kind: 'offering', category: k.subtype || k.category, id: o.id, title: o.title, summary: o.description || '', icon: CAT_ICON[k.category] || 'spark', status: k.subtype || SINGULAR[k.category] || k.category,
        price: fmtPrice(o, cur), pricing: o.pricing, amount: o.pricing === 'free' ? 0 : o.price, currency: String(o.currency || cur).toUpperCase(), accessReady: o.accessReady,
        checkout: page.cart && ['free', 'paid'].includes(o.pricing) ? { kind: 'offering', id: String(o.id) } : null,
        image: o.image || '', url: o.link || '', linkLabel: o.pricing === 'paid' ? 'Buy / book' : 'Open', views: o.views || 0, clicks: o.clicks || 0, ratingAvg: o.ratingAvg || 0, ratingCount: o.ratingCount || 0 };
      offerOptions.push({ id: o.id, title: o.title });   // the contact form lets a visitor pick one of these
      if (k.category === 'Talk Shows') talkOffers.push(item); else offers.push(item);
    }
  }

  // ---- blocks
  const projects = p.projects.map(x => ({ ...x, techList: split(x.tech) }));
  const featured = projects.find(x => x.featured) || projects[0] || null;
  const others = featured ? projects.filter(x => x !== featured) : [];
  const products = page.sections.store ? [...p.products.map(({ deliveryUrl, ...x }) => ({ kind: 'product', ...x, accessReady: x.accessReady ?? !!deliveryUrl, price: x.pricing === 'unspecified' ? x.price : fmtPrice({ pricing: x.pricing, price: x.amount, currency: x.currency }, cur), checkout: page.cart && ['free', 'paid'].includes(x.pricing) ? { kind: 'product', id: x.id } : null })), ...offers, ...talkOffers] : [];
  const exp = data.experience || null;
  const experience = page.sections.experience ? (p.experience.length ? p.experience : (exp?.employers || []).map(e => ({ role: e.role, company: e.company, period: e.duration, summary: '' }))) : [];
  const experienceNote = page.sections.experience && !p.experience.length ? (exp?.description || '') : '';
  const education = page.sections.education ? data.education || [] : [];
  const talks = [...p.talks.map(t => ({ kind: 'talk', ...t })), ...talkOffers.map(t => ({ kind: 'offering', id: t.id, title: t.title, event: t.status, date: '', summary: t.summary, url: t.url, linkLabel: t.linkLabel }))];
  const expertise = page.sections.expertise ? data.expertise || [] : [];
  const skills = page.sections.expertise ? [...new Set([...split(p.about.skills), ...expertise])] : [];
  const contact = data.contact || null;

  // ---- hero
  const domains = page.sections.expertise ? (p.domains.length ? p.domains : expertise.slice(0, 6).map(label => ({ label, icon: '' }))).map((d, i) => ({ label: d.label, icon: d.icon || guessIcon(d.label, i) })) : [];
  const years = page.sections.experience ? Number(exp?.total_years) : 0;
  const stats = p.stats.length ? p.stats : [
    ...(years > 0 ? [{ value: `${Math.round(years)}+`, label: years === 1 ? 'Year of Experience' : 'Years of Experience' }] : []),
    ...(projects.length ? [{ value: `${projects.length}`, label: projects.length === 1 ? 'Project Built' : 'Projects Built' }] : []),
    ...(products.length ? [{ value: `${products.length}`, label: products.length === 1 ? 'Product & Offering' : 'Products & Offerings' }] : []),
  ];
  const socials = [...p.socials];
  if (email && !socials.some(s => s.kind === 'email')) socials.push({ kind: 'email', url: `mailto:${email}` });
  const updates = data.updates || [], schedule = data.schedule || [], events = data.events || [], enquiry = p.enquiry;
  const chatUrl = `/p/${slug}`;
  const ctaUrl = p.cta.url || (enquiry.enabled ? `/p/${slug}/contact` : email ? `mailto:${email}` : chatUrl);
  const about = page.about || data.purpose || '';
  const aboutBody = p.about.body || about;

  const pages = page.customization.navOrder.filter(key => PUBLIC_NAV_PAGES.includes(key)).map(key => ({ key }));
  const homeProducts = page.customization.homeFeaturedItems.length ? page.customization.homeFeaturedItems.map(id => products.find(item => `${item.kind}:${item.id}` === id)).filter(Boolean) : products;
  const homeAwards = page.customization.homeAwards.length ? resolveHomeAwards(p, page.customization.homeAwards) : p.awards;

  return {
    slug, name, first: me, initials: initials(name), photo, photoStyle: p.photoStyle, heroPos: { x: page.hero.x, y: page.hero.y, zoom: page.hero.zoom },
    brand: p.brand || name || 'Portfolio',
    pages: pages.map(x => ({ ...x, label: label(x.key), path: x.key === 'chat' ? `/p/${slug}` : `/p/${slug}/${x.key}` })),
    navCta: { label: p.navCta.label || 'Let’s Connect', url: p.navCta.url || ctaUrl },
    greeting: p.greeting || 'Hi I’m', heroName: p.heroName || me || name, titleLine: p.titleLine || page.tagline || data.designation || '',
    bio: p.bio || clip(about, 230), awards: homeAwards, homeProducts: homeProducts.slice(0, page.customization.homeLimit), availability: p.availability.show ? (p.availability.text || 'Available for new opportunities') : '',
    socials, domains, stats,
    cta: { label: p.cta.label || 'Work with me', url: ctaUrl },
    intro: p.intro.url ? { label: p.intro.label || 'Watch Introduction', url: p.intro.url, video: true } : { label: p.intro.label || 'Chat with my AI', url: chatUrl, video: false },
    projects, featured, others,
    projectsKicker: p.projectsKicker || 'Featured work', projectsTitle: p.projectsTitle || 'Selected Projects',
    products, productsKicker: p.productsKicker || 'Free & paid offerings', productsTitle: p.productsTitle || page.storeTitle || 'Shop', productsSubtitle: page.storeSubtitle,
    experience, experienceNote, education, talks, talksTitle: label('talks'), experienceTitle: label('experience'),
    recognition: p.recognition.filter(item => item.kind === 'recognition'),
    activityAwards: [...p.awards.map(a => ({ title: a.title || a.sub, summary: a.title ? a.sub : '' })), ...p.recognition.filter(item => item.kind === 'award')],
    certificates: p.certificates, testimonials: p.testimonials,
    aboutTitle: p.about.title || `About ${me || 'me'}`, aboutBody, skills, expertise, contact,
    footerNote: p.footerNote,
    updates, schedule, events, updatesTitle: label('updates') === PAGE_LABELS.updates ? 'Updates & Schedule' : label('updates'),
    enquiry, offerOptions, contactTitle: enquiry.title || `Contact ${me || 'me'}`, owner: name,
  };
}
