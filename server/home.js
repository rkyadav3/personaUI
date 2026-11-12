// The members' home page: one public, read-only feed with a card per published profile and every public offering.
// Everything goes through buildPublic, so a hidden section, a switched-off category or an inactive offering never leaves the server.
import { env } from './config.js';
import { registrationMode, isSuperAdminEmail } from './auth.js';
import { buildPublic, safeUrl } from './profile.js';
import { publicUrl } from './site.js';
import { raw, run } from './supabase.js';
import { normalizePage } from '../shared/pageSettings.js';
import { publicPortfolio } from '../shared/portfolio.js';
import { canViewProfile } from '../shared/governance.js';
const MAX_MEMBERS = 200,
  MAX_OFFERS = 300;
const cut = (s, n) => {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
};
const ids = rows => rows.map(r => r.owner_id);
export async function homeFeed(db = raw()) {
  const profiles = await run(db.from('profiles').select('*').eq('status', 'published').order('confirmed_at', {
    ascending: false
  }).limit(MAX_MEMBERS));
  const base = {
    name: env('SITE_NAME', 'Persona'),
    mode: registrationMode(),
    members: [],
    offers: [],
    products: []
  };
  if (!profiles.length) return base;
  const owners = ids(profiles);
  const [users, cs, os, sites] = await Promise.all([run(db.from('users').select('id,email,slug,tags,profile_private,locked_until').in('id', owners)), run(db.from('contributions').select('*').in('owner_id', owners).order('id')), run(db.from('offerings').select('*').in('owner_id', owners).order('id')), run(db.from('site_settings').select('owner_id,bg_path,hero_path,page,portfolio').in('owner_id', owners))]);
  return buildHomeFeed({
    profiles,
    users,
    contributions: cs,
    offerings: os,
    sites,
    name: base.name,
    mode: base.mode
  });
}
const labels = {
  Books: 'Book',
  'In-Person Discussions': 'Discussion',
  'Advice & Suggestions': 'Consultation',
  'Talk Shows': 'Talk show',
  'Information & Knowledge': 'Knowledge'
};

/** Uses public fields and the same visibility rules as the profile shop. */
export function buildHomeFeed({
  profiles = [],
  users = [],
  contributions = [],
  offerings = [],
  sites = [],
  name = 'Persona',
  mode = 'invite'
} = {}) {
  const slugOf = new Map(users.map(u => [u.id, u.slug])),
    settings = new Map(sites.map(s => [s.owner_id, s]));
  const members = [],
    offers = [],
    products = [];
  for (const p of profiles.filter(profile => profile.status === 'published')) {
    const account = users.find(user => user.id === p.owner_id);
    if (isSuperAdminEmail(account?.email) || !canViewProfile(account)) continue;
    const slug = slugOf.get(p.owner_id);
    if (!slug || !p.name) continue;
    const site = settings.get(p.owner_id),
      page = normalizePage(site?.page);
    const mine = contributions.filter(c => c.owner_id === p.owner_id && page.placement[c.category] !== 'hidden').map(c => ({
      ...c,
      offerings: offerings.filter(o => o.owner_id === p.owner_id && o.contribution_id === c.id)
    }));
    const pub = buildPublic(p, mine);
    const portfolio = publicPortfolio(site?.portfolio);
    const contactPath = portfolio.enquiry.enabled || pub.contact?.email || pub.contact?.phone ? `/p/${slug}/contact` : `/p/${slug}/chat`;
    const mineOffers = [];
    if (page.sections.store) for (const k of pub.contributions) for (const o of k.offerings) {
      const {
        cover_image,
        buy_link,
        ...details
      } = o.details || {};
      mineOffers.push({
        kind: 'offering',
        id: o.id,
        slug,
        member: pub.name,
        contactPath,
        category: k.category,
        subtype: k.subtype,
        title: o.title,
        description: cut(o.description, 500),
        typeLabel: k.category === 'In-Person Discussions' && details.format === 'One-to-one' ? '1:1 Talk' : labels[k.category] || details.content_type || k.subtype || k.category,
        pricing: o.pricing,
        price: o.price,
        currency: o.currency || page.currency,
        image: safeUrl(cover_image),
        link: safeUrl(buy_link),
        details,
        accessReady: o.accessReady,
        createdAt: o.createdAt,
        views: o.views,
        clicks: o.clicks,
        ratingAvg: o.ratingAvg,
        ratingCount: o.ratingCount
      });
    }
    const extraProducts = page.sections.store ? portfolio.products.map(product => ({
      kind: 'product',
      id: product.id,
      slug,
      member: pub.name,
      contactPath,
      title: product.title,
      description: product.summary,
      category: 'Products',
      typeLabel: 'Product',
      pricing: product.pricing,
      price: product.amount,
      currency: product.currency,
      image: product.image,
      link: product.url,
      icon: product.icon,
      accessReady: product.accessReady,
      views: 0,
      clicks: 0,
      ratingCount: 0,
      ratingAvg: 0,
      createdAt: p.confirmed_at || p.created_at || null
    })) : [];
    const ratingCount = mineOffers.reduce((n, o) => n + o.ratingCount, 0);
    const ratingAvg = ratingCount ? Math.round(mineOffers.reduce((n, o) => n + o.ratingAvg * o.ratingCount, 0) / ratingCount * 10) / 10 : 0;
    offers.push(...mineOffers);
    products.push(...mineOffers, ...extraProducts);
    members.push({
      slug,
      tags: account.tags || [],
      name: pub.name,
      designation: pub.designation,
      purpose: cut(pub.purpose, 240),
      expertise: page.sections.expertise ? (pub.expertise || []).slice(0, 6) : [],
      location: pub.contact?.location || null,
      categories: [...new Set([...mineOffers, ...extraProducts].map(o => o.category))],
      offerCount: mineOffers.length + extraProducts.length,
      views: pub.views,
      joined: p.confirmed_at || p.created_at || null,
      ratingAvg,
      ratingCount,
      engagements: mineOffers.reduce((n, o) => n + o.clicks, 0),
      photo: site?.hero_path ? publicUrl(site.hero_path) : null,
      photoFocus: page.hero,
      cover: site?.bg_path ? publicUrl(site.bg_path) : null
    });
  }
  offers.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return {
    name,
    mode,
    members,
    offers: offers.slice(0, MAX_OFFERS),
    products: products.slice(0, MAX_OFFERS)
  };
}
