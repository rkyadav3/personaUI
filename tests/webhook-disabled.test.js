import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminHandler } from '../api/admin.js';
import { createWebhookService } from '../server/webhooks.js';
import { adminSectionsFor, canOpenAdminPage } from '../src/lib/adminNavigation.js';

test('disabled webhooks stay hidden for owners while website and team tools remain available', () => {
  const user = { workspaceEnabled: true, workspaceRole: 'owner', webhooksEnabled: false };
  const pages = adminSectionsFor(user).find(section => section.id === 'settings').pages;
  assert.ok(!pages.some(page => page.id === 'webhooks'));
  assert.equal(canOpenAdminPage(user, '/admin/webhooks'), false);
  for (const path of ['/admin/Webhooks', '/Admin/webhooks', '/admin/%77ebhooks', '/admin/webhooks/']) assert.equal(canOpenAdminPage(user, path), false, path);
  for (const page of ['integrations', 'team', 'export']) assert.equal(canOpenAdminPage(user, '/admin/' + page), true);
});

test('disabled webhook endpoints reject before reading workspace data or dispatching services', async () => {
  let calls = 0;
  const handler = createAdminHandler({
    sessionUser: async () => ({ id: 'owner', workspaceEnabled: true, webhooksEnabled: false }),
    workspaceService: { current: async () => { calls++; throw new Error('Unexpected workspace read'); } },
    operations: Object.fromEntries(['webhooks.list', 'webhooks.change', 'webhooks.run'].map(op => [op, () => { calls++; }])),
  });
  for (const op of ['webhooks.list', 'webhooks.change', 'webhooks.run']) {
    const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.value = value; } };
    await handler({ method: 'POST', body: { op } }, res);
    assert.equal(res.code, 503);
    assert.match(res.value.error, /webhooks.*disabled/i);
  }
  assert.equal(calls, 0);
});

test('disabled background delivery never claims jobs or contacts receivers', async () => {
  let calls = 0;
  const service = createWebhookService({ enabled: () => false, database: () => { calls++; throw new Error('Unexpected database use'); }, deliver: () => { calls++; } });
  assert.deepEqual(await service.drain(), { disabled: true, processed: 0, results: [] });
  assert.equal(calls, 0);
});
