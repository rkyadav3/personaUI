const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const { transformSync } = require('esbuild');
Module._extensions['.jsx'] = (module, file) => module._compile(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'jsx', format: 'cjs', jsx: 'automatic' }).code, file);
Module._extensions['.css'] = () => {};
const React = require('react');
const { renderToStaticMarkup: renderMarkup } = require('react-dom/server');
const { StaticRouter } = require('react-router-dom/server');
const renderToStaticMarkup = element => renderMarkup(React.createElement(StaticRouter, {}, element));
const PortfolioSite = require('../src/components/portfolio/PortfolioSite.jsx').default;
const { ShopCard } = require('../src/components/commerce/Shop.jsx');
const { PurchaseConfirmation } = require('../src/components/commerce/CheckoutDialog.jsx');
const { RsvpForm } = require('../src/components/portfolio/Events.jsx');

test('the profile home page renders all seven shop items and its published Event', () => {
  const offerings = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, title: `Home item ${i + 1}`, pricing: i % 2 ? 'paid' : 'free', price: i % 2 ? 49 : null, currency: 'INR' }));
  const html = renderToStaticMarkup(React.createElement(PortfolioSite, { slug: 'owner', preview: true, data: { name: 'Owner', contributions: [{ category: 'Books', offerings }], events: [{ id: 8, kind: 'event', title: 'Community meetup', startsAt: '2026-12-10T10:00:00Z', rsvp: { enabled: true } }] } }));
  assert.match(html, /Home item 7/);
  assert.match(html, /Community meetup/);
  assert.match(html, /Get free/);
  assert.match(html, /Buy now/);
});

test('the shop explains unavailable access links and prevents live checkout', () => {
  const html = renderToStaticMarkup(React.createElement(ShopCard, { item: { title: 'Soon', kind: 'product', id: 'soon', checkout: { kind: 'product', id: 'soon' }, pricing: 'free', accessReady: false }, onCheckout() {} }));
  assert.match(html, /disabled/);
  assert.match(html, /Delivery file coming soon/);
});

test('a completed receipt displays its buyer, amount and usable access link', () => {
  const html = renderToStaticMarkup(React.createElement(PurchaseConfirmation, { row: { id: 'receipt', title: 'Book', status: 'paid', amount: 4900, currency: 'INR', deliveryUrl: 'https://example.test/access', buyer: { name: 'Visitor', email: 'visitor@example.test' }, paymentId: 'pay_test' } }));
  for (const text of ['Purchase confirmed', 'Visitor', 'visitor@example.test', 'pay_test', 'https://example.test/access']) assert.ok(html.includes(text));
  assert.match(html, /₹49/);
});

test('visitor event forms include attendance choices and the owner’s required questions', () => {
  const html = renderToStaticMarkup(React.createElement(RsvpForm, { event: { id: 1, rsvp: { requirePhone: true, questions: [{ id: 'meal', label: 'Meal preference', required: true }] } }, slug: 'owner', owner: 'Owner', onSaved() {} }));
  assert.match(html, /Not going/);
  assert.match(html, /Meal preference/);
  assert.match(html, /Phone \*/);
  assert.match(html, /Show my name/);
});

test('profiles with legacy Classic settings retain every shop item and Event in the portfolio', () => {
  const html = renderToStaticMarkup(React.createElement(PortfolioSite, { slug: 'owner', preview: true, data: { name: 'Owner', page: { template: 'classic', placement: { Books: 'side' } }, contributions: [{ category: 'Books', offerings: Array.from({ length: 7 }, (_, i) => ({ id: i + 1, title: `Classic item ${i + 1}`, pricing: i % 2 ? 'paid' : 'free', price: i % 2 ? 49 : null, currency: 'INR' })) }], portfolio: { products: [{ id: 'extra', title: 'Extra guide', pricing: 'free', accessReady: true }] }, events: [{ id: 8, title: 'Classic meetup', startsAt: '2026-12-10T10:00:00Z', rsvp: { enabled: true } }] } }));
  for (const text of ['Classic item 7', 'Classic meetup', 'Extra guide', 'Get free', 'Buy now']) assert.ok(html.includes(text), `Missing ${text}`);
});

test('the Event editor exposes attendance and custom question settings', () => {
  const { UpdateEditor } = require('../src/pages/Updates.jsx');
  assert.equal(typeof UpdateEditor, 'function');
  const html = renderToStaticMarkup(React.createElement(UpdateEditor, { item: { kind: 'event', title: 'Meetup', status: 'published', rsvp: { enabled: true } }, onDone() {} }));
  assert.match(html, /Response form/);
  assert.match(html, /Show attendee names/);
  assert.match(html, /Add question/);
});

test('the admin purchase detail exposes buyer, gateway reference and fulfillment controls', () => {
  const { PurchaseDetails } = require('../src/pages/Purchases.jsx');
  const html = renderToStaticMarkup(React.createElement(PurchaseDetails, { row: { id: 'receipt', status: 'paid', buyer: { name: 'Visitor', email: 'visitor@example.test', phone: '1234567890' }, orderId: 'order_test', paymentId: 'pay_test', fulfillmentStatus: 'fulfilled', deliveryUrl: 'https://example.test/access' }, onSaved() {} }));
  for (const text of ['visitor@example.test', '1234567890', 'order_test', 'pay_test', 'Private note', 'Fulfilled']) assert.ok(html.includes(text));
});

test('the native checkout dialog leaves the page’s top layer while Razorpay is active', () => {
  const Dialog = require('../src/components/commerce/Dialog.jsx').default;
  const html = renderToStaticMarkup(React.createElement(Dialog, { suspended: true, titleId: 'title', onClose() {} }, React.createElement('h2', { id: 'title' }, 'Checkout')));
  assert.equal(html, '');
});

test('editing a legacy offering offers a hosted delivery upload', () => {
  const { OfferingForm } = require('../src/components/profile/Contributions.jsx');
  assert.equal(typeof OfferingForm, 'function');
  const html = renderToStaticMarkup(React.createElement(OfferingForm, { contribution: { id: 1, category: 'Books' }, offering: { title: 'Book', pricing: 'free', delivery_url: 'https://example.test/private-access', details: {} }, onDone() {} }));
  assert.match(html, /Choose file for Private delivery file/);
  assert.doesNotMatch(html, /value="https:/);
});

test('uploaded portrait crop settings reach the circular photo and removal restores initials', () => {
  const profile = { name: 'Photo Test', hero: 'https://example.test/portrait.png', page: { hero: { x: 37, y: 62, zoom: 1.75 } }, portfolio: { photoStyle: 'color' } };
  const render = data => renderToStaticMarkup(React.createElement(PortfolioSite, { data, slug: 'photo-test', preview: true }));
  assert.match(render(profile), /object-position:37% 62%;transform:scale\(1\.75\)/);
  assert.match(render({ ...profile, hero: null }), /class="pf-mono">PT<\/span>/);
});
