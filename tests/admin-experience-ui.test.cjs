const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), Module = require('node:module');
const { transformSync } = require('esbuild');
Module._extensions['.jsx'] = (module, file) => module._compile(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'jsx', format: 'cjs', jsx: 'automatic' }).code, file);
Module._extensions['.css'] = () => {};
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server'), { MemoryRouter } = require('react-router-dom');
const render = (Component, props, path = '/') => renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Component, props)));
test('Overview has no separate dashboard and profile is part of Settings', async () => {
  const { ADMIN_SECTIONS, adminLocation } = await import('../src/lib/adminNavigation.js');
  assert.equal(ADMIN_SECTIONS[0].pages.length, 1);
  assert.equal(adminLocation('/admin/profile').group, 'settings');
  const { OverviewContent } = require('../src/pages/Overview.jsx');
  const html = render(OverviewContent, { user: { name: 'Maya' }, data: { counts: {} } }, '/admin?tab=dashboard');
  assert.match(html, /What would you like to do/); assert.doesNotMatch(html, /<h1>Dashboard/);
});
test('Add category appears above the existing offering categories', () => {
  const Contributions = require('../src/components/profile/Contributions.jsx').default;
  const html = render(Contributions, { items: [{ id: 1, category: 'Books', offerings: [] }], reload() {} }, '/admin/profile?tab=contrib');
  assert.ok(html.indexOf('Add category') < html.indexOf('<h3>Books'));
  assert.match(html, />Add offering</);
});
test('main site settings include an actual live directory iframe', () => {
  const { MainSiteEditor } = require('../src/pages/MainSiteSettings.jsx');
  const html = render(MainSiteEditor, { initial: {} });
  assert.match(html, /<iframe/); assert.match(html, /Live main site preview/);
});

test('public portfolios render custom tags with their saved labels', () => {
  const PortfolioSite = require('../src/components/portfolio/PortfolioSite.jsx').default;
  const html = render(PortfolioSite, { slug: 'maya', preview: true, data: { name: 'Maya', tags: ['custom-mentor'], tagDefinitions: [{ key: 'custom-mentor', label: 'Mentor', visibility: 'public' }] } });
  assert.match(html, />Mentor</);
});
test('return activity is dismissible and assistant analytics have readable data and chart alternatives', () => {
  const { ActivityGlimpse, AnalyticsPanels } = require('../src/components/AdminActivity.jsx');
  const html = render(ActivityGlimpse, { summary: { hasChanges: true, since: '2026-11-11', metrics: [{ key: 'sales', label: 'Paid sales', increase: 3, current: 5, href: '/admin/purchases' }], revenue: [] }, onClose() {} });
  assert.match(html, /While you were away/); assert.match(html, /Dismiss activity summary/); assert.match(html, /\+3/);
  const panels = render(AnalyticsPanels, { data: { metrics: [{ label: 'Profile views', value: 25 }], revenue: [], dailySales: [{ day: '2026-11-12', sales: 2 }], asOf: '2026-11-12T00:00:00Z' } });
  assert.match(panels, /Profile views/); assert.match(panels, /Daily paid sales/); assert.match(panels, /2026-11-12/);
});
