const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const { transformSync } = require('esbuild');
Module._extensions['.jsx'] = (module, file) => module._compile(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'jsx', format: 'cjs', jsx: 'automatic' }).code, file);
Module._extensions['.css'] = () => {};
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const Audience = require('../src/components/JobsProfileAudience.jsx').default;
const render = props => renderToStaticMarkup(React.createElement(Audience, { section: 'basics', onChange() {}, ...props }));
test('one selected visibility checkbox disables the two conflicting choices', () => {
  for (const value of ['private', 'public', 'applied_jobs']) {
    const html = render({ value });
    assert.equal((html.match(/type="checkbox"/g) || []).length, 3);
    assert.equal((html.match(/checked=""/g) || []).length, 1);
    assert.equal((html.match(/disabled=""/g) || []).length, 2);
    assert.doesNotMatch(html, /<select/);
  }
});
test('clearing a visibility choice enables all choices, while nation ideas still prohibit Public', () => {
  assert.doesNotMatch(render({ value: '' }), /disabled=""|checked=""/);
  const nation = render({ value: '', section: 'nation' });
  assert.equal((nation.match(/disabled=""/g) || []).length, 1);
  assert.match(nation, /Nation-growth ideas cannot be Public/);
});
