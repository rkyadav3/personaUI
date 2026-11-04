import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scriptedDatabase, step, hasEq } from './support/database.js';
import { TENANT_TABLES } from '../server/tenant.js';

const repository = () => import('../server/studioReviews.js');
const id = '11111111-1111-4111-8111-111111111111';
const plan = { changes: [{ title: 'Rename' }], steps: [{ op: 'topics.update', args: {} }], expected: [], entities: ['topics'] };
const rawRow = { id, owner_id: 'owner', command: 'Rename topic', plan, status: 'pending', results: [], expires_at: '2026-12-01T12:00:00Z' };
const context = db => ({ db, user: { id: 'owner' } });

test('review storage is explicitly included in tenant isolation', () => {
  assert.ok(TENANT_TABLES.has('studio_reviews'));
});

test('the migration keeps review rows private and restricts statuses', () => {
  const sql = fs.readFileSync(new URL('../supabase/studio-assistant.sql', import.meta.url), 'utf8');
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /owner_id uuid.*references.*users/i);
  assert.match(sql, /pending.*running.*applied/i);
  assert.match(sql, /expires_at/i);
});

test('a created review is stamped with its owner and returned as a pending draft', async () => {
  const { createStudioReviewRepository } = await repository();
  const db = scriptedDatabase({ table: 'studio_reviews', data: [rawRow] }); db.uid = 'owner';
  const result = await createStudioReviewRepository().create(context(db), { id, command: 'Rename topic', plan, expiresAt: rawRow.expires_at });
  assert.equal(step(db.calls[0], 'insert')[0].owner_id, 'owner');
  assert.equal(result.ownerId, 'owner');
  assert.equal(result.status, 'pending');
});

test('claim is one conditional owner-bound update of a pending, unexpired review', async () => {
  const { createStudioReviewRepository } = await repository();
  const db = scriptedDatabase({ table: 'studio_reviews', data: [{ ...rawRow, status: 'running' }] }); db.uid = 'owner';
  const now = '2026-11-04T12:00:00Z';
  const row = await createStudioReviewRepository().claim(context(db), id, now);
  const call = db.calls[0];
  assert.ok(hasEq(call, 'owner_id', 'owner'));
  assert.ok(hasEq(call, 'status', 'pending'));
  assert.ok(hasEq(call, 'id', id));
  assert.deepEqual(step(call, 'gt'), ['expires_at', now]);
  assert.equal(row.status, 'running');
});

test('another claim receives no record when the conditional update did not match', async () => {
  const { createStudioReviewRepository } = await repository();
  const db = scriptedDatabase({ table: 'studio_reviews', data: [] }); db.uid = 'owner';
  assert.equal(await createStudioReviewRepository().claim(context(db), id, '2026-11-04T12:00:00Z'), null);
});

test('review reads and cancellation include owner and status filters', async () => {
  const { createStudioReviewRepository } = await repository();
  const db = scriptedDatabase({ table: 'studio_reviews', data: [rawRow] }, { table: 'studio_reviews', data: [] }); db.uid = 'owner';
  const repo = createStudioReviewRepository();
  await repo.get(context(db), id);
  assert.ok(hasEq(db.calls[0], 'owner_id', 'owner'));
  assert.equal(await repo.cancel(context(db), id), false);
  assert.ok(hasEq(db.calls[1], 'status', 'pending'));
});

test('missing review setup returns a migration instruction without database details', async () => {
  const { createStudioReviewRepository } = await repository();
  const db = scriptedDatabase({ table: 'studio_reviews', error: { message: 'relation studio_reviews does not exist; private connection details' } }); db.uid = 'owner';
  await assert.rejects(createStudioReviewRepository().get(context(db), id), error => error.message.includes('supabase/studio-assistant.sql') && !error.message.includes('private'));
});

test('admin API knows all assistant endpoints but denies unsigned requests', async () => {
  const { createAdminHandler } = await import('../api/admin.js');
  const handler = createAdminHandler({ sessionUser: async () => null, scoped: () => { throw new Error('Scope must not be opened'); } });
  for (const op of ['studio.prepare', 'studio.apply', 'studio.discard', 'studio.review']) {
    const response = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ method: 'POST', body: { op, args: {} } }, response);
    assert.equal(response.code, 401, op);
  }
});

test('recent review counts use the actor and the requested time window', async () => {
  const { createStudioReviewRepository } = await repository();
  const db = scriptedDatabase({ table: 'studio_reviews', count: 3 }); db.uid = 'owner';
  assert.equal(await createStudioReviewRepository().recent(context(db), '2026-11-04T12:00:00Z'), 3);
  assert.ok(hasEq(db.calls[0], 'owner_id', 'owner')); assert.deepEqual(step(db.calls[0], 'gte'), ['created_at', '2026-11-04T12:00:00Z']);
});

test('progress and results only update an owner-bound running review', async () => {
  const { createStudioReviewRepository } = await repository();
  const db = scriptedDatabase({ table: 'studio_reviews', data: [{ id }] }, { table: 'studio_reviews', data: [{ id }] }, { table: 'studio_reviews', data: [] }, { table: 'studio_reviews', data: [] }); db.uid = 'owner';
  const repo = createStudioReviewRepository(); await repo.progress(context(db), id, [{ status: 'applied' }]); await repo.finish(context(db), id, 'partial', [{ status: 'applied' }], 'Check the editor');
  assert.ok(db.calls.slice(0, 2).every(call => hasEq(call, 'owner_id', 'owner') && hasEq(call, 'status', 'running'))); assert.equal(step(db.calls[1], 'update')[0].status, 'partial');
  await assert.rejects(repo.progress(context(db), id, []), /running/i); await assert.rejects(repo.finish(context(db), id, 'applied', []), /running/i); await assert.rejects(repo.finish(context(db), id, 'pending', []), /invalid/i);
});

test('storage failures do not reveal server details and mismatched identities make no query', async () => {
  const { createStudioReviewRepository } = await repository(), repo = createStudioReviewRepository();
  const db = scriptedDatabase({ table: 'studio_reviews', error: { message: 'private server details' } }); db.uid = 'owner';
  await assert.rejects(repo.get(context(db), id), error => !error.message.includes('private'));
  const other = scriptedDatabase(); other.uid = 'other'; await assert.rejects(repo.create(context(other), { id, plan }), /signed/i); assert.equal(other.calls.length, 0);
});

test('assistant API responses hide unexpected database and model details', async () => {
  const { createAdminHandler } = await import('../api/admin.js'), original = console.error; console.error = () => {};
  try {
    const handler = createAdminHandler({ sessionUser: async () => ({ id: 'owner' }), scoped: () => ({ uid: 'owner' }), operations: { 'studio.prepare': async () => { throw new Error('private database details'); } } });
    const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ method: 'POST', body: { op: 'studio.prepare', args: {} } }, res); assert.equal(res.code, 500); assert.doesNotMatch(JSON.stringify(res.body), /private database/);
  } finally { console.error = original; }
});
