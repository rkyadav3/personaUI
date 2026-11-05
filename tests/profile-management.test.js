import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptedDatabase, step, hasEq } from './support/database.js';
import { saveOffering, getProfile } from '../server/profile.js';
import { createAdminHandler } from '../api/admin.js';
import chat from '../api/chat.js';
import { listQuestions } from '../server/chatHistory.js';

const response = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } });

test('offerings persist the selected category and reload under that category', async () => {
  const db = scriptedDatabase(
    { table: 'contributions', data: [{ id: 2, category: 'Books' }] },
    { table: 'offerings', data: [{ id: 9 }] },
    { table: 'profiles', data: [{ id: 1 }] },
    { table: 'contributions', data: [{ id: 1, category: 'Content' }, { id: 2, category: 'Books' }] },
    { table: 'offerings', data: [{ id: 9, contribution_id: 2, title: 'Guide' }] },
  );
  await saveOffering(db, { id: 9, contributionId: 2, title: 'Guide', details: { author: 'Owner', invalid: 'discard' } });
  assert.equal(step(db.calls[1], 'update')[0].contribution_id, 2);
  assert.equal(step(db.calls[1], 'update')[0].details.invalid, undefined);
  assert.ok(hasEq(db.calls[1], 'id', 9));
  const profile = await getProfile(db);
  assert.equal(profile.contributions[0].offerings.length, 0);
  assert.equal(profile.contributions[1].offerings[0].title, 'Guide');
});

test('an unavailable category cannot create an offering', async () => {
  const db = scriptedDatabase({ table: 'contributions', data: [] });
  await assert.rejects(saveOffering(db, { contributionId: 99, title: 'Guide' }), /Contribution not found/);
  assert.equal(db.calls.length, 1);
});

test('Profile Q&A requires authentication and reads pages in the signed-in owner scope', async () => {
  const db = scriptedDatabase({ table: 'chat_log', data: [{ id: 1, question: 'Question', answer: 'Reply', sources: ['Notes'] }], count: 75 });
  const handler = createAdminHandler({ sessionUser: async () => ({ id: 'owner', isAdmin: false }), scoped: owner => { assert.equal(owner, 'owner'); return db; } });
  const res = response();
  await handler({ method: 'POST', body: { op: 'chat.list', args: { page: 2, owner_id: 'other' } } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.value.rows[0].answer, 'Reply');
  assert.equal(res.value.total, 75);
  assert.equal(res.value.pageSize, 50);
  assert.deepEqual(step(db.calls[0], 'range'), [50, 99]);
  assert.deepEqual(db.calls[0].steps.filter(s => s.method === 'order').map(s => s.args[0]), ['created_at', 'id']);
  const anonymous = createAdminHandler({ sessionUser: async () => null, scoped: () => { throw new Error('Must not read'); } });
  await anonymous({ method: 'POST', body: { op: 'chat.list' } }, res);
  assert.equal(res.code, 401);
});

test('Profile Q&A rejects invalid pages and propagates database failures', async () => {
  const db = scriptedDatabase({ table: 'chat_log', error: { message: 'History unavailable' } });
  const handler = createAdminHandler({ sessionUser: async () => ({ id: 'owner' }), scoped: () => db });
  const res = response();
  for (const page of [0, -1, 1.5, 'bad', Infinity]) {
    await handler({ method: 'POST', body: { op: 'chat.list', args: { page } } }, res);
    assert.equal(res.code, 400);
  }
  assert.equal(db.calls.length, 0);
  await handler({ method: 'POST', body: { op: 'chat.list' } }, res);
  assert.equal(res.code, 500);
  assert.match(res.value.error, /Could not load visitor questions/);
});

test('a new owner has an empty first page and page arguments cannot exceed the history bound', async () => {
  const db = scriptedDatabase({ table: 'chat_log', data: null, count: null });
  assert.deepEqual(await listQuestions(db), { rows: [], total: 0, page: 1, pageSize: 50 });
  await assert.rejects(listQuestions(db, { page: 100001 }), e => e.status === 400);
});

test('history identifies missing migrations without exposing database details', async () => {
  for (const code of ['42703', '42P01', 'PGRST204', 'PGRST205']) {
    const db = scriptedDatabase({ table: 'chat_log', error: { code, message: 'Private schema details' } });
    await assert.rejects(listQuestions(db), e => e.status === 503 && /profile-questions.sql/.test(e.message) && !/Private/.test(e.message));
  }
});

test('history rejects malformed request arguments before querying the database', async () => {
  const db = scriptedDatabase();
  for (const args of [null, false, 'page', [], { page: true }]) await assert.rejects(listQuestions(db, args), e => e.status === 400);
  assert.equal(db.calls.length, 0);
});

let visitor = 0;
function chatFixture(t, { rows = [], generated = 'My answer [1].', embedFails = false, generateFails = false, logFails = false, logThrows = false, ownerFails = false, searchFails = false, owner = 'owner', serviceKey = 'fixture' } = {}) {
  const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
  process.env.SUPABASE_URL = 'https://db.example.test'; process.env.SUPABASE_SERVICE_KEY = serviceKey;
  t.after(() => { for (const [key, value] of [['SUPABASE_URL', previous.url], ['SUPABASE_SERVICE_KEY', previous.key]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const logs = [];
  t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.includes('/users?')) return new Response(JSON.stringify(owner ? [{ id: owner }] : []), { status: ownerFails ? 500 : 200 });
    if (url.includes(':embedContent')) return new Response(JSON.stringify({ embedding: { values: [1] } }), { status: embedFails ? 500 : 200 });
    if (url.includes('/rpc/hybrid_search')) return new Response(JSON.stringify(rows), { status: searchFails ? 500 : 200 });
    if (url.includes(':generateContent')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: generated }] } }] }), { status: generateFails ? 500 : 200 });
    if (url.endsWith('/chat_log')) { logs.push(JSON.parse(options.body)); if (logThrows) throw new Error('Offline'); return new Response(null, { status: logFails ? 500 : 201 }); }
    throw new Error(`Unexpected URL: ${url}`);
  });
  const res = response();
  return { logs, res, run: async (body = { slug: 'owner', message: 'What do you work on?' }) => { await chat({ method: 'POST', headers: { 'x-forwarded-for': `visitor-${++visitor}` }, body }, res); return res; } };
}
const passage = { source_name: 'Notes', content: 'I build useful tools. I teach others.', similarity: 0.9 };

test('public chat records the exact answer, cited sources, question and owner', async t => {
  const f = chatFixture(t, { rows: [passage, { ...passage }] }); await f.run();
  assert.equal(f.res.code, 200);
  assert.equal(f.logs.length, 1);
  assert.equal(f.logs[0].answer, f.res.value.reply);
  assert.deepEqual(f.logs[0].sources, f.res.value.sources);
  assert.deepEqual(f.logs[0].sources, ['Notes']);
  assert.equal(f.logs[0].owner_id, 'owner');
  assert.equal(f.logs[0].question, 'What do you work on?');
  assert.equal(f.logs[0].answered, true);
});

test('questions without matching notes retain the actual no-answer response', async t => {
  const f = chatFixture(t); await f.run();
  assert.equal(f.logs[0].answer, f.res.value.reply);
  assert.equal(f.logs[0].answered, false);
  assert.deepEqual(f.logs[0].sources, []);
});

test('a model no-answer response is stored with no cited sources', async t => {
  const f = chatFixture(t, { rows: [passage], generated: "I don't have anything about that in my research yet." }); await f.run();
  assert.equal(f.logs[0].answer, f.res.value.reply);
  assert.equal(f.logs[0].answered, false);
  assert.deepEqual(f.logs[0].sources, []);
});

test('a retrieval failure records the question and failure response for the owner', async t => {
  const f = chatFixture(t, { embedFails: true }); await f.run();
  assert.equal(f.res.code, 502);
  assert.equal(f.logs[0].answer, f.res.value.reply);
  assert.equal(f.logs[0].answered, false);
});

test('a generation failure records the passage fallback that the visitor receives', async t => {
  const f = chatFixture(t, { rows: [passage], generateFails: true }); await f.run();
  assert.equal(f.res.code, 200);
  assert.equal(f.logs[0].answer, 'I build useful tools. I teach others.');
  assert.deepEqual(f.logs[0].sources, ['Notes']);
});

test('failed history writes do not silently report a successful chat', async t => {
  const f = chatFixture(t, { logFails: true }); await f.run();
  assert.equal(f.res.code, 503);
});

test('network failures during history writes return a retryable error', async t => {
  const f = chatFixture(t, { logThrows: true }); await f.run();
  assert.equal(f.res.code, 503);
});

test('invalid questions and unknown profiles do not create history entries', async t => {
  const f = chatFixture(t, { owner: null });
  await f.run({ slug: 'owner', message: '' }); assert.equal(f.res.code, 400);
  await f.run(); assert.equal(f.res.code, 404);
  assert.equal(f.logs.length, 0);
});

test('owner lookup failures return an error without writing unowned history', async t => {
  const f = chatFixture(t, { ownerFails: true }); await f.run();
  assert.equal(f.res.code, 502); assert.equal(f.logs.length, 0);
});

test('search failures still record the question and retry response', async t => {
  const f = chatFixture(t, { searchFails: true }); await f.run();
  assert.equal(f.res.code, 502); assert.equal(f.logs[0].answer, f.res.value.reply);
});

test('an empty generation quotes the matching passage and supports legacy service keys', async t => {
  const f = chatFixture(t, { rows: [passage], generated: '', serviceKey: 'eyJfixture' }); await f.run();
  assert.equal(f.res.code, 200); assert.equal(f.logs[0].answer, passage.content);
});

test('public questions are bounded and search context is limited across sources', async t => {
  const rows = Array.from({ length: 10 }, (_, index) => ({ ...passage, source_name: index < 4 ? 'One source' : `Source ${index}`, heading: 'Work' }));
  const f = chatFixture(t, { rows }); await f.run({ slug: 'owner', message: `  ${'x'.repeat(600)}  ` });
  assert.equal(f.logs[0].question.length, 500);
  assert.equal(f.res.value.sources.length, 4);
});

test('non-POST requests and missing message bodies are rejected before looking up a profile', async t => {
  const f = chatFixture(t);
  await chat({ method: 'GET' }, f.res); assert.equal(f.res.code, 405);
  await chat({ method: 'POST', headers: {} }, f.res); assert.equal(f.res.code, 400);
  assert.equal(f.logs.length, 0);
});

test('the warm-instance chat rate limit rejects excess requests without extra history', async t => {
  const f = chatFixture(t); const ip = `rate-limit-${++visitor}`;
  for (let i = 0; i < 9; i++) await chat({ method: 'POST', headers: { 'x-forwarded-for': ip }, body: { slug: 'owner', message: 'Question' } }, f.res);
  assert.equal(f.res.code, 429); assert.equal(f.logs.length, 8);
});
