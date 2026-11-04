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

test('Overview now offers command planning with an explicit review promise', () => {
  const { OverviewContent } = require('../src/pages/Overview.jsx');
  const html = render(React.createElement(OverviewContent, { user: { name: 'Ravi' }, data: { counts: {} } }));
  assert.match(html, /review/i);
  assert.match(html, /aria-label="Plan changes"/);
  assert.doesNotMatch(html, /Find the right tools to create/);
});

test('review displays before and after values, deletion effects and approval controls', () => {
  const { StudioReview } = require('../src/components/StudioAssistant.jsx');
  const html = render(React.createElement(StudioReview, { review: { id: 'review', status: 'pending', expiresAt: '2026-12-01T12:00:00Z', changes: [{ id: 'change-1', title: 'Rename project', kind: 'update', fields: [{ path: 'title', before: 'Old project', after: 'New project' }] }, { id: 'change-2', title: 'Delete folder', kind: 'delete', warning: 'Its files are removed.', fields: [], affected: [{ label: 'Files', count: 2 }] }] }, onApprove() {}, onDiscard() {} }));
  for (const text of ['Old project', 'New project', 'Before', 'After', 'Approve and apply', 'Discard', 'Its files are removed.']) assert.ok(html.includes(text), text);
  assert.match(html, /2/);
});

test('no pending review means there is no enabled apply button', () => {
  const { StudioReview } = require('../src/components/StudioAssistant.jsx');
  assert.equal(render(React.createElement(StudioReview, { review: null })), '');
  const html = render(React.createElement(StudioReview, { review: { id: 'review', status: 'applied', changes: [] }, onApprove() {} }));
  assert.doesNotMatch(html, /Approve and apply/);
});

test('proposed HTML and model replies render as text', () => {
  const { StudioReview } = require('../src/components/StudioAssistant.jsx');
  const html = render(React.createElement(StudioReview, { review: { id: 'review', status: 'pending', changes: [{ id: 'one', title: 'Edit post', kind: 'update', fields: [{ path: 'body', before: '', after: '<img src=x onerror=alert(1)>' }] }] }, onApprove() {}, onDiscard() {} }));
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img/);
});
