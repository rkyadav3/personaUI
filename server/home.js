// The members' home page: one public, read-only feed with a card per published profile and every public offering.
// Everything goes through buildPublic, so a hidden section, a switched-off category or an inactive offering never leaves the server.
import { env } from './config.js';
import { registrationMode } from './auth.js';
import { buildPublic, safeUrl } from './profile.js';
import { publicUrl } from './site.js';
import { raw, run } from './supabase.js';

const MAX_MEMBERS = 200, MAX_OFFERS = 300;
const cut = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s; };
const ids = rows => rows.map(r => r.owner_id);

export async function homeFeed() {
  const db = raw();
  const profiles = await run(db.from('profiles').select('*').eq('status', 'published').order('confirmed_at', { ascending: false }).limit(MAX_MEMBERS));
  const base = { name: env('SITE_NAME', 'Persona'), mode: registrationMode(), members: [], offers: [] };
  if (!profiles.length) return base;
  const owners = ids(profiles);
  const [users, cs, os, sites] = await Promise.all([
    run(db.from('users').select('id,slug').in('id', owners)),
    run(db.from('contributions').select('*').in('owner_id', owners).order('id')),
    run(db.from('offerings').select('*').in('owner_id', owners).order('id')),
    run(db.from('site_settings').select('owner_id,bg_path').in('owner_id', owners)),
  ]);
  const slugOf = new Map(users.map(u => [u.id, u.slug])), cover = new Map(sites.map(s => [s.owner_id, s.bg_path]));
  const members = [], offers = [];
  for (const p of profiles) {
    const slug = slugOf.get(p.owner_id);
    if (!slug || !p.name) continue;
    const mine = cs.filter(c => c.owner_id === p.owner_id).map(c => ({ ...c, offerings: os.filter(o => o.contribution_id === c.id) }));
    const pub = buildPublic(p, mine);
    const mineOffers = [];
    for (const k of pub.contributions) for (const o of k.offerings) {
      mineOffers.push({
        id: o.id, slug, member: pub.name, category: k.category, subtype: k.subtype, title: o.title, description: cut(o.description, 160),
        pricing: o.pricing, price: o.price, currency: o.currency, image: safeUrl(o.details?.cover_image), createdAt: o.createdAt,
        views: o.views, clicks: o.clicks, ratingAvg: o.ratingAvg, ratingCount: o.ratingCount,
      });
    }
    offers.push(...mineOffers);
    members.push({
      slug, name: pub.name, designation: pub.designation, purpose: cut(pub.purpose, 180), expertise: (pub.expertise || []).slice(0, 4),
      location: pub.contact?.location || null, categories: [...new Set(mineOffers.map(o => o.category))],
      offerCount: mineOffers.length, views: pub.views, joined: p.confirmed_at || p.created_at || null,
      cover: cover.get(p.owner_id) ? publicUrl(cover.get(p.owner_id)) : null,
    });
  }
  offers.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return { ...base, members, offers: offers.slice(0, MAX_OFFERS) };
}
