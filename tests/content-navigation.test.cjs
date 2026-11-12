const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), Module = require('node:module');
const { transformSync } = require('esbuild');
Module._extensions['.jsx'] = (module, file) => module._compile(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'jsx', format: 'cjs', jsx: 'automatic' }).code, file);
Module._extensions['.css'] = () => {};
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server'), { MemoryRouter } = require('react-router-dom');

test('Settings has no invitations or suggestions and Community retains both destinations', async () => {
  const { ADMIN_SECTIONS, adminLocation } = await import('../src/lib/adminNavigation.js');
  const settings = ADMIN_SECTIONS.find(section => section.id === 'settings');
  assert.ok(settings.pages.every(page => !['invites', 'suggestions'].includes(page.id)));
  assert.deepEqual(ADMIN_SECTIONS.find(section => section.id === 'community').pages.map(page => page.id), ['invites', 'suggestions']);
  assert.deepEqual(adminLocation('/admin/invites'), { group: 'community', page: 'invites' });
  assert.deepEqual(adminLocation('/admin/suggestions'), { group: 'community', page: 'suggestions' });
});

test('articles, templates and topics share one Content navigation destination', async () => {
  const { ADMIN_SECTIONS, adminLocation } = await import('../src/lib/adminNavigation.js');
  const pages = ADMIN_SECTIONS.find(section => section.id === 'pipelines').pages;
  assert.deepEqual(pages.map(page => page.id), ['content', 'files', 'knowledge']);
  for (const path of ['/admin/writing', '/admin/writing/18', '/admin/templates', '/admin/topics', '/admin/topics/7']) {
    assert.deepEqual(adminLocation(path), { group: 'pipelines', page: 'content' });
  }
});

test('Content tabs clearly identify articles, templates and topics including detail and legacy routes', async () => {
  const { contentTab, contentHref } = await import('../src/lib/contentNavigation.js');
  const Navigation = require('../src/components/ContentNavigation.jsx').default;
  for (const [path, selected] of [['/admin/writing?tab=posts', 'posts'], ['/admin/templates', 'templates'], ['/admin/writing/18', 'posts'], ['/admin/topics/7', 'topics']]) {
    const url = new URL(path, 'https://test.example');
    assert.equal(contentTab(url.pathname, url.search), selected);
    const html = renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Navigation)));
    for (const label of ['Articles', 'Templates', 'Research topics']) assert.ok(html.includes(label));
    assert.match(html, /aria-label="Content sections"/);
    const activeLink = html.match(/<a[^>]*aria-current="page"[^>]*>/)[0];
    assert.ok(activeLink.includes(`href="${contentHref(selected)}"`));
    assert.ok(activeLink.includes('class="active"'));
  }
  assert.equal(contentTab('/admin/writing', '?tab=unknown'), 'posts');
});
