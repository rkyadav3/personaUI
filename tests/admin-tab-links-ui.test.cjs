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
const render = (Component, props, path) => renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Component, props)));

test('payment setting links from the assistant open payment settings, including the legacy settings alias', () => {
  const Purchases = require('../src/pages/Purchases.jsx').default;
  for (const tab of ['settings', 'payments']) {
    const html = render(Purchases, {}, `/admin/purchases?tab=${tab}`);
    assert.match(html, /aria-pressed="true"[^>]*>[\s\S]*?Payment settings/);
    assert.doesNotMatch(html, /aria-pressed="true"[^>]*>[\s\S]*?<span>Receipts &amp; fulfillment/);
  }
});

test('offering links select categories and visibility links select privacy controls', () => {
  const { ProfileManager } = require('../src/pages/Profile.jsx');
  const props = { data: { profile: { name: 'Owner', status: 'published', visibility: { contact: {} } }, contributions: [] }, reload() {} };
  const offerings = render(ProfileManager, props, '/admin/profile?tab=contrib');
  assert.match(offerings, /Offerings &amp; categories/);
  assert.match(offerings, /Add category/);
  assert.doesNotMatch(offerings, /Save Profile Changes/);
  const visibility = render(ProfileManager, props, '/admin/profile?tab=visibility');
  assert.match(visibility, /Save Visibility/);
  assert.doesNotMatch(visibility, /Save Profile Changes/);
});

test('tab URL updates preserve unrelated parameters and invalid tabs fall back', async () => {
  const { readAdminTab, updateAdminTab } = await import('../src/lib/adminTabs.js');
  const values = ['purchases', 'payments'];
  assert.equal(readAdminTab(new URLSearchParams('tab=settings'), { values, defaultValue: 'purchases', aliases: { settings: 'payments' } }), 'payments');
  assert.equal(readAdminTab(new URLSearchParams('tab=unknown'), { values, defaultValue: 'purchases' }), 'purchases');
  const old = new URLSearchParams('tab=purchases&focus=receipt&filter=paid');
  assert.equal(updateAdminTab(old, 'payments').toString(), 'tab=payments&focus=receipt&filter=paid');
  assert.equal(old.get('tab'), 'purchases');
  assert.equal(updateAdminTab(new URLSearchParams('folder=4'), 'event', 'kind').toString(), 'folder=4&kind=event');
});

test('preview failures offer retry while an absent profile offers setup and loading remains SVG', () => {
  const { PortfolioPreviewState } = require('../src/pages/PortfolioEditor.jsx');
  const html = render(PortfolioPreviewState, { error: 'Preview unavailable', onRetry() {} }, '/admin/portfolio');
  assert.match(html, /Preview unavailable/);
  assert.match(html, /Retry preview/);
  assert.doesNotMatch(html, /Create your profile first/);
  const absent = render(PortfolioPreviewState, { missing: true }, '/admin/portfolio');
  assert.match(absent, /href="\/admin\/profile"/);
  assert.match(absent, /Create your profile/);
  const loading = render(PortfolioPreviewState, {}, '/admin/portfolio');
  assert.match(loading, /<svg/);
});
