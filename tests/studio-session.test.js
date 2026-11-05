import test from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('../src/lib/studioSession.js');
const id = '11111111-1111-4111-8111-111111111111';
const draft = (status = 'pending') => ({ id, status, expiresAt: '2099-01-01T00:00:00Z', changes: [{ id: 'one', title: 'Rename project', fields: [{ path: 'title', before: 'Old', after: 'New' }] }] });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function fixture(handler, saved = false) {
  const { createStudioSession } = await load(), calls = [], published = [], stored = new Map(saved ? [['studio-review:owner', id]] : []);
  let refreshed = 0;
  const session = createStudioSession({ userId: 'owner', timeZone: 'Asia/Kolkata', call: async (op, args) => { calls.push({ op, args }); if (op === 'studio.history') return { rows: [], nextBefore: null }; return handler ? handler(op, args, calls.length) : op === 'studio.prepare' ? { answer: 'Review this edit.', review: draft() } : op === 'studio.review' ? { status: 'pending', review: draft(), results: [] } : { status: op === 'studio.discard' ? 'cancelled' : 'applied', results: [] }; }, publish: value => published.push(structuredClone(value)), onApplied: () => { refreshed++; }, storage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) } });
  return { session, calls, published, stored, refreshed: () => refreshed };
}

test('sending a command only plans a review and approval sends only the saved ID', async () => {
  const f = await fixture(); f.session.setInput('Rename my project'); await f.session.submit();
  assert.deepEqual(f.calls.map(call => call.op), ['studio.prepare']); assert.equal(f.session.snapshot().review.status, 'pending'); assert.equal(f.stored.get('studio-review:owner'), id);
  assert.equal(f.calls[0].args.timeZone, 'Asia/Kolkata'); assert.equal(f.calls[0].args.message, 'Rename my project');
  await f.session.approve(); assert.deepEqual(f.calls[1], { op: 'studio.apply', args: { reviewId: id, approved: true } }); assert.equal(f.session.snapshot().result.status, 'applied'); assert.equal(f.refreshed(), 1);
  await f.session.approve(); assert.equal(f.calls.length, 2);
});

test('clarification messages become bounded conversation history for the next command', async () => {
  const f = await fixture(async () => ({ answer: 'What name should I use?', review: null }));
  f.session.setInput('Create a project'); await f.session.submit(); f.session.setInput('Call it New'); await f.session.submit();
  assert.deepEqual(f.calls[1].args.history, [{ role: 'user', text: 'Create a project' }, { role: 'assistant', text: 'What name should I use?' }]); assert.equal(f.calls.filter(call => call.op === 'studio.apply').length, 0);
});

test('concurrent submissions cannot produce duplicate planning requests', async () => {
  const waiting = deferred(), f = await fixture(() => waiting.promise); f.session.setInput('Create a project');
  const request = f.session.submit(); await f.session.submit(); assert.equal(f.calls.length, 1); assert.equal(f.session.snapshot().busy, 'planning');
  waiting.resolve({ answer: 'Review', review: draft() }); await request; assert.equal(f.session.snapshot().busy, '');
});

test('revising a pending review discards it before planning the replacement', async () => {
  const f = await fixture(); f.session.setInput('Rename project'); await f.session.submit(); f.session.setInput('Use a different name'); await f.session.submit();
  assert.deepEqual(f.calls.map(call => call.op), ['studio.prepare', 'studio.discard', 'studio.prepare']); assert.equal(f.calls[1].args.reviewId, id);
});

test('failed discard retains the review and prevents replacement planning', async () => {
  const f = await fixture(op => { if (op === 'studio.discard') throw new Error('Could not discard'); return { answer: 'Review', review: draft() }; });
  f.session.setInput('Rename project'); await f.session.submit(); f.session.setInput('Use another name'); await f.session.submit();
  assert.equal(f.calls.filter(call => call.op === 'studio.prepare').length, 1); assert.equal(f.session.snapshot().review.id, id); assert.equal(f.session.snapshot().input, 'Use another name'); assert.match(f.session.snapshot().error, /discard/i);
});

test('discard makes no content mutation and clears only the saved review ID', async () => {
  const f = await fixture(); f.session.setInput('Rename project'); await f.session.submit(); await f.session.discard();
  assert.equal(f.session.snapshot().review, null); assert.equal(f.session.snapshot().result.status, 'cancelled'); assert.equal(f.stored.size, 0); assert.equal(f.calls.filter(call => call.op === 'studio.apply').length, 0);
});

test('reload recovers a saved review without applying it', async () => {
  const f = await fixture(null, true); await f.session.recover();
  assert.deepEqual(f.calls.map(call => call.op), ['studio.history', 'studio.review']); assert.equal(f.session.snapshot().review.status, 'pending'); assert.equal(f.session.snapshot().result, null);
});

test('lost approval response checks saved status and never retries the mutation', async () => {
  const f = await fixture(op => { if (op === 'studio.apply') throw new Error('Connection interrupted'); return op === 'studio.review' ? { status: 'applied', review: draft('applied'), results: [{ status: 'applied' }] } : { answer: 'Review', review: draft() }; });
  f.session.setInput('Rename project'); await f.session.submit(); await f.session.approve();
  assert.equal(f.calls.filter(call => call.op === 'studio.apply').length, 1); assert.equal(f.session.snapshot().result.status, 'applied'); assert.equal(f.refreshed(), 1); assert.equal(f.session.snapshot().busy, '');
});

test('an unknown or running review blocks a new command until its status is resolved', async () => {
  const f = await fixture(() => { throw new Error('Connection interrupted'); }, true); await f.session.recover();
  assert.equal(f.session.snapshot().review.status, 'unknown'); f.session.setInput('Create another project'); await f.session.submit();
  assert.equal(f.calls.filter(call => call.op === 'studio.prepare').length, 0); assert.match(f.session.snapshot().error, /status|check/i);
});

test('disposal during draft replacement stops the next API call and ignores late results', async () => {
  const waiting = deferred(), f = await fixture(op => op === 'studio.discard' ? waiting.promise : { answer: 'Review', review: draft() });
  f.session.setInput('Rename project'); await f.session.submit(); f.session.setInput('Use another name'); const request = f.session.submit();
  f.session.dispose(); const before = f.published.length; waiting.resolve({ status: 'cancelled' }); await request;
  assert.equal(f.published.length, before); assert.equal(f.calls.filter(call => call.op === 'studio.prepare').length, 1); assert.equal(f.stored.get('studio-review:owner'), id);
});

test('disposal during discard, status check or approval suppresses stale UI updates', async () => {
  for (const method of ['discard', 'checkStatus', 'approve']) {
    const waiting = deferred(), f = await fixture(op => op === 'studio.prepare' ? { answer: 'Review', review: draft() } : waiting.promise);
    f.session.setInput('Rename project'); await f.session.submit(); const request = f.session[method](); f.session.dispose(); const count = f.published.length;
    waiting.resolve({ status: 'applied', review: draft('applied'), results: [] }); await request; assert.equal(f.published.length, count, method); assert.equal(f.refreshed(), 0, method);
  }
});

test('expired and empty reviews cannot be approved from the session', async () => {
  for (const review of [{ ...draft(), expiresAt: '2000-01-01T00:00:00Z' }, { ...draft(), changes: [] }]) {
    const f = await fixture(() => ({ answer: 'Review', review })); f.session.setInput('Rename'); await f.session.submit(); await f.session.approve(); assert.equal(f.calls.length, 1);
    if (review.expiresAt.startsWith('2000')) assert.match(f.session.snapshot().error, /expired|new review/i);
  }
});
