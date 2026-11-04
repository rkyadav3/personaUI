import test from 'node:test';
import assert from 'node:assert/strict';
import { generateJSON } from '../server/gemini.js';

test('planning requests pass their shared timeout signal to Gemini fetch', async t => {
  const original = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = 'fixture-key';
  t.after(() => { if (original === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = original; });
  const signal = AbortSignal.timeout(2000), calls = [];
  t.mock.method(globalThis, 'fetch', async (url, input) => { calls.push(input); return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"actions":[]}' }] } }] }), { status: 200 }); });
  assert.deepEqual(await generateJSON('System', 'User', { signal }), { actions: [] }); assert.equal(calls[0].signal, signal);
});

test('transient model errors retry within the same signal, while permanent failures stop', async t => {
  const original = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = 'fixture-key';
  t.after(() => { if (original === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = original; });
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return requests === 1 ? new Response('Busy', { status: 429 }) : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '```json\n{"ok":true}\n```' }] } }] })); });
  assert.deepEqual(await generateJSON('System', 'User'), { ok: true }); assert.equal(requests, 2);
  t.mock.method(globalThis, 'fetch', async () => new Response('Invalid request', { status: 400 })); await assert.rejects(generateJSON('System', 'User'), /AI request failed/);
});

test('invalid JSON, aborted fetch and missing model setup do not return a plan', async t => {
  const original = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = 'fixture-key';
  t.after(() => { if (original === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = original; });
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'invalid' }] } }] })));
  await assert.rejects(generateJSON('System', 'User'), /valid JSON/);
  t.mock.method(globalThis, 'fetch', async () => { throw new DOMException('Stopped', 'AbortError'); }); await assert.rejects(generateJSON('System', 'User'), error => error.name === 'AbortError');
  delete process.env.GEMINI_API_KEY; await assert.rejects(generateJSON('System', 'User'), /GEMINI_API_KEY/);
});
