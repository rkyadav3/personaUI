const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), Module = require('node:module');
const { transformSync } = require('esbuild');
Module._extensions['.jsx'] = (module, file) => module._compile(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'jsx', format: 'cjs', jsx: 'automatic' }).code, file);
Module._extensions['.css'] = () => {};
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server'), { MemoryRouter } = require('react-router-dom');
const Site = require('../src/components/portfolio/PortfolioSite.jsx').default;
const render = (props, path = '/p/owner/home') => renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Site, { slug: 'owner', preview: true, ...props })));

test('Home hides and reorders real sections, resolves selected products and applies styles', () => {
  const html = render({ sub: 'home', data: { name: 'Owner', portfolio: { products: [{ id: 'a', title: 'Product A' }, { id: 'b', title: 'Product B' }], about: { body: 'My story' } }, page: { customization: { homeHidden: ['intro'], homeOrder: ['about', 'store', 'intro', 'updates', 'events', 'projects'], homeFeaturedItems: ['product:b'], photoShape: 'square', buttonStyle: 'pill', storeLayout: 'list', scheme: 'dark' } } } });
  assert.doesNotMatch(html, /pf-hero|Product A/); assert.match(html, /Product B/); assert.ok(html.indexOf('My story') < html.indexOf('Product B'));
  for (const value of ['pf-dark', 'photo-square', 'buttons-pill', 'shop-list']) assert.ok(html.includes(value), value);
});
test('Store display hides optional copy and prices while preserving checkout and pagination', () => {
  const html = render({ sub: 'store', data: { name: 'Owner', portfolio: { products: Array.from({length: 3}, (_, index) => ({id: `item-${index}`, title: `Item ${index}`, summary: 'Hidden summary', pricing: 'paid', amount: 99, deliveryUrl: 'https://example.test/access'})) }, page: { storeLimit: 2, customization: { storeDescriptions: false, storePrices: false, storeBadges: false, storeLayout: 'list', storeImageRatio: 'square' } } } });
  assert.doesNotMatch(html, /Hidden summary|₹99|persona-tag/); assert.match(html, /Buy now/); assert.match(html, /Show more items/); assert.doesNotMatch(html, /<h3>Item 2<\/h3>/);
});
test('Chat greeting, suggestions and product sidebar respond to customization', () => {
  const html = render({ sub: 'chat', data: { name: 'Owner', page: { customization: { chatWelcome: 'Welcome to my space', chatSuggestions: false, chatStore: false, chatBubbleStyle: 'compact' } }, portfolio: { products: [{ title: 'Hidden sidebar item' }] } } });
  assert.match(html, /Welcome to my space/); assert.match(html, /bubbles-compact/); assert.doesNotMatch(html, /Suggested questions|Popular products|Hidden sidebar item/);
});
test('Contact optional fields can be hidden and the submit label is editable', () => {
  const html = render({ sub: 'contact', data: { name: 'Owner', page: { customization: { contactFields: [], contactButton: 'Send request' } } } });
  for (const field of ['phone', 'organisation', 'location', 'budget']) assert.ok(!html.includes(`id="enq-${field}"`), field);
  assert.match(html, /Send request/); for (const field of ['name', 'email', 'subject', 'message', 'consent']) assert.ok(html.includes(`id="enq-${field}"`), field);
});

test('Contact defaults to a centered form with direct details and supports an optional sidebar', () => {
  const data = { name: 'Owner', contact: { email: 'owner@example.test' } };
  const centered = render({ sub: 'contact', data });
  assert.match(centered, /contact-centered contact-width-wide/); assert.match(centered, /mailto:owner@example.test/); assert.match(centered, /id="enq-message"/);
  const sidebar = render({ sub: 'contact', data: { ...data, page: { customization: { contactLayout: 'sidebar', contactWidth: 'comfortable' } } } });
  assert.match(sidebar, /contact-sidebar contact-width-comfortable/);
  const hidden = render({ sub: 'contact', data: { ...data, page: { customization: { contactDetails: false } } } });
  assert.doesNotMatch(hidden, /Prefer to reach out directly/); assert.match(hidden, /id="enq-message"/);
  const closed = render({ sub: 'contact', data: { ...data, portfolio: { enquiry: { enabled: false } }, page: { customization: { contactDetails: false } } } });
  assert.match(closed, /Enquiries are currently closed/); assert.doesNotMatch(closed, /Use the contact details/);
});

test('the introduction button can be hidden without losing the Chat navigation', () => {
  const data = { name: 'Owner', portfolio: { intro: { label: 'Watch my introduction', url: 'https://example.test/video' } } };
  assert.match(render({ sub: 'home', data }), /Watch my introduction/);
  const hidden = render({ sub: 'home', data: { ...data, page: { customization: { introButton: false } } } });
  assert.doesNotMatch(hidden, /Watch my introduction/); assert.match(hidden, /Chat/);
});
test('Activity uses configured opening category and displays a real featured project badge', () => {
  const html = render({ sub: 'activity', data: { name: 'Owner', portfolio: { projects: [{ title: 'Regular' }, { title: 'Featured project', featured: true }] }, page: { customization: { activitySections: ['projects'], activityDefault: 'projects', activityLayout: 'timeline' } } } });
  assert.match(html, /activity-timeline/); assert.match(html, /pf-pill sm feat">Featured/); assert.doesNotMatch(html, />Certificates<\/button>/);
});
