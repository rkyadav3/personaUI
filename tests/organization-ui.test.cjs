const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const { transformSync } = require('esbuild');
Module._extensions['.jsx'] = (module, file) => module._compile(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'jsx', format: 'cjs', jsx: 'automatic' }).code, file);
Module._extensions['.css'] = () => {};
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const render = Component => renderToStaticMarkup(Component);

test('workspace choice describes both modes and exposes an accessible busy state', () => {
  const { WorkspaceChoice } = require('../src/components/WorkspaceSetup.jsx');
  const html = render(React.createElement(WorkspaceChoice, { onChoose() {}, busy: 'organization' }));
  assert.match(html, /Individual/);
  assert.match(html, /Organization/);
  assert.match(html, /Setting up your organization/);
  assert.match(html, /disabled/);
});

test('organization fields show relevant school questions without individual education forms', () => {
  const OrganizationFields = require('../src/components/profile/OrganizationFields.jsx').default;
  const html = render(React.createElement(OrganizationFields, { draft: { profile: { name: 'Acme School', contact: {}, organization: { type: 'school', details: {} } }, purpose: { description: '' } }, onChange() {} }));
  assert.match(html, /Organization name/);
  assert.match(html, /Education board/);
  assert.match(html, /Who should your persona help/);
  assert.doesNotMatch(html, /Full name|Working experience|Add education/);
});

test('page skeletons announce loading and indeterminate progress does not invent a percentage', () => {
  const { Skeleton, Busy } = require('../src/components/Ui.jsx');
  assert.match(render(React.createElement(Skeleton, { label: 'Opening your organization' })), /role="status"/);
  const html = render(React.createElement(Busy, { label: 'Preparing your profile' }));
  assert.match(html, /<progress/);
  assert.doesNotMatch(html, /value="/);
});
