import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptedDatabase } from './support/database.js';

test('scope metadata is consumed before production assistant validators and retained for workspace switching', async () => {
  const { createAdminHandler } = await import('../api/admin.js');
  const { listStudioHistory } = await import('../server/studioChatHistory.js');
  const { createStudioAssistant } = await import('../server/studioAssistant.js');
  const reviewId = '11111111-1111-4111-8111-111111111111';
  const db = Object.assign(scriptedDatabase({ table: 'studio_chat', data: [] }), { uid: 'owner-b', workspaceId: 'workspace-b' });
  const assistant = createStudioAssistant({ reviews: { recent: async () => 0, get: async () => ({ id: reviewId, ownerId: 'owner-b', status: 'applied', results: [], plan: { changes: [] } }) }, generate: async () => ({ entities: [], message: 'What should I update?' }) });
  const handler = createAdminHandler({
    sessionUser: async () => ({ id: 'admin', workspaceEnabled: true }),
    workspaceService: { current: async () => ({ role: 'admin', workspace: { id: 'workspace-b' }, actorId: 'admin', ownerId: 'owner-b' }) }, workspaceScope: () => db,
    operations: { 'studio.history': listStudioHistory, 'studio.prepare': assistant.prepare, 'studio.apply': assistant.apply, 'workspace.switch': (_ctx, args) => ({ target: args.workspaceId }) },
  });
  for (const [op, args] of [['studio.history', {}], ['studio.prepare', { message: 'Update my profile' }], ['studio.apply', { reviewId, approved: true }], ['workspace.switch', {}]]) {
    const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.value = value; } };
    await handler({ method: 'POST', body: { op, args: { ...args, workspaceId: 'workspace-b' } } }, res);
    assert.equal(res.code, 200, `${op}: ${JSON.stringify(res.value)}`);
    if (op === 'workspace.switch') assert.equal(res.value.target, 'workspace-b');
  }
});

test('admin requests reject another tab changing the selected workspace before reading or writing', async () => {
  const { createAdminHandler } = await import('../api/admin.js');
  let invoked = 0, scoped = 0;
  const handler = createAdminHandler({
    sessionUser: async () => ({ id: 'admin', workspaceEnabled: true }),
    workspaceService: { current: async () => ({ role: 'admin', workspace: { id: 'workspace-b' }, actorId: 'admin', ownerId: 'owner-b' }) },
    workspaceScope: () => { scoped++; return {}; },
    operations: Object.fromEntries(['studio.history', 'studio.prepare', 'posts.create'].map(op => [op, () => { invoked++; return { ok: true }; }])),
  });
  for (const op of ['studio.history', 'studio.prepare', 'posts.create']) {
    const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.value = value; } };
    await handler({ method: 'POST', body: { op, args: { workspaceId: 'workspace-a', history: [{ text: 'Private workspace A information' }] } } }, res);
    assert.equal(res.code, 409);
    assert.equal(invoked, 0);
    assert.equal(scoped, 0);
    await handler({ method: 'POST', body: { op, args: { workspaceId: 'workspace-b' } } }, res);
    assert.equal(res.code, 200);
    invoked = scoped = 0;
  }
});

test('each browser tab pins admin calls to its loaded workspace and clears scope on logout', async () => {
  const { api } = await import('../src/lib/api.js');
  const savedFetch = globalThis.fetch, calls = [];
  let current = 'workspace-a';
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body); calls.push(body);
    return new Response(JSON.stringify(body.op === 'workspace.current' ? { workspace: { id: current } } : { ok: true }), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    await api('workspace.current');
    current = 'workspace-b';
    await api('posts.create', { title: 'For workspace A' });
    assert.equal(calls.at(-1).args.workspaceId, 'workspace-a');
    await api('workspace.current');
    await api('posts.create', { title: 'For workspace B' });
    assert.equal(calls.at(-1).args.workspaceId, 'workspace-b');
    await api('auth.logout');
    await api('auth.me');
    assert.equal(calls.at(-1).args.workspaceId, undefined);
  } finally { globalThis.fetch = savedFetch; }
});
