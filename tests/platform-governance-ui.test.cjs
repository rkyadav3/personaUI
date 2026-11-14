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
const render = (Component, props, path = '/') => renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Component, props)));

test('contact stays in page navigation while repeated contact buttons are removed', () => {
  const PortfolioSite = require('../src/components/portfolio/PortfolioSite.jsx').default;
  for (const sub of ['home', 'activity', 'store', 'contact']) {
    const html = render(PortfolioSite, { data: { name: 'Owner' }, slug: 'owner', sub, preview: true });
    assert.match(html, /Contact/);
    assert.doesNotMatch(html, /Let’s Connect|Work with me/);
  }
});

test('account menu shows login for visitors and dashboard and logout for signed-in users', () => {
  const AccountMenu = require('../src/components/AccountMenu.jsx').default;
  assert.match(render(AccountMenu, { user: null }), /Login/);
  const member = render(AccountMenu, { user: { id: 'a' } });
  assert.match(member, /aria-label="Account options"/); assert.match(member, /Dashboard/); assert.match(member, /Logout/);
  assert.match(render(AccountMenu, { user: { isSuperAdmin: true } }), /href="\/superadmin"/);
});

test('members get invites and suggestions and only SuperAdmins get platform navigation', () => {
  const { StudioSidebar } = require('../src/components/Layout.jsx');
  const html = render(StudioSidebar, { user: { name: 'Member' } }, '/admin');
  assert.match(html, />Invite</); assert.match(html, /href="\/admin\/invites"/); assert.doesNotMatch(html, /SuperAdmin dashboard/);
  const owner = render(StudioSidebar, { user: { name: 'Owner', isSuperAdmin: true } }, '/superadmin');
  assert.match(owner, /SuperAdmin dashboard/);
});

test('the customer dashboard presents real counts and public and private tags', () => {
  const { CustomerManager } = require('../src/pages/SuperAdmin.jsx');
  const html = render(CustomerManager, { user: { id: 'owner' }, users: [{ id: 'a', name: 'Maya', email: 'maya@example.test', tags: ['special', 'private'] }], reload() {}, dashboard: true }, '/superadmin');
  assert.match(html, /SuperAdmin dashboard/); assert.match(html, /Private profiles/); assert.match(html, /Special/); assert.match(html, /Private profile/); assert.match(html, /Edit &amp; tags/);
});

test('invite history displays the creator and the invited member instead of a global user list', () => {
  const { InviteManager } = require('../src/pages/Invites.jsx');
  const html = render(InviteManager, { user: { id: 'a' }, reload() {}, data: { codes: [{ id: 1, code: 'ABCD2345', max_uses: 1, uses: 1, creator: { name: 'Maya', email: 'maya@example.test' } }], redemptions: [{ id: 1, code: 'ABCD2345', creator_name: 'Maya', invited_name: 'Dev', invited_email: 'dev@example.test' }] } }, '/admin/invites');
  assert.match(html, /Your invite links/); assert.match(html, /Created by/); assert.match(html, /Invited members log/); assert.match(html, /maya@example.test/); assert.match(html, /dev@example.test/);
});

test('suggestion senders see owner replies while review controls only render for SuperAdmins', () => {
  const { SuggestionManager } = require('../src/pages/Suggestions.jsx');
  const props = { rows: [{ id: 1, kind: 'add', title: 'Search by tags', body: 'Help discovery', status: 'planned', owner_reply: 'We will build this.' }], reload() {} };
  const member = render(SuggestionManager, { ...props, user: { isAdmin: true } }, '/admin/suggestions');
  assert.match(member, /We will build this/); assert.doesNotMatch(member, /Save response/);
  const owner = render(SuggestionManager, { ...props, user: { isSuperAdmin: true } }, '/superadmin/suggestions');
  assert.match(owner, /Save response/); assert.match(owner, /Reply to admin/);
  assert.doesNotMatch(owner, /Send suggestion|Suggest an improvement/);
});

test('SuperAdmin navigation has sales and main site settings without a personal Studio', () => {
  const { StudioSidebar } = require('../src/components/Layout.jsx');
  const owner = render(StudioSidebar, { user: { name: 'Owner', slug: 'owner', isSuperAdmin: true, isAdmin: false } }, '/superadmin');
  assert.match(owner, /Sales &amp; payments/); assert.match(owner, /Main site settings/);
  assert.doesNotMatch(owner, /My Studio|Edit portfolio|View live portfolio|Creator/);
});

test('platform financial UI shows currency totals, seller earnings and safe transaction details', () => {
  const { SalesManager } = require('../src/pages/PlatformPayments.jsx');
  const report = { counts: { paidSales: 2, freeOrders: 1, pending: 0, failed: 1, refundedOrders: 0 }, currencies: [{ currency: 'INR', gross: 12000, refunds: 2000, net: 10000, paidSales: 2 }], admins: [{ id: 'a', name: 'Maya', email: 'maya@example.test', accountExists: true, checkoutEnabled: true, paidSales: 2, freeOrders: 1, earnings: [{ currency: 'INR', gross: 12000, refunds: 2000, net: 10000 }] }], products: [{ ownerId: 'a', itemId: 'p', kind: 'product', title: 'Design book', adminName: 'Maya', currency: 'INR', paidSales: 2, gross: 12000, refunds: 2000, net: 10000 }], recent: [] };
  const html = render(SalesManager, { report, reload() {} }, '/superadmin/sales');
  assert.match(html, /Sales &amp; payments/); assert.match(html, /Net earnings/); assert.match(html, /INR/);
  assert.match(html, /Maya/); assert.match(html, /Design book/); assert.match(html, /Pause checkout/);
});

test('global main site settings render on the public directory and control its sections', () => {
  const { HomeDirectory } = require('../src/pages/Home.jsx');
  const html = render(HomeDirectory, { feed: { name: 'Persona', mode: 'invite', settings: { siteName: 'Community', headline: 'Find your', highlight: 'next', headlineEnd: 'mentor', showFeatured: false, showProducts: false, showInviteLink: false, accent: '#123456' }, members: [{ name: 'Maya', slug: 'maya' }], products: [] }, user: null });
  assert.match(html, /Community/); assert.match(html, /Find your/); assert.match(html, /#123456/);
  assert.doesNotMatch(html, /Featured professional|directory-products-heading|Join with an invitation/);
});
