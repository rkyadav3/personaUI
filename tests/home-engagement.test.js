import test from 'node:test';
import assert from 'node:assert/strict';
import * as tracker from '../server/track.js';
import * as api from '../api/track.js';
import { scriptedDatabase, step, hasEq } from './support/database.js';

const offering = { id: 1, owner_id: 'owner', contribution_id: 2, active: true };
const visible = () => [{ table: 'offerings', data: [offering] }, { table: 'profiles', data: [{ id: 1, users: { id: 'owner', tags: [] } }] }, { table: 'contributions', data: [{ id: 2, category: 'Books' }] }, { table: 'site_settings', data: [{ page: {} }] }];
const meta = { req: {}, ip: '192.0.2.1', ua: 'Test visitor' };
const response = () => ({ setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } });

test('public offering ratings save one visitor hash and return the actual updated totals', async () => {
  assert.equal(typeof tracker.createTracker, 'function');
  const db = scriptedDatabase(...visible(), { table: 'rpc:rate_offering', data: null }, { table: 'offerings', data: [{ rating_sum: 49, rating_count: 10 }] });
  const record = tracker.createTracker({ db, sessionUser: async () => null });
  const result = await record({ kind: 'rate', id: 1, stars: 5 }, meta);
  assert.deepEqual(result, { ok: true, count: 10, avg: 4.9 });
  const params = step(db.calls.find(c => c.table === 'rpc:rate_offering'), 'rpc')[0];
  assert.equal(params.p_id, 1); assert.equal(params.p_stars, 5); assert.match(params.p_voter, /^[a-f0-9]{32}$/);
  assert.doesNotMatch(params.p_voter, /192\.0\.2/);
  assert.ok(hasEq(db.calls.find(c => c.table === 'contributions'), 'owner_id', 'owner'));
});

test('unpublished profiles, hidden categories and hidden shops cannot receive engagement', async () => {
  for (const altered of [
    visible().map(r => r.table === 'profiles' ? { ...r, data: [] } : r),
    visible().map(r => r.table === 'contributions' ? { ...r, data: [] } : r),
    visible().map(r => r.table === 'site_settings' ? { ...r, data: [{ page: { placement: { Books: 'hidden' } } }] } : r),
    visible().map(r => r.table === 'site_settings' ? { ...r, data: [{ page: { sections: { store: false } } }] } : r),
  ]) {
    const db = scriptedDatabase(...altered);
    const result = await tracker.createTracker({ db, sessionUser: async () => null })({ kind: 'rate', id: 1, stars: 5 }, meta);
    assert.equal(result.count, undefined); assert.ok(!db.calls.some(c => c.table === 'rpc:rate_offering'));
  }
});

test('owners cannot rate themselves and malformed votes do not mutate ratings', async () => {
  const own = tracker.createTracker({ db: scriptedDatabase({ table: 'offerings', data: [offering] }), sessionUser: async () => ({ id: 'owner' }) });
  assert.equal((await own({ kind: 'rate', id: 1, stars: 5 }, meta)).ok, false);
  for (const stars of [0, 6, 1.5, 'bad']) {
    const result = await tracker.createTracker({ db: scriptedDatabase(), sessionUser: async () => null })({ kind: 'rate', id: 1, stars }, meta);
    assert.equal(result.ok, false);
  }
});

test('private, suspended and missing account records cannot receive public offering ratings', async () => {
  for (const account of [null, { id: 'owner', tags: ['private'] }, { id: 'owner', locked_until: '2099-01-01' }]) {
    const db = scriptedDatabase({ table: 'offerings', data: [offering] }, { table: 'profiles', data: [{ id: 1, users: account }] });
    const result = await tracker.createTracker({ db, sessionUser: async () => null })({ kind: 'rate', id: 1, stars: 5 }, meta);
    assert.equal(result.count, undefined); assert.equal(db.calls.length, 2);
  }
});

test('visitor product views and checkout interactions update their respective counters', async () => {
  for (const [kind, field] of [['view', 'views'], ['click', 'clicks']]) {
    const db = scriptedDatabase(...visible(), { table: 'rpc:bump_offering', data: null });
    await tracker.createTracker({ db, sessionUser: async () => null })({ kind, id: 1 }, meta);
    assert.equal(step(db.calls.at(-1), 'rpc')[0].p_field, field);
  }
});

test('public profile visits increment views while owner visits do not', async () => {
  const db = scriptedDatabase({ table: 'users', data: [{ id: 'owner' }] }, { table: 'rpc:bump_profile_view', data: null });
  await tracker.createTracker({ db, sessionUser: async () => null })({ kind: 'profile', slug: 'owner' }, meta);
  assert.equal(step(db.calls.at(-1), 'rpc')[0].p_owner, 'owner');
  const ownDb = scriptedDatabase({ table: 'users', data: [{ id: 'owner' }] });
  await tracker.createTracker({ db: ownDb, sessionUser: async () => ({ id: 'owner' }) })({ kind: 'profile', slug: 'owner' }, meta);
  assert.equal(ownDb.calls.length, 1);
});

test('public custom tags preserve profile and offering tracking with computed privacy', async () => {
  const account = { id: 'owner', tags: ['custom-mentor'], profile_private: false };
  const db = scriptedDatabase({ table: 'users', data: [account] }, { table: 'rpc:bump_profile_view', data: null });
  await tracker.createTracker({ db, sessionUser: async () => null })({ kind: 'profile', slug: 'owner' }, meta);
  assert.match(step(db.calls[0], 'select')[0], /profile_private/);
  assert.equal(db.calls.at(-1).table, 'rpc:bump_profile_view');
  const responses = visible().map(row => row.table === 'profiles' ? { ...row, data: [{ id: 1, users: account }] } : row);
  const offeringDb = scriptedDatabase(...responses, { table: 'rpc:bump_offering', data: null });
  await tracker.createTracker({ db: offeringDb, sessionUser: async () => null })({ kind: 'view', id: 1 }, meta);
  assert.match(step(offeringDb.calls.find(call => call.table === 'profiles'), 'select')[0], /profile_private/);
  assert.equal(offeringDb.calls.at(-1).table, 'rpc:bump_offering');
});

test('rating endpoint errors are retryable and do not report success', async t => {
  assert.equal(typeof api.createTrackHandler, 'function');
  t.mock.method(console, 'error', () => {});
  const handler = api.createTrackHandler({ track: async () => { throw new Error('Private backend details'); } });
  const res = response();
  await handler({ method: 'POST', headers: {}, body: { kind: 'rate', id: 1, stars: 5 } }, res);
  assert.equal(res.code, 503); assert.equal(res.value.ok, false); assert.doesNotMatch(res.value.error, /Private/);
});

test('repeat views and clicks are counted once per visitor window', async () => {
  const calls = [], handler = api.createTrackHandler({ track: async payload => { calls.push(payload); return { ok: true }; } }), res = response();
  const req = { method: 'POST', headers: { 'x-forwarded-for': 'fixture-ip' }, body: { kind: 'view', id: 1 } };
  await handler(req, res); await handler(req, res); assert.equal(calls.length, 1);
  req.body = { kind: 'click', id: 1 }; await handler(req, res); await handler(req, res); assert.equal(calls.length, 2);
  req.body = { kind: 'rate', id: 1, stars: 5 }; await handler(req, res); await handler(req, res); assert.equal(calls.length, 4);
});

test('tracking validates IDs, inactive offerings and private contribution visibility', async () => {
  for (const body of [{ kind: 'unknown', id: 1 }, { kind: 'view', id: 0 }, { kind: 'click', id: 'bad' }]) {
    assert.equal((await tracker.createTracker({ db: scriptedDatabase(), sessionUser: async () => null })(body, meta)).ok, false);
  }
  for (const data of [[], [{ ...offering, active: false }]]) {
    const db = scriptedDatabase({ table: 'offerings', data });
    assert.equal((await tracker.createTracker({ db, sessionUser: async () => null })({ kind: 'view', id: 1 }, meta)).ok, true);
    assert.equal(db.calls.length, 1);
  }
  const db = scriptedDatabase({ table: 'offerings', data: [offering] }, { table: 'profiles', data: [{ visibility: { contributions: false } }] });
  await tracker.createTracker({ db, sessionUser: async () => null })({ kind: 'view', id: 1 }, meta); assert.equal(db.calls.length, 2);
});

test('a visitor session lookup failure does not prevent an otherwise valid public view', async () => {
  const db = scriptedDatabase(...visible(), { table: 'rpc:bump_offering', data: null });
  await tracker.createTracker({ db, sessionUser: async () => { throw new Error('Session unavailable'); } })({ kind: 'view', id: 1 }, meta);
  assert.equal(db.calls.at(-1).table, 'rpc:bump_offering');
});

test('own offering views do not increment counters and ratings with no votes show zero', async () => {
  const db = scriptedDatabase({ table: 'offerings', data: [offering] });
  await tracker.createTracker({ db, sessionUser: async () => ({ id: 'owner' }) })({ kind: 'view', id: 1 }, meta); assert.equal(db.calls.length, 1);
  const unrated = scriptedDatabase(...visible(), { table: 'rpc:rate_offering', data: null }, { table: 'offerings', data: [] });
  assert.equal((await tracker.createTracker({ db: unrated, sessionUser: async () => null })({ kind: 'rate', id: 1, stars: 1 }, meta)).avg, 0);
});

test('tracking endpoint enforces request methods, rate limits and JSON parsing', async () => {
  const calls = [], handler = api.createTrackHandler({ track: async body => { calls.push(body); return { ok: !!body.kind }; } }), res = response();
  await handler({ method: 'GET' }, res); assert.equal(res.code, 405);
  await handler({ method: 'POST', headers: {}, body: '{' }, res); assert.equal(res.code, 400);
  await handler({ method: 'POST', headers: {}, body: '{"kind":"view","id":1}' }, res); assert.equal(res.code, 200);
  await handler({ method: 'POST', headers: {} }, res); assert.equal(res.code, 400);
  for (let i = 0; i < 41; i++) await handler({ method: 'POST', headers: { 'x-forwarded-for': 'limit-visitor' }, body: { kind: 'rate', id: 1, stars: 3 } }, res);
  assert.equal(res.code, 429);
});

test('failed best-effort view counters do not block public navigation', async t => {
  t.mock.method(console, 'error', () => {});
  const handler = api.createTrackHandler({ track: async () => { throw new Error('Counter unavailable'); } }), res = response();
  await handler({ method: 'POST', headers: {}, body: { kind: 'view', id: 1 } }, res);
  assert.equal(res.code, 200); assert.equal(res.value.ok, true);
});

test('malformed JSON values and unknown tracking kinds return a controlled validation error', async () => {
  const handler = api.createTrackHandler({ track: async () => { throw new Error('Must not record'); } }), res = response();
  for (const body of ['null', '[]', '42', { kind: 'constructor', id: 1 }]) {
    await handler({ method: 'POST', headers: {}, body }, res); assert.equal(res.code, 400);
  }
});
