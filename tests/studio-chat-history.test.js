import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scriptedDatabase, step, hasEq } from './support/database.js';
import { TENANT_TABLES } from '../server/tenant.js';
import { createStudioSession } from '../src/lib/studioSession.js';

const repository = () => import('../server/studioChatHistory.js');
const ctx = db => ({ db, user: { id: 'owner' } });
const row = (id = '26') => ({ id, question: `Question ${id}`, answer: `Answer ${id}`, created_at: '2026-11-05T10:00:00Z', review_id: null });
const turn = (id = '26') => ({ id, question: `Question ${id}`, answer: `Answer ${id}`, createdAt: '2026-11-05T10:00:00Z', reviewId: null });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function session(call) {
  const calls = [], published = [];
  const value = createStudioSession({ userId: 'owner', storage: null, call: async (op, args) => { calls.push({ op, args }); return call(op, args); }, publish: state => published.push(structuredClone(state)) });
  return { value, calls, published };
}

test('admin history storage belongs to the tenant and denies direct browser access', () => {
  assert.ok(TENANT_TABLES.has('studio_chat'));
  const sql = fs.readFileSync(new URL('../supabase/studio-chat.sql', import.meta.url), 'utf8');
  assert.match(sql, /owner_id uuid.*references users/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on studio_chat from anon, authenticated/i);
  assert.match(sql, /grant all on studio_chat to service_role/i);
});

test('history records exact completed exchanges under the authenticated owner', async () => {
  const { createStudioChatRepository } = await repository(), db = scriptedDatabase({ table: 'studio_chat', data: [row()] }); db.uid = 'owner';
  const saved = await createStudioChatRepository().record(ctx(db), { question: 'Question 26', answer: 'Answer 26', reviewId: null });
  assert.deepEqual(saved, turn());
  assert.deepEqual(step(db.calls[0], 'insert')[0], { owner_id: 'owner', question: 'Question 26', answer: 'Answer 26', review_id: null });
});

test('newest-first keyset pagination is stable when new messages arrive', async () => {
  const { createStudioChatRepository } = await repository(), db = scriptedDatabase({ table: 'studio_chat', data: Array.from({ length: 26 }, (_, i) => row(String(100 - i))) }, { table: 'studio_chat', data: [row('74')] }); db.uid = 'owner';
  const repo = createStudioChatRepository(), first = await repo.list(ctx(db), {});
  assert.equal(first.rows.length, 25); assert.equal(first.nextBefore, '76');
  assert.deepEqual(step(db.calls[0], 'order'), ['id', { ascending: false }]); assert.deepEqual(step(db.calls[0], 'limit'), [26]);
  assert.ok(hasEq(db.calls[0], 'owner_id', 'owner'));
  const older = await repo.list(ctx(db), { before: first.nextBefore });
  assert.deepEqual(step(db.calls[1], 'lt'), ['id', '76']); assert.equal(older.rows[0].id, '74'); assert.equal(older.nextBefore, null);
});

test('invalid history arguments and mismatched actors cannot query another account', async () => {
  const { createStudioChatRepository } = await repository(), repo = createStudioChatRepository(), db = scriptedDatabase(); db.uid = 'owner';
  for (const args of [null, [], { ownerId: 'other' }, { before: 0 }, { before: -1 }, { before: {} }, { before: '0' }, { before: '1 or true' }, { before: '9'.repeat(20) }]) await assert.rejects(repo.list(ctx(db), args), error => error.status === 400);
  await assert.rejects(repo.list({ user: { id: 'other' }, db }, {}), error => error.status === 401);
  assert.equal(db.calls.length, 0);
});

test('history reports missing migrations and sanitizes other database failures', async () => {
  const { createStudioChatRepository } = await repository(), repo = createStudioChatRepository();
  for (const error of [{ code: '42P01', message: 'private connection' }, { message: 'private connection' }]) {
    const db = scriptedDatabase({ table: 'studio_chat', error }); db.uid = 'owner';
    await assert.rejects(repo.list(ctx(db), {}), failure => failure.status === 503 && !failure.message.includes('private') && (!error.code || failure.message.includes('supabase/studio-chat.sql')));
  }
  const empty = scriptedDatabase({ table: 'studio_chat', data: [] }); empty.uid = 'owner';
  await assert.rejects(repo.record(ctx(empty), { question: 'Hello', answer: 'Hello' }), /saved/i);
});

test('the history endpoint requires authentication and scopes ordinary owners', async () => {
  const { createAdminHandler } = await import('../api/admin.js');
  const response = () => ({ setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  const blocked = response();
  await createAdminHandler({ sessionUser: async () => null, scoped() { throw new Error('No scope'); } })({ method: 'POST', body: { op: 'studio.history', args: {} } }, blocked);
  assert.equal(blocked.code, 401);
  const db = scriptedDatabase({ table: 'studio_chat', data: [row()] }); db.uid = 'owner';
  const allowed = response();
  await createAdminHandler({ sessionUser: async () => ({ id: 'owner', isAdmin: false }), scoped: () => db })({ method: 'POST', body: { op: 'studio.history', args: {} } }, allowed);
  assert.equal(allowed.code, 200); assert.deepEqual(allowed.body.rows, [turn()]);
});

test('reload restores messages in chronological context without applying any command', async () => {
  const f = session(async () => ({ rows: [turn('26'), turn('25')], nextBefore: '25' }));
  await f.value.recover();
  assert.deepEqual(f.calls.map(call => call.op), ['studio.history']);
  assert.deepEqual(f.value.snapshot().messages.map(message => message.text), ['Question 25', 'Answer 25', 'Question 26', 'Answer 26']);
  assert.equal(f.value.snapshot().historyBefore, '25');
  f.value.dispose();
});

test('loading older history keeps new replies and deduplicates overlapping records', async () => {
  const waiting = deferred();
  const f = session(async (op, args) => op === 'studio.prepare' ? { answer: 'New answer', review: null, turn: { ...turn('27'), question: 'New question', answer: 'New answer' } } : args.before ? waiting.promise : { rows: [turn('26')], nextBefore: '26' });
  await f.value.recover(); const older = f.value.loadOlder();
  f.value.setInput('New question'); await f.value.submit();
  waiting.resolve({ rows: [turn('26'), turn('25')], nextBefore: null }); await older;
  assert.deepEqual(f.value.snapshot().messages.map(message => message.text), ['Question 25', 'Answer 25', 'Question 26', 'Answer 26', 'New question', 'New answer']);
  assert.equal(f.value.snapshot().historyBefore, null); assert.equal(f.value.snapshot().historyBusy, false);
});

test('history errors remain visible, can be retried, and do not prevent normal planning', async () => {
  let fails = true;
  const f = session(async op => { if (op === 'studio.prepare') return { answer: 'Reply', review: null }; if (fails) throw new Error('History unavailable'); return { rows: [turn()], nextBefore: null }; });
  await f.value.recover(); assert.match(f.value.snapshot().historyError, /history/i); assert.equal(f.value.snapshot().busy, '');
  f.value.setInput('Hello'); await f.value.submit(); assert.equal(f.value.snapshot().messages.length, 2);
  fails = false; await f.value.loadOlder(); assert.equal(f.value.snapshot().historyError, ''); assert.equal(f.value.snapshot().messages.length, 4);
});

test('disposed sessions ignore late history and preserve account separation', async () => {
  const waiting = deferred(), f = session(() => waiting.promise), recovering = f.value.recover(); f.value.dispose(); const count = f.published.length;
  waiting.resolve({ rows: [turn()], nextBefore: null }); await recovering;
  assert.equal(f.published.length, count); assert.equal(f.value.snapshot().messages.length, 0);
});

test('account history restores the latest saved review even without browser storage', async () => {
  const reviewId = '11111111-1111-4111-8111-111111111111';
  const f = session(async op => op === 'studio.history' ? { rows: [{ ...turn(), reviewId }], nextBefore: null } : { status: 'pending', review: { id: reviewId, status: 'pending', changes: [] }, results: [] });
  await f.value.recover();
  assert.deepEqual(f.calls.map(call => call.op), ['studio.history', 'studio.review']);
  assert.equal(f.value.snapshot().review.id, reviewId); assert.equal(f.value.snapshot().result, null);
});

test('history pagination ignores repeated clicks, malformed responses and late disposal', async () => {
  const waiting = deferred();
  const f = session(async (op, args) => args.before ? waiting.promise : { rows: [turn()], nextBefore: '26' });
  await f.value.recover(); const request = f.value.loadOlder(); await f.value.loadOlder();
  assert.equal(f.calls.length, 2);
  f.value.dispose(); const count = f.published.length; waiting.resolve({ rows: [turn('25')], nextBefore: null }); await request;
  assert.equal(f.published.length, count);
  const malformed = session(async () => null); await malformed.value.recover(); assert.match(malformed.value.snapshot().historyError, /history/i);
});

test('failed transcript writes visibly mark the live exchange as unsaved', async () => {
  const f = session(async () => ({ answer: 'Review this', review: null, historyWarning: 'This exchange could not be saved to history.' }));
  f.value.setInput('Hello'); await f.value.submit();
  assert.match(f.value.snapshot().historyError, /saved/); assert.equal(f.value.snapshot().messages[0].unsaved, true);
});

test('message context stays at six recent messages while the visible history keeps all loaded exchanges', async () => {
  const rows = Array.from({ length: 25 }, (_, i) => turn(String(50 - i)));
  const f = session(async op => op === 'studio.history' ? { rows, nextBefore: null } : { answer: 'New reply', review: null });
  await f.value.recover(); f.value.setInput('Next question'); await f.value.submit();
  const planned = f.calls.find(call => call.op === 'studio.prepare');
  assert.equal(planned.args.history.length, 6); assert.equal(planned.args.history.at(-1).text, 'Answer 50');
  assert.equal(f.value.snapshot().messages.length, 52);
});
