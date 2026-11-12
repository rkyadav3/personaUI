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

test('public navigation has exactly Home, Activity, Store, Chat and Contact in order', () => {
  const PortfolioSite = require('../src/components/portfolio/PortfolioSite.jsx').default;
  const html = render(PortfolioSite, { data: { name: 'Owner' }, slug: 'owner', preview: true });
  const nav = html.match(/<nav class="pf-nav"[^>]*>([\s\S]*?)<\/nav>/)[1];
  assert.deepEqual([...nav.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map(match => match[1]), ['Home', 'Activity', 'Store', 'Chat', 'Contact']);
});

test('each Activity section renders its published records without extra primary menu entries', () => {
  const PortfolioSite = require('../src/components/portfolio/PortfolioSite.jsx').default;
  const data = { name: 'Owner', portfolio: {
    projects: [{ title: 'Published project' }], talks: [{ title: 'Published talk' }],
    awards: [{ title: 'Home award' }], recognition: [{ kind: 'recognition', title: 'Published recognition' }, { kind: 'award', title: 'Published award' }],
    certificates: [{ title: 'Published certificate', issuer: 'Institute', url: 'https://example.test/certificate' }],
    testimonials: [{ author: 'Client', quote: 'Published testimonial' }], experience: [{ company: 'Published employer' }],
  }, updates: [{ id: 1, title: 'Published update', body: 'News', kind: 'update' }] };
  for (const [section, text] of Object.entries({ projects: 'Published project', events: 'Published update', talks: 'Published talk', recognition: 'Published recognition', awards: 'Published award', certificates: 'Published certificate', testimonials: 'Published testimonial', experience: 'Published employer' })) {
    const html = render(PortfolioSite, { data, slug: 'owner', sub: 'activity', activitySection: section, preview: true });
    assert.ok(html.includes(text), section);
    assert.match(html, /aria-label="Activity sections"/);
    if (section === 'awards') assert.ok(html.includes('Home award'));
  }
});

test('old public links reach their corresponding content in the new page structure', () => {
  const PortfolioSite = require('../src/components/portfolio/PortfolioSite.jsx').default;
  const props = { data: { name: 'Owner', portfolio: { projects: [{ title: 'Old project' }], products: [{ title: 'Old product' }], about: { body: 'Old biography' } } }, slug: 'owner', preview: true };
  assert.match(render(PortfolioSite, { ...props, sub: 'work' }), /Old project/);
  assert.match(render(PortfolioSite, { ...props, sub: 'products' }), /Old product/);
  assert.match(render(PortfolioSite, { ...props, sub: 'about' }), /Old biography/);
});

test('empty sections explain their state and closed enquiries never expose a submission form', () => {
  const PortfolioSite = require('../src/components/portfolio/PortfolioSite.jsx').default;
  const props = { data: { name: 'Owner', portfolio: { enquiry: { enabled: false } } }, slug: 'owner', preview: true };
  assert.match(render(PortfolioSite, { ...props, sub: 'activity', activitySection: 'certificates' }), /No certificates have been published yet/);
  assert.match(render(PortfolioSite, { ...props, sub: 'store' }), /No offerings are available/);
  const contact = render(PortfolioSite, { ...props, sub: 'contact' });
  assert.match(contact, /Enquiries are currently closed/);
  assert.doesNotMatch(contact, /<form/);
});

test('admin has clear primary groups including Community and a separate Logout action', () => {
  const { StudioSidebar } = require('../src/components/Layout.jsx');
  const html = render(StudioSidebar, { user: { name: 'Owner', isAdmin: false }, onLogout() {}, logoutError: 'Please retry logout' }, '/admin');
  const nav = html.match(/<div class="studio-primary-nav">([\s\S]*?)<\/div>/)[1];
  assert.equal([...nav.matchAll(/<a\b/g)].length, 6);
  for (const label of ['Overview', 'Activity &amp; Orders', 'Offerings', 'Content &amp; knowledge', 'Community', 'Settings']) assert.ok(nav.includes(label), label);
  assert.doesNotMatch(nav, /Logout/);
  assert.match(html, /studio-logout[\s\S]*Logout[\s\S]*role="alert"[\s\S]*Please retry logout/);
});

test('every secondary admin link selects its own group and privileged tabs stay hidden', async () => {
  const { ADMIN_SECTIONS, adminLocation } = await import('../src/lib/adminNavigation.js');
  for (const section of ADMIN_SECTIONS) for (const page of section.pages) {
    const url = new URL(page.to, 'https://example.test');
    assert.deepEqual(adminLocation(url.pathname, url.search), { group: section.id, page: page.id }, page.to);
  }
  assert.equal(adminLocation('/admin/__proto__'), null);
  assert.deepEqual(adminLocation('/admin/purchases', '?tab=settings'), { group: 'settings', page: 'payments' });
  const { AdminSectionTabs } = require('../src/components/AdminNavigation.jsx');
  const regular = render(AdminSectionTabs, { user: { isAdmin: false } }, '/admin/profile?tab=visibility');
  assert.doesNotMatch(regular, /superadmin/);
  const admin = render(AdminSectionTabs, { user: { isAdmin: true, isSuperAdmin: true } }, '/superadmin/invites');
  assert.match(admin, /Invite links/);
});

test('legacy dashboard links show Overview with workspace counts and activity destinations', () => {
  const { OverviewContent } = require('../src/pages/Overview.jsx');
  const html = render(OverviewContent, { user: { name: 'Owner' }, data: { counts: { files: 12, posts: 3, topics: 2, embedded: 9, chunks: 10 }, recent: [] } }, '/admin?tab=dashboard');
  assert.match(html, /What would you like to do/);
  assert.match(html, /<strong>12<\/strong>/);
  assert.match(html, /1 knowledge chunks are waiting to sync/);
  assert.match(html, /href="\/admin\/purchases"/);
  assert.match(html, /href="\/admin\/questions"/);
  assert.doesNotMatch(html, /<h1>Dashboard<\/h1>/);
});

test('activity records survive normalization and discard unsafe links and incomplete testimonials', async () => {
  const { normalizePortfolio } = await import('../shared/portfolio.js');
  const normalized = normalizePortfolio({ recognition: [{ kind: 'award', title: 'Award', url: 'javascript:alert(1)' }], certificates: [{ title: 'Certificate', url: 'https://example.test/certificate' }], testimonials: [{ author: 'Client', quote: 'A helpful collaboration' }, { author: '', quote: 'Incomplete' }] });
  assert.equal(normalized.recognition[0].url, '');
  assert.equal(normalized.certificates[0].url, 'https://example.test/certificate');
  assert.equal(normalized.testimonials.length, 1);
  assert.deepEqual(normalizePortfolio(normalized), normalized);
});

test('saving the page persists new Activity records in the existing owner settings', async () => {
  const { savePage } = await import('../server/site.js');
  const { scriptedDatabase, step } = await import('./support/database.js');
  const saved = { id: 4, portfolio: {} };
  const db = scriptedDatabase({ table: 'site_settings', data: [saved] }, { table: 'site_settings' }, { table: 'site_settings', data: [saved] });
  db.uid = 'owner';
  await savePage(db, { portfolio: { recognition: [{ title: 'Recognition' }], certificates: [{ title: 'Certificate' }], testimonials: [{ author: 'Client', quote: 'Helpful work' }] } });
  const [patch] = step(db.calls.find(call => step(call, 'update')), 'update');
  assert.equal(patch.portfolio.recognition[0].title, 'Recognition');
  assert.equal(patch.portfolio.certificates[0].title, 'Certificate');
  assert.equal(patch.portfolio.testimonials[0].quote, 'Helpful work');
});
