const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), Module = require('node:module');
const { transformSync } = require('esbuild');
Module._extensions['.jsx'] = (module, file) => module._compile(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'jsx', format: 'cjs', jsx: 'automatic' }).code, file);
Module._extensions['.css'] = () => {};
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server'), { MemoryRouter } = require('react-router-dom');
const render = (Component, props, path = '/admin/support') => renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Component, props)));

test('Invite replaces Community and Support is a Settings destination with an owner inbox', async () => {
  const { ADMIN_SECTIONS, SUPERADMIN_SECTION, adminLocation } = await import('../src/lib/adminNavigation.js');
  assert.equal(ADMIN_SECTIONS.find(section => section.id === 'community').label, 'Invite');
  assert.ok(ADMIN_SECTIONS.find(section => section.id === 'settings').pages.some(page => page.id === 'support' && page.to === '/admin/support'));
  assert.ok(SUPERADMIN_SECTION.pages.some(page => page.id === 'support' && page.to === '/superadmin/support'));
  assert.deepEqual(adminLocation('/admin/support/8'), { group: 'settings', page: 'support' });
  assert.deepEqual(adminLocation('/superadmin/support/8'), { group: 'platform', page: 'support' });
});

test('admins can open requests while the SuperAdmin sees an inbox without a request form', () => {
  const { SupportList } = require('../src/pages/Support.jsx');
  const props = { rows: [{ id: 8, title: 'Payment help', category: 'payments', status: 'open', author_name: 'Maya' }], reload() {} };
  const member = render(SupportList, { ...props, user: { isAdmin: true } });
  assert.match(member, /New support request/); assert.match(member, /href="\/admin\/support\/8"/);
  const owner = render(SupportList, { ...props, user: { isSuperAdmin: true } }, '/superadmin/support');
  assert.match(owner, /Support inbox/); assert.match(owner, /Maya/); assert.doesNotMatch(owner, /New support request/);
});

test('conversation shows reply history, escaped text and owner-only status controls', () => {
  const { SupportConversation } = require('../src/pages/Support.jsx');
  const props = { ticket: { id: 8, title: 'Payment help', body: '<script>private</script>', category: 'payments', status: 'open', author_name: 'Maya' }, messages: [{ id: 1, body: 'We will investigate.', is_superadmin: true, status: 'in_progress' }], reload() {} };
  const member = render(SupportConversation, { ...props, user: { isAdmin: true } });
  assert.match(member, /We will investigate/); assert.match(member, /&lt;script&gt;/); assert.doesNotMatch(member, /<script>|Request status|Save response/);
  assert.match(member, /Send reply/);
  const owner = render(SupportConversation, { ...props, user: { isSuperAdmin: true } }, '/superadmin/support/8');
  assert.match(owner, /Request status/); assert.match(owner, /Resolved/); assert.match(owner, /Save response/);
});
