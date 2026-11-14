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

test('payment preferences appear in Settings with the matching navigation selected', () => {
  const Settings = require('../src/pages/Settings.jsx').default;
  const { AdminSectionTabs } = require('../src/components/AdminNavigation.jsx');
  const html = render(Settings, {}, '/admin/settings?tab=payments');
  assert.match(html, /<h1>Payment settings<\/h1>/);
  assert.doesNotMatch(html, /Receipts &amp; fulfillment|Purchase tools/);
  const nav = render(AdminSectionTabs, { user: { isAdmin: false } }, '/admin/settings?tab=payments');
  assert.match(nav, /<a(?=[^>]*href="\/admin\/settings\?tab=payments")(?=[^>]*aria-current="page")[^>]*>/);
});

test('offering links select categories and privacy controls have one Settings editor', () => {
  const { ProfileManager } = require('../src/pages/Profile.jsx');
  const props = { data: { profile: { name: 'Owner', status: 'published', visibility: { contact: {} } }, contributions: [] }, reload() {} };
  const offerings = render(ProfileManager, props, '/admin/profile?tab=contrib');
  assert.equal(offerings, ''); // Router redirects the retired editor to Store.
  const source = fs.readFileSync('src/pages/Profile.jsx', 'utf8');
  assert.match(source, /Navigate to=\{`\/admin\/store\?tab=categories/);
  assert.doesNotMatch(source, /<Contributions/);
  const { PrivacyPreferences } = require('../src/pages/Settings.jsx');
  const visibility = render(PrivacyPreferences, { value: { contact: {} }, onChange() {}, onSave() {}, busy: false }, '/admin/settings?tab=privacy');
  assert.match(visibility, /Save visibility/);
  assert.match(visibility, /Contact details/);
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
