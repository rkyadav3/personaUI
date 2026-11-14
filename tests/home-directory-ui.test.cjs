const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const { transformSync } = require('esbuild');
Module._extensions['.jsx'] = (module, file) => module._compile(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'jsx', format: 'cjs', jsx: 'automatic' }).code, file);
Module._extensions['.css'] = () => {};
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { StaticRouter } = require('react-router-dom/server');
const render = element => renderToStaticMarkup(React.createElement(StaticRouter, {}, element));

test('sold-out directory products retain access to an existing saved receipt', () => {
  const { ProductDetails } = require('../src/components/home/ProductDialog.jsx');
  const product = { slug: 'quantity-fixture', kind: 'product', id: 'book', title: 'Book', pricing: 'paid', price: 10, currency: 'INR', accessReady: true, quantity: 0 };
  const previousStorage = global.localStorage;
  try {
    global.localStorage = { getItem: () => null };
    const soldOut = render(React.createElement(ProductDetails, { product, onCheckout() {} }));
    assert.match(soldOut, /Sold out/);
    assert.doesNotMatch(soldOut, /<button[^>]*>Buy now/);
    global.localStorage = { getItem: () => JSON.stringify({ requestId: '223ecb9d-6e31-4e2e-bb6e-5ce70c74e5ef', receiptToken: Buffer.alloc(32, 7).toString('base64url') }) };
    assert.match(render(React.createElement(ProductDetails, { product, onCheckout() {} })), /<button[^>]*>View purchase/);
  } finally { global.localStorage = previousStorage; }
});
const feed = { name: 'Persona', members: [{ slug: 'ravi', name: 'Ravi Kumar Yadav', designation: 'Technology & Product Development Enthusiast', expertise: ['AI/ML', 'IoT'], purpose: 'Builds useful tools.', photo: 'https://public.test/ravi.png', views: 12400, ratingAvg: 4.9, ratingCount: 128, engagements: 98 }], products: [{ id: 1, slug: 'ravi', member: 'Ravi Kumar Yadav', kind: 'offering', title: 'Building AI Products', typeLabel: 'Book', pricing: 'paid', price: 499, currency: 'INR', accessReady: true }] };

test('custom tag labels appear on featured profiles and directory cards', () => {
  const { HomeDirectory } = require('../src/pages/Home.jsx');
  const html = render(React.createElement(HomeDirectory, { feed: { ...feed, tagDefinitions: [{ key: 'custom-creative-partner', label: 'Creative Partner', visibility: 'public' }], members: [{ ...feed.members[0], tags: ['custom-creative-partner'] }] } }));
  assert.equal((html.match(/>Creative Partner</g) || []).length, 2);
});

test('featured profile settings change its presentation while keeping the real profile link', () => {
  const { FeaturedProfile, HomeDirectory } = require('../src/pages/Home.jsx');
  const settings = { featuredBadge: 'Community spotlight', featuredButton: 'Explore this profile', featuredButtonStyle: 'square', featuredPortrait: false, featuredBio: false, featuredRole: false, featuredExpertise: false, featuredReviews: false, featuredViews: false, featuredInteractions: false };
  const html = render(React.createElement(FeaturedProfile, { member: feed.members[0], settings }));
  assert.match(html, /Community spotlight/); assert.match(html, /Explore this profile/); assert.match(html, /shape-square/); assert.match(html, /without-portrait/); assert.match(html, /href="\/p\/ravi"/);
  assert.doesNotMatch(html, /directory-portrait|directory-stat|directory-role|directory-bio|directory-tags/);
  assert.match(render(React.createElement(HomeDirectory, { feed: { ...feed, settings } })), /Community spotlight/);
  assert.doesNotMatch(render(React.createElement(FeaturedProfile, { member: feed.members[0], settings: { featuredShowBadge: false, featuredButton: ' ' } })), /directory-feature-badge/);
});

test('main home renders the reference layout with a featured profile, real metrics and products', () => {
  const { HomeDirectory } = require('../src/pages/Home.jsx');
  const html = render(React.createElement(HomeDirectory, { feed }));
  for (const text of ['Explore', 'profiles', 'Top Rated Profiles', 'Store items', 'Ravi Kumar Yadav', 'Building AI Products', '₹499', '128 offering reviews', '12.4K', 'offering interactions']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /CREATIVE &amp; TECHNOLOGY LEADERS|Meet industry/);
  assert.match(html, /href="\/p\/ravi"/);
  assert.match(html, /aria-label="Search profiles, expertise, or industries"/);
  assert.match(html, /aria-label="Browse products"/);
  assert.doesNotMatch(html, /reliability score|verified experts/i);
});

test('the home account control leads to the admin and supports invitation-only joining', () => {
  const { HomeDirectory } = require('../src/pages/Home.jsx');
  const html = render(React.createElement(HomeDirectory, { feed: { ...feed, mode: 'invite' }, user: { name: 'Owner' } }));
  assert.match(html, /aria-label="Account options"/);
  assert.match(html, /href="\/admin\?tab=dashboard"/);
  assert.match(html, /Logout/);
  assert.match(html, /href="\/invite"/);
});

test('empty, loading and failed home feeds have distinct useful states', () => {
  const { HomeDirectory } = require('../src/pages/Home.jsx');
  assert.match(render(React.createElement(HomeDirectory, {})), /Loading profiles/);
  const failed = render(React.createElement(HomeDirectory, { error: 'Could not load profiles', onRetry() {} }));
  assert.match(failed, /Could not load profiles/); assert.match(failed, /Retry/);
  const empty = render(React.createElement(HomeDirectory, { feed: { members: [], products: [] } }));
  assert.match(empty, /No published profiles yet/);
  assert.doesNotMatch(empty, /4\.9|98%|Top Rated Creator/);
});

test('product details expose real checkout, creator links and visitor ratings for offerings', () => {
  const { ProductDetails } = require('../src/components/home/ProductDialog.jsx');
  const html = render(React.createElement(ProductDetails, { product: feed.products[0], onCheckout() {} }));
  assert.match(html, /Buy now/);
  assert.match(html, /href="\/p\/ravi"/);
  assert.match(html, /aria-label="Rate this offering"/);
  assert.match(html, /₹499/);
});

test('a product without an access link exposes contact instead of enabled checkout', () => {
  const { ProductDetails } = require('../src/components/home/ProductDialog.jsx');
  const html = render(React.createElement(ProductDetails, { product: { ...feed.products[0], accessReady: false }, onCheckout() {} }));
  assert.match(html, /Access link coming soon/);
  assert.match(html, /href="\/p\/ravi\/contact"/);
  assert.doesNotMatch(html, /class="directory-buy">Buy now/);
});

test('public profile shops let visitors rate offerings while previews cannot submit feedback', () => {
  const { ShopCard } = require('../src/components/commerce/Shop.jsx');
  const item = { kind: 'offering', id: 1, title: 'Book', pricing: 'free', accessReady: true };
  assert.match(render(React.createElement(ShopCard, { item, slug: 'owner', onCheckout() {} })), /aria-label="Rate this offering"/);
  const OfferingRating = require('../src/components/home/OfferingRating.jsx').default;
  assert.match(render(React.createElement(OfferingRating, { product: { ...item, slug: 'owner' }, preview: true })), /Ratings are available on your live profile/);
  assert.match(render(React.createElement(OfferingRating, { product: { ...item, slug: 'owner' }, user: { slug: 'owner' } })), /You cannot rate your own offering/);
});
