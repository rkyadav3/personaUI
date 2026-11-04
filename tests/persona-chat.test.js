import test from 'node:test';
import assert from 'node:assert/strict';
import { askPersona } from '../src/lib/personaChat.js';

test('Chat posts the profile owner and a bounded question to the existing endpoint', async () => {
  const signal = new AbortController().signal;
  let request;
  const result = await askPersona('ravi', `  ${'a'.repeat(510)}  `, { signal, fetcher: async (url, options) => { request = { url, options }; return { ok: true, json: async () => ({ reply: 'An answer', sources: ['Guide', 'Guide', 3, {}, 'Profile'] }) }; } });
  assert.equal(request.url, '/api/chat');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.signal, signal);
  assert.deepEqual(JSON.parse(request.options.body), { slug: 'ravi', message: 'a'.repeat(500) });
  assert.deepEqual(result, { reply: 'An answer', sources: ['Guide', 'Profile'] });
});

test('empty and non-text questions never reach the API', async () => {
  for (const input of ['', '   ', null, {}]) await assert.rejects(askPersona('ravi', input, { fetcher: () => { throw new Error('Unexpected request'); } }), /Write a question/);
});

test('rate limits and server failures have useful errors without disclosing server details', async () => {
  for (const status of [429, 500, 502, 404]) {
    const operation = askPersona('ravi', 'My work', { fetcher: async () => ({ ok: false, status, json: async () => ({ error: 'secret database configuration' }) }) });
    await assert.rejects(operation, error => !error.message.includes('secret') && (status === 429 ? error.message.includes('wait') : error.message.includes('try again')));
  }
});

test('non-JSON and empty replies produce a retry message', async () => {
  await assert.rejects(askPersona('ravi', 'My work', { fetcher: async () => ({ ok: true, json: async () => { throw new Error('HTML gateway error'); } }) }), /try again/);
  for (const reply of [null, {}, '', '   ']) await assert.rejects(askPersona('ravi', 'My work', { fetcher: async () => ({ ok: true, json: async () => ({ reply }) }) }), /empty answer/);
});

test('answer sources are optional and bounded text', async () => {
  const without = await askPersona('ravi', 'My work', { fetcher: async () => ({ ok: true, json: async () => ({ reply: ' hello ', sources: {} }) }) });
  assert.deepEqual(without, { reply: 'hello', sources: [] });
  const withMany = await askPersona('ravi', 'My work', { fetcher: async () => ({ ok: true, json: async () => ({ reply: 'x'.repeat(10010), sources: Array.from({ length: 8 }, (_, i) => `${i}${'a'.repeat(210)}`) }) }) });
  assert.equal(withMany.reply.length, 10000);
  assert.equal(withMany.sources.length, 5);
  assert.ok(withMany.sources.every(source => source.length <= 200));
});

test('cancelling a Chat request propagates its abort instead of making a new request', async () => {
  const cancelled = new DOMException('Cancelled', 'AbortError');
  await assert.rejects(askPersona('ravi', 'My work', { fetcher: async () => { throw cancelled; } }), error => error === cancelled);
});

test('network failures give visitors a retry message without internal details', async () => {
  await assert.rejects(askPersona('ravi', 'My work', { fetcher: async () => { throw new Error('private gateway details'); } }), error => /try again/i.test(error.message) && !error.message.includes('private'));
});

test('cancelling while the response is being read preserves the abort', async () => {
  const cancelled = new DOMException('Cancelled', 'AbortError');
  await assert.rejects(askPersona('ravi', 'My work', { fetcher: async () => ({ ok: true, json: async () => { throw cancelled; } }) }), error => error === cancelled);
});
