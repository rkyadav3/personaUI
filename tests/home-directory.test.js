import test from 'node:test';
import assert from 'node:assert/strict';
import * as home from '../server/home.js';
import { scriptedDatabase, step, hasEq } from './support/database.js';

const source = () => ({
  profiles: [{ id: 1, owner_id: 'a', name: 'Ravi Kumar Yadav', designation: 'Product builder', expertise: ['AI', 'IoT'], purpose: 'Building useful tools', status: 'published', views: 12400 }],
  users: [{ id: 'a', slug: 'ravi' }],
  contributions: [{ id: 10, owner_id: 'a', category: 'Books', enabled: true, visible: true }, { id: 11, owner_id: 'a', category: 'Content', enabled: true, visible: true }],
  offerings: [
    { id: 1, owner_id: 'a', contribution_id: 10, title: 'Building AI Products', description: 'From idea to scale', pricing: 'paid', price: 499, currency: 'INR', active: true, rating_sum: 49, rating_count: 10, clicks: 20, views: 30, delivery_url: 'https://private.test/book', details: { cover_image: 'https://public.test/book.png', buy_link: 'https://public.test/info' } },
    { id: 2, owner_id: 'a', contribution_id: 11, title: 'AI course', pricing: 'free', active: true, rating_sum: 24, rating_count: 5, clicks: 8, details: { content_type: 'Course' } },
  ],
  sites: [{ owner_id: 'a', hero_path: 'a/portrait.png', bg_path: 'a/background.png', page: { hero: { x: 30, y: 70, zoom: 1.2 } }, portfolio: { products: [{ id: 'guide', title: 'A practical guide', pricing: 'paid', amount: 99, assetId: '11111111-1111-4111-8111-111111111111' }] } }],
});

test('home feed uses real portraits and aggregates visible offering reviews and interactions', () => {
  assert.equal(typeof home.buildHomeFeed, 'function');
  const data = home.buildHomeFeed(source());
  const member = data.members[0];
  assert.match(member.photo, /^\/api\/media\?owner=a&path=a%2Fportrait.png$/);
  assert.deepEqual(member.photoFocus, { x: 30, y: 70, zoom: 1.2 });
  assert.equal(member.views, 12400);
  assert.equal(member.ratingCount, 15);
  assert.equal(member.ratingAvg, 4.9);
  assert.equal(member.engagements, 28);
  assert.equal(member.offerCount, 3);
  assert.equal(member.reliability, undefined);
  assert.equal(member.verified, undefined);
});

test('home products include portfolio products and typed offerings without private access links', () => {
  const data = home.buildHomeFeed(source());
  assert.equal(data.products.length, 3);
  assert.equal(data.products.find(p => p.id === 1).typeLabel, 'Book');
  assert.equal(data.products.find(p => p.id === 2).typeLabel, 'Course');
  const guide = data.products.find(p => p.id === 'guide');
  assert.equal(guide.kind, 'product'); assert.equal(guide.price, 99); assert.equal(guide.accessReady, true);
  assert.doesNotMatch(JSON.stringify(data), /private\.test/);
  assert.equal(data.offers.length, 2);
});

test('home respects hidden categories, inactive offerings, private fields and unpublished profiles', () => {
  const input = source();
  input.profiles[0].visibility = { designation: false, expertise: false, purpose: false };
  input.sites[0].page.placement = { Books: 'hidden' };
  input.offerings[1].active = false;
  input.profiles.push({ owner_id: 'b', status: 'draft', name: 'Private owner' });
  const data = home.buildHomeFeed(input);
  assert.equal(data.members.length, 1);
  assert.equal(data.products.length, 1);
  assert.equal(data.members[0].ratingCount, 0);
  assert.equal(data.members[0].engagements, 0);
  assert.equal(data.members[0].designation, null);
  assert.deepEqual(data.members[0].expertise, []);
  assert.equal(data.members[0].purpose, '');
  assert.doesNotMatch(JSON.stringify(data), /Building AI Products|AI course|Private owner|private\.test/);
});

test('a hidden shop keeps all products and engagement totals out of the directory', () => {
  const input = source(); input.sites[0].page.sections = { store: false };
  const data = home.buildHomeFeed(input);
  assert.equal(data.products.length, 0); assert.equal(data.offers.length, 0);
  assert.equal(data.members[0].offerCount, 0); assert.equal(data.members[0].ratingCount, 0);
});

test('owner mismatches, disabled categories and invisible categories never enter the home feed', () => {
  const input = source();
  input.offerings[0].owner_id = 'someone-else'; input.contributions[1].visible = false;
  assert.equal(home.buildHomeFeed(input).offers.length, 0);
  input.contributions[1].visible = true; input.contributions[1].enabled = false;
  assert.equal(home.buildHomeFeed(input).offers.length, 0);
});

test('the directory searches expertise, industries and product titles and ranks reviewed members fairly', async () => {
  const { directoryModel } = await import('../src/lib/homeDirectory.js');
  const feed = { members: [
    { slug: 'one', name: 'One', expertise: ['IoT'], ratingAvg: 5, ratingCount: 1, views: 20 },
    { slug: 'many', name: 'Many', expertise: ['Design'], ratingAvg: 4.8, ratingCount: 40, views: 40 },
  ], products: [{ id: 1, kind: 'offering', slug: 'many', title: 'AI handbook', category: 'Books', ratingCount: 3, ratingAvg: 4.5 }] };
  assert.equal(directoryModel(feed).featured.slug, 'many');
  assert.equal(directoryModel(feed, { query: 'iot' }).members[0].slug, 'one');
  const book = directoryModel(feed, { query: 'handbook' });
  assert.equal(book.members[0].slug, 'many'); assert.equal(book.products.length, 1);
  assert.equal(directoryModel(feed, { query: 'unknown' }).featured, null);
  assert.equal(directoryModel(feed, { query: '  DESIGN  ' }).members[0].slug, 'many');
});

test('unreviewed profiles still appear without fabricated ratings and can be sorted by views', async () => {
  const { directoryModel } = await import('../src/lib/homeDirectory.js');
  const feed = { members: [{ slug: 'old', name: 'Zed', views: 2 }, { slug: 'new', name: 'Amy', views: 6 }], products: [] };
  assert.equal(directoryModel(feed, { sort: 'views' }).featured.slug, 'new');
  assert.equal(directoryModel(feed, { sort: 'name' }).members[0].name, 'Amy');
  assert.equal(directoryModel(feed).hasReviews, false);
  assert.equal(directoryModel({ members: [], products: [] }).featured, null);
});

test('home checkout references retain the owner, correct item kind and real price', async () => {
  const { checkoutItem } = await import('../src/lib/homeDirectory.js');
  const product = checkoutItem({ id: 'guide', kind: 'product', title: 'Guide', pricing: 'paid', price: 499, currency: 'INR', accessReady: true });
  assert.deepEqual(product.checkout, { kind: 'product', id: 'guide' }); assert.equal(product.amount, 499); assert.equal(product.price, '₹499');
  assert.equal(checkoutItem({ id: 4, kind: 'offering', pricing: 'free' }).amount, 0);
  assert.equal(checkoutItem({ id: 4, kind: 'offering', pricing: 'unspecified' }).checkout, null);
});

test('the public feed loads published owners and their portrait/product settings', async () => {
  const input = source();
  const db = scriptedDatabase(...[['profiles', input.profiles], ['users', input.users], ['contributions', input.contributions], ['offerings', input.offerings], ['site_settings', input.sites]].map(([table, data]) => ({ table, data })));
  const data = await home.homeFeed(db);
  assert.equal(data.products.length, 3);
  assert.ok(hasEq(db.calls[0], 'status', 'published'));
  assert.match(step(db.calls.find(call => call.table === 'site_settings'), 'select')[0], /hero_path.*page.*portfolio/);
  assert.deepEqual(await home.homeFeed(scriptedDatabase({ table: 'profiles', data: [] })), { name: process.env.SITE_NAME || 'Persona', mode: 'invite', members: [], offers: [], products: [] });
});

test('feed load failures are propagated rather than pretending the community is empty', async () => {
  await assert.rejects(home.homeFeed(scriptedDatabase({ table: 'profiles', error: { message: 'Unavailable' } })), /Unavailable/);
});

test('product searches keep unrelated products out of the results', async () => {
  const { directoryModel } = await import('../src/lib/homeDirectory.js');
  const feed = { members: [{ slug: 'owner', name: 'Owner', expertise: ['AI'] }], products: [{ slug: 'owner', title: 'AI handbook' }, { slug: 'owner', title: 'Cooking lessons' }] };
  assert.equal(directoryModel(feed, { query: 'handbook' }).products.length, 1);
  assert.equal(directoryModel(feed, { query: 'Owner' }).products.length, 2);
});

test('rating updates preserve aggregate reviews beyond the capped home product feed', async () => {
  const { applyHomeRating } = await import('../src/lib/homeDirectory.js');
  const product = { kind: 'offering', id: 1, slug: 'owner', ratingAvg: 4, ratingCount: 2 };
  const feed = { members: [{ slug: 'owner', ratingAvg: 4, ratingCount: 100 }], products: [product] };
  const next = applyHomeRating(feed, product, { avg: 4.3, count: 3 });
  assert.equal(next.members[0].ratingCount, 101);
  assert.equal(next.products[0].ratingCount, 3);
  assert.equal(feed.members[0].ratingCount, 100);
});

test('discussion labels distinguish one-to-one consultations from group meetings', () => {
  const input = source(); input.contributions[0].category = 'In-Person Discussions'; input.offerings[0].details = { format: 'Small group' };
  assert.equal(home.buildHomeFeed(input).products.find(product => product.id === 1).typeLabel, 'Discussion');
  input.offerings[0].details.format = 'One-to-one';
  assert.equal(home.buildHomeFeed(input).products.find(product => product.id === 1).typeLabel, '1:1 Talk');
});

test('sparse public profiles and long descriptions have safe, truthful fallbacks', () => {
  const input = source(); input.sites = []; input.profiles[0].purpose = 'x'.repeat(400); input.offerings[0].description = 'y'.repeat(800); input.offerings[0].currency = null;
  input.profiles.push({ owner_id: 'missing', name: 'No slug', status: 'published' }, { owner_id: 'a', name: '', status: 'published' });
  const feed = home.buildHomeFeed(input);
  assert.equal(feed.members.length, 1); assert.equal(feed.members[0].photo, null); assert.equal(feed.members[0].cover, null);
  assert.equal(feed.members[0].purpose.length, 240); assert.equal(feed.products[0].description.length, 500);
  assert.equal(home.buildHomeFeed().members.length, 0);
});

test('directory tie breaks and alternate sorts work for old feeds and sparse data', async () => {
  const { directoryModel } = await import('../src/lib/homeDirectory.js');
  const members = [{ slug: 'z', name: 'Zed', views: 2, joined: '2026-01-01' }, { slug: 'a', name: 'Amy', views: 2, joined: '2026-11-01' }];
  assert.equal(directoryModel({ members }, { sort: 'new' }).featured.slug, 'a');
  assert.equal(directoryModel({ members }, { sort: 'views' }).featured.slug, 'a');
  assert.equal(directoryModel({ members: [{ slug: 'z', name: 'Zed' }, { slug: 'a', name: 'Amy' }] }).featured.slug, 'a');
  const offers = [{ id: 1, title: 'Guide', slug: 'a', clicks: 1 }, { id: 2, title: 'Guide 2', slug: 'a', clicks: 4 }];
  assert.equal(directoryModel({ offers }).products[0].id, 2);
  assert.equal(directoryModel({ offers }, { query: 'Guide' }).products.length, 2);
  assert.equal(directoryModel().members.length, 0);
});

test('rating updates handle revised votes, unrated offers and untouched owners without changing the source feed', async () => {
  const { applyHomeRating } = await import('../src/lib/homeDirectory.js');
  assert.equal(applyHomeRating(null, { id: 1 }, { avg: 0, count: 0 }), null);
  const product = { id: 1, slug: 'a' };
  const feed = { members: [{ slug: 'a' }, { slug: 'b', ratingAvg: 5, ratingCount: 3 }], offers: [product, { kind: 'product', id: 1, slug: 'a' }] };
  const first = applyHomeRating(feed, product, { avg: 4, count: 1 });
  assert.equal(first.members[0].ratingCount, 1); assert.equal(first.members[1].ratingCount, 3);
  assert.equal(first.offers[1].ratingCount, undefined);
  const revised = applyHomeRating(first, product, { avg: 5, count: 1 });
  assert.equal(revised.members[0].ratingCount, 1); assert.equal(revised.members[0].ratingAvg, 5);
  assert.equal(applyHomeRating({ members: [{ slug: 'a' }] }, product, { avg: 0, count: 0 }).members[0].ratingAvg, 0);
});

test('a creator with contact disabled sends product enquiries to their available public chat', () => {
  const input = source(); input.sites[0].portfolio.enquiry = { enabled: false };
  assert.equal(home.buildHomeFeed(input).products[0].contactPath, '/p/ravi/chat');
});
