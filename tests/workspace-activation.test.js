import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminHandler } from '../api/admin.js';
import { createIntegrationService } from '../server/integrations.js';
import { scriptedDatabase } from './support/database.js';
import { adminSectionsFor, canOpenAdminPage } from '../src/lib/adminNavigation.js';

const response = () => ({
  setHeader() {},
  status(code) { this.code = code; return this; },
  json(value) { this.value = value; },
});

test('disabled add-on tools report deployment availability before touching account data', async () => {
  let queries = 0;
  const handler = createAdminHandler({
    sessionUser: async () => ({ id: 'individual-owner', workspaceEnabled: false }),
    scoped: () => { queries++; return { uid: 'individual-owner' }; },
  });
  for (const op of ['integrations.list', 'integrations.change', 'team.list', 'team.change', 'team.accept', 'webhooks.list', 'webhooks.change', 'webhooks.run', 'data.export', 'knowledge.policy', 'workspace.switch']) {
    const res = response();
    await handler({ method: 'POST', body: { op, args: {} } }, res);
    assert.equal(res.code, 503, `${op}: ${JSON.stringify(res.value)}`);
    assert.match(res.value.error, /not enabled/i);
    assert.doesNotMatch(res.value.error, /administrator.*required/i);
  }
  assert.equal(queries, 0);
});

test('individual Settings hide disabled add-on links and direct links are unavailable', () => {
  const user = { workspaceEnabled: false };
  const pages = adminSectionsFor(user).find(section => section.id === 'settings').pages;
  assert.ok(pages.some(page => page.id === 'account'));
  assert.ok(pages.some(page => page.id === 'details'));
  for (const id of ['integrations', 'team', 'webhooks', 'export']) {
    assert.ok(!pages.some(page => page.id === id), id);
    assert.equal(canOpenAdminPage(user, `/admin/${id}`), false, id);
  }
  assert.equal(canOpenAdminPage(user, '/admin/settings', '?tab=privacy'), true);
});

test('an enabled individual owner can open website settings while a viewer remains denied', async () => {
  const database = scriptedDatabase(
    { table: 'website_integrations', data: [] },
    { table: 'workspace_api_settings', data: [] },
    { table: 'rpc:persona_usage', data: { requests: 0 } },
  );
  const service = createIntegrationService({ database: () => database });
  let role = 'owner';
  const user = { id: 'individual-owner', workspaceEnabled: true, workspaceRole: role, webhooksEnabled: true };
  const handler = createAdminHandler({
    sessionUser: async () => user,
    workspaceService: { current: async () => ({ role, actorId: user.id, ownerId: user.id, workspace: { id: user.id, type: 'individual' } }) },
    workspaceScope: () => ({ uid: user.id, workspaceId: user.id }),
    operations: { 'integrations.list': ({ workspace }) => service.list(workspace) },
  });
  const res = response();
  await handler({ method: 'POST', body: { op: 'integrations.list' } }, res);
  assert.equal(res.code, 200, JSON.stringify(res.value));
  assert.deepEqual(res.value.integrations, []);
  for (const path of ['integrations', 'team', 'webhooks', 'export']) assert.equal(canOpenAdminPage(user, `/admin/${path}`), true);
  const calls = database.calls.length;
  role = 'viewer';
  await handler({ method: 'POST', body: { op: 'integrations.list' } }, res);
  assert.equal(res.code, 403);
  assert.equal(database.calls.length, calls);
});
