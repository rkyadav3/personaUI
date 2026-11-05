const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const { transformSync } = require('esbuild');
Module._extensions['.jsx'] = (module, file) => module._compile(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'jsx', format: 'cjs', jsx: 'automatic' }).code, file);
Module._extensions['.css'] = () => {};
const React = require('react');
const { renderToStaticMarkup: render } = require('react-dom/server');
const { MemoryRouter } = require('react-router-dom');
const { OfferingForm } = require('../src/components/profile/Contributions.jsx');
const categories = [{ id: 1, category: 'Books' }, { id: 2, category: 'Other Contributions', subtype: 'Workshops' }];

test('offering creation exposes the owner categories and preselects its starting category', () => {
  const html = render(React.createElement(OfferingForm, { contribution: categories[0], contributions: categories, onDone() {} }));
  assert.match(html, /aria-label="Offering category"/);
  assert.match(html, /value="1" selected="">Books/);
  assert.match(html, /value="2">Other Contributions: Workshops/);
});

test('editing an offering preselects its saved category', () => {
  const html = render(React.createElement(OfferingForm, { contribution: categories[0], contributions: categories, offering: { id: 8, contribution_id: 2, title: 'Workshop', details: {} }, onDone() {} }));
  assert.match(html, /value="2" selected="">Other Contributions: Workshops/);
});

test('the admin navigation exposes Profile Q&A to ordinary profile owners', () => {
  const { StudioSidebar } = require('../src/components/Layout.jsx');
  const html = render(React.createElement(MemoryRouter, null, React.createElement(StudioSidebar, { user: { name: 'Owner', isAdmin: false } })));
  assert.match(html, /href="\/admin\/questions"/);
  assert.match(html, /Profile Q&amp;A/);
});

test('Profile Q&A renders answers as text, sources, legacy records and pagination', () => {
  const { QuestionHistory } = require('../src/pages/Questions.jsx');
  const html = render(React.createElement(QuestionHistory, { data: { rows: [
    { id: 1, question: 'What do you teach?', answer: '<script>bad()</script>', sources: ['Teaching notes'], answered: true },
    { id: 2, question: 'Old question', answer: null, answered: false },
  ], total: 75, page: 1, pageSize: 50 }, onPage() {}, onRefresh() {} }));
  for (const text of ['What do you teach?', 'Teaching notes', 'Old question', 'Answer was not recorded', 'Next', 'Page 1 of 2']) assert.ok(html.includes(text), text);
  assert.match(html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('history distinguishes loading and load errors from an empty history', () => {
  const { QuestionHistory } = require('../src/pages/Questions.jsx');
  assert.match(render(React.createElement(QuestionHistory, { loading: true })), /Loading/);
  const failed = render(React.createElement(QuestionHistory, { error: 'History unavailable', onRefresh() {} }));
  assert.match(failed, /History unavailable/);
  assert.match(failed, /Retry/);
  assert.doesNotMatch(failed, /No visitor questions yet/);
  assert.match(render(React.createElement(QuestionHistory, { data: { rows: [], total: 0, page: 1, pageSize: 50 } })), /No visitor questions yet/);
});
