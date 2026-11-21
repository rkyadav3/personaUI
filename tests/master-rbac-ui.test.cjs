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
const { PROFILE_TAGS } = require('../shared/governance.js');
const { ALL_PERMISSIONS } = require('../shared/rbac.js');
const definitions = Object.entries(PROFILE_TAGS).map(([key,label]) => ({ key,label,visibility: key === 'private' ? 'private' : 'public',category:'profile',permissions:ALL_PERMISSIONS }));
const render = (component, props, route) => renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries:[route] }, React.createElement(component, props)));

test('Master lists the requested types and permissions while Customers keeps assignment only', () => {
  const { MasterManager } = require('../src/pages/Master.jsx');
  const { CustomerManager } = require('../src/pages/SuperAdmin.jsx');
  const html = render(MasterManager, { definitions, reload() {} }, '/superadmin/master');
  for (const label of Object.values(PROFILE_TAGS)) assert.ok(html.includes(label), label);
  assert.match(html, /Add new tag/); assert.match(html, /Edit permissions/); assert.match(html, /Accounts without tags follow Standard/);
  assert.doesNotMatch(html, /Parent tag|Built-in|sub-tag|Individual Profile/);
  assert.equal(PROFILE_TAGS.organisation, undefined);
  const customers = render(CustomerManager, { user:{id:'owner'}, users:[{id:'member',name:'Member',email:'member@example.test',tags:['hero']}], definitions, reload() {} }, '/superadmin/customers');
  assert.match(customers, /Edit &amp; tags/); assert.doesNotMatch(customers, /Add new tag|Create tag|Edit permissions/);
});

test('first-time profile setup offers only Individual and Organisation', () => {
  const { ProfileTypeChoice } = require('../src/pages/Profile.jsx');
  const html = render(ProfileTypeChoice, {onChoose(){}}, '/admin/profile');
  assert.match(html, />Individual</); assert.match(html, />Organisation</);
  assert.equal((html.match(/<button/g) || []).length, 2);
});

test('restricted Studio navigation hides unavailable features and retains account and support recovery', () => {
  const { StudioSidebar } = require('../src/components/Layout.jsx');
  const html = render(StudioSidebar, {user:{id:'a',name:'Member',tags:['hero'],permissions:['profile']},onLogout(){}}, '/admin');
  assert.doesNotMatch(html, /href="\/admin\/(store|files|enquiries|invites|knowledge)"/);
  assert.match(html, /Settings/);
  const owner = render(StudioSidebar, {user:{name:'Owner',isSuperAdmin:true},onLogout(){}}, '/superadmin/master');
  assert.match(owner, /href="\/superadmin\/master"/);
});
