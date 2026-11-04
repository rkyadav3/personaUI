// Turns what the server sent (the visibility-filtered profile + the owner's portfolio text) into exactly what the page draws.
// This is where "if it isn't there, it isn't shown" is decided: every list is already filtered, `pages` says which
// sub-pages exist, and each hero block says whether it should render. The components never test raw data themselves.
import { PAGE_LABELS, ICON_NAMES, normalizePortfolio } from '../../shared/portfolio.js';
import { fmtPrice } from './money.js';

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
  const p = normalizePortfolio(data.portfolio), page = data.page || {}, cur = page.currency || 'INR';
  const name = data.name || '', me = firstWord(name), email = data.contact?.email || '';
  const photo = (heroOverride !== undefined ? heroOverride : data.hero) || '';
  const label = k => p.navLabels[k] || PAGE_LABELS[k];

  // ---- offerings from "Profile & Offerings" (respecting where the owner hid categories)
  const offers = [], talkOffers = [], offerOptions = [];
  for (const k of data.contributions || []) {
    if ((page.placement || {})[k.category] === 'hidden') continue;
    for (const o of k.offerings || []) {
      const item = { kind: 'offering', id: o.id, title: o.title, summary: o.description || '', icon: CAT_ICON[k.category] || 'spark', status: k.subtype || SINGULAR[k.category] || k.category,
        price: fmtPrice(o, cur), image: o.image || '', url: o.link || '', linkLabel: o.pricing === 'paid' ? 'Buy / book' : 'Open', ratingAvg: o.ratingAvg || 0, ratingCount: o.ratingCount || 0 };
      offerOptions.push({ id: o.id, title: o.title });   // the contact form lets a visitor pick one of these
      if (k.category === 'Talk Shows') talkOffers.push(item); else offers.push(item);
    }
  }

  // ---- blocks
  const projects = p.projects.map(x => ({ ...x, techList: split(x.tech) }));
  const featured = projects.find(x => x.featured) || projects[0] || null;
  const others = featured ? projects.filter(x => x !== featured) : [];
  const products = [...p.products.map(x => ({ kind: 'product', ...x })), ...offers];
  const exp = data.experience || null;
  const experience = p.experience.length ? p.experience : (exp?.employers || []).map(e => ({ role: e.role, company: e.company, period: e.duration, summary: '' }));
  const experienceNote = p.experience.length ? '' : (exp?.description || '');
  const education = data.education || [];
  const talks = [...p.talks.map(t => ({ kind: 'talk', ...t })), ...talkOffers.map(t => ({ kind: 'offering', id: t.id, title: t.title, event: t.status, date: '', summary: t.summary, url: t.url, linkLabel: t.linkLabel }))];
  const expertise = data.expertise || [];
  const skills = [...new Set([...split(p.about.skills), ...expertise])];
  const contact = data.contact || null;

  // ---- hero
  const domains = (p.domains.length ? p.domains : expertise.slice(0, 6).map(label => ({ label, icon: '' }))).map((d, i) => ({ label: d.label, icon: d.icon || guessIcon(d.label, i) }));
  const years = Number(exp?.total_years);
  const stats = p.stats.length ? p.stats : [
    ...(years > 0 ? [{ value: `${Math.round(years)}+`, label: years === 1 ? 'Year of Experience' : 'Years of Experience' }] : []),
    ...(projects.length ? [{ value: `${projects.length}`, label: projects.length === 1 ? 'Project Built' : 'Projects Built' }] : []),
    ...(products.length ? [{ value: `${products.length}`, label: products.length === 1 ? 'Product & Offering' : 'Products & Offerings' }] : []),
  ];
  const socials = [...p.socials];
  if (email && !socials.some(s => s.kind === 'email')) socials.push({ kind: 'email', url: `mailto:${email}` });
  const updates = data.updates || [], schedule = data.schedule || [], enquiry = p.enquiry;
  const ctaUrl = p.cta.url || (enquiry.enabled ? `/p/${slug}/contact` : email ? `mailto:${email}` : `/u/${slug}`);   // the form beats a bare mailto
  const about = data.purpose || '';
  const aboutBody = p.about.body || about;

  const pages = [{ key: 'home' }];
  if (projects.length) pages.push({ key: 'work' });
  if (products.length) pages.push({ key: 'products' });
  if (experience.length || education.length || experienceNote) pages.push({ key: 'experience' });
  if (talks.length) pages.push({ key: 'talks' });
  if (updates.length || schedule.length) pages.push({ key: 'updates' });
  if (aboutBody || skills.length || contact || socials.length) pages.push({ key: 'about' });
  if (enquiry.enabled) pages.push({ key: 'contact' });

  return {
    slug, name, first: me, initials: initials(name), photo, photoStyle: p.photoStyle, heroPos: page.hero || { x: 50, y: 25, zoom: 1 },
    brand: p.brand || name || 'Portfolio',
    pages: pages.map(x => ({ ...x, label: label(x.key), path: x.key === 'home' ? `/p/${slug}` : `/p/${slug}/${x.key}` })),
    navCta: { label: p.navCta.label || 'Let’s Connect', url: p.navCta.url || ctaUrl },
    greeting: p.greeting || 'Hi I’m', heroName: p.heroName || me || name, titleLine: p.titleLine || data.designation || '',
    bio: p.bio || clip(about, 230), awards: p.awards, availability: p.availability.show ? (p.availability.text || 'Available for new opportunities') : '',
    socials, domains, stats,
    cta: { label: p.cta.label || 'Work with me', url: ctaUrl },
    intro: p.intro.url ? { label: p.intro.label || 'Watch Introduction', url: p.intro.url, video: true } : { label: p.intro.label || 'Chat with my AI', url: `/u/${slug}`, video: false },
    projects, featured, others,
    projectsKicker: p.projectsKicker || 'Featured work', projectsTitle: p.projectsTitle || 'Selected Projects',
    products, productsKicker: p.productsKicker || 'Products & initiatives', productsTitle: p.productsTitle || 'Ideas to Impact',
    experience, experienceNote, education, talks, talksTitle: label('talks'), experienceTitle: label('experience'),
    aboutTitle: p.about.title || `About ${me || 'me'}`, aboutBody, skills, expertise, contact,
    footerNote: p.footerNote,
    updates, schedule, updatesTitle: label('updates') === PAGE_LABELS.updates ? 'Updates & Schedule' : label('updates'),
    enquiry, offerOptions, contactTitle: enquiry.title || `Contact ${me || 'me'}`, owner: name,
  };
}
