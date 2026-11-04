const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const { transformSync } = require('esbuild');
Module._extensions['.jsx'] = (module, file) => module._compile(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'jsx', format: 'cjs', jsx: 'automatic' }).code, file);
Module._extensions['.css'] = () => {};
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { MemoryRouter } = require('react-router-dom');
const render = element => renderToStaticMarkup(React.createElement(MemoryRouter, {}, element));
const PortfolioSite = require('../src/components/portfolio/PortfolioSite.jsx').default;

test('Chat is a page inside the portfolio shell with an accessible message form', () => {
  const html = render(React.createElement(PortfolioSite, { data: { name: 'Ravi' }, slug: 'ravi', sub: 'chat', preview: true }));
  assert.match(html, /Chat with Ravi/);
  assert.match(html, /aria-label="Message to Ravi/);
  assert.match(html, /aria-label="Send message/);
  assert.match(html, /aria-current="page"/);
  assert.doesNotMatch(html, /View All Projects/);
});

test('the consolidated editor offers Look, Store and Persona controls without a page-style selector', () => {
  const { LookControls, StoreControls, PersonaControls } = require('../src/components/portfolio/PortfolioControls.jsx');
  const { normalizePage } = require('../shared/pageSettings.js');
  const { normalizeBg } = require('../shared/siteSettings.js');
  const props = { page: normalizePage(), bg: normalizeBg(), setPage() {}, setBg() {}, imageUrl: null, onChooseBackground() {}, onRemoveBackground() {} };
  const html = render(React.createElement(React.Fragment, {}, React.createElement(LookControls, props), React.createElement(StoreControls, props), React.createElement(PersonaControls, props)));
  for (const label of ['Background style', 'Font', 'Edge refraction', 'Shop title', 'Chat greeting', 'Microphone', 'Show answer sources', 'Sphere size', 'Background image']) assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /Classic|Public page style/);
});

test('the overview matches the reference with a personal greeting, command bar and four shortcuts', () => {
  const { OverviewContent } = require('../src/pages/Overview.jsx');
  const html = render(React.createElement(OverviewContent, { user: { name: 'Ravi Kumar Yadav' }, hour: 14, data: { counts: { files: 2, posts: 3, topics: 1, chunks: 4, embedded: 4, bytes: 0, drafts: 0 }, recent: [] } }));
  for (const text of ['Good afternoon, Ravi', 'What would you like to do', 'today?', 'Create a new template', 'Write a post', 'Update my persona', 'Organize my files']) assert.ok(html.includes(text), text);
  assert.match(html, /aria-label="What would you like to do/);
  assert.match(html, /type="submit"/);
  assert.match(html, /href="\/admin\/files\?tab=upload"/);
});

test('studio navigation has one portfolio editor and preserves Events and Purchases access', () => {
  const { StudioSidebar } = require('../src/components/Layout.jsx');
  const html = render(React.createElement(StudioSidebar, { user: { name: 'Ravi', slug: 'ravi', isAdmin: false }, unread: 2, onLogout() {} }));
  for (const text of ['Studio', 'Overview', 'Projects', 'Templates', 'Files &amp; Storage', 'Knowledge Base', 'Updates &amp; Schedule', 'Purchases']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /href="\/admin\/(?:page|settings)"/);
  assert.match(html, /href="\/p\/ravi"/);
});

test('Chat respects disabled microphone, source and sphere settings in its preview', () => {
  const html = render(React.createElement(PortfolioSite, { data: { name: 'Ravi', bg: { ball: false }, page: { ball: { show: false }, chat: { mic: false, sources: false }, headline: 'Ask Ravi about', headlineAccent: 'design.' } }, slug: 'ravi', sub: 'chat', preview: true }));
  assert.match(html, /Ask Ravi about/);
  assert.match(html, /design\./);
  assert.doesNotMatch(html, /aria-label="Start microphone"/);
  assert.doesNotMatch(html, /<canvas/);
});

test('portfolio glass panels use the selected radius instead of a fixed Classic value', () => {
  const html = render(React.createElement(PortfolioSite, { data: { name: 'Ravi', portfolio: { projects: [{ title: 'Project', summary: 'My project' }] }, page: { theme: { radius: 42 } } }, slug: 'ravi', preview: true }));
  assert.match(html, /--lg-r:42px/);
});

test('Chat profile card keeps its custom text when portfolio hero text is also set', () => {
  const html = render(React.createElement(PortfolioSite, { data: { name: 'Ravi', portfolio: { titleLine: 'Portfolio headline', bio: 'Portfolio introduction' }, page: { tagline: 'Chat profile tagline', about: 'Chat profile introduction' } }, slug: 'ravi', sub: 'chat', preview: true }));
  assert.match(html, /Chat profile tagline/);
  assert.match(html, /Chat profile introduction/);
});
