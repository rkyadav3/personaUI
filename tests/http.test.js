import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { jsonBody } from '../server/http.js';
import { rawWebhookBody } from '../api/razorpay-webhook.js';
import adminHandler from '../api/admin.js';

test('form endpoints reject null, arrays and malformed JSON', () => {
  for (const body of ['null', '[]', '[', '42']) assert.throws(() => jsonBody({ body }), e => e.status === 400);
  assert.throws(() => jsonBody({ body: JSON.stringify({ text: 'x'.repeat(33000) }) }), e => e.status === 413);
});

test('webhook processing preserves the original bytes across stream chunks', async () => {
  const bytes = Buffer.from('{ "event": "payment.captured" }\n');
  assert.deepEqual(await rawWebhookBody(Readable.from([bytes.subarray(0, 9), bytes.subarray(9)])), bytes);
  await assert.rejects(rawWebhookBody(Readable.from([])), e => e.status === 400);
  await assert.rejects(rawWebhookBody(Readable.from([Buffer.alloc(128001)])), e => e.status === 413);
});

test('an inherited operation name is rejected rather than dispatched', async () => {
  let status, result;
  const res = { setHeader() {}, status(code) { status = code; return this; }, json(value) { result = value; return this; } };
  await adminHandler({ method: 'POST', body: { op: 'constructor' }, headers: {} }, res);
  assert.equal(status, 404); assert.ok(result.error);
});
