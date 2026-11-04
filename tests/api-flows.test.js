import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import * as payments from '../api/payments.js';
import * as rsvp from '../api/rsvp.js';
import * as webhook from '../api/razorpay-webhook.js';
import { HttpError, jsonBody, publicError } from '../server/http.js';

const response = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } });

test('payment endpoints dispatch create, verify and receipt lookup while preserving failures', async () => {
  assert.equal(typeof payments.paymentHandler, 'function');
  const calls = [];
  const handler = payments.paymentHandler({ create: async (input, meta) => { calls.push({ input, meta }); return { status: 'free' }; }, verify: async () => { throw new HttpError(400, 'Invalid signature.'); }, status: async () => ({ status: 'paid' }) });
  const res = response();
  await handler({ method: 'POST', body: { op: 'create', slug: 'alice' }, headers: { 'x-forwarded-for': '192.0.2.1, 192.0.2.2' } }, res);
  assert.equal(res.code, 200); assert.equal(res.value.status, 'free'); assert.equal(calls[0].meta.ip, '192.0.2.1'); assert.equal(res.headers['Cache-Control'], 'no-store');
  await handler({ method: 'POST', body: { op: 'verify' } }, res); assert.equal(res.code, 400);
  await handler({ method: 'POST', body: { op: 'status' } }, res); assert.equal(res.value.status, 'paid');
  await handler({ method: 'POST', body: { op: 'constructor' } }, res); assert.equal(res.code, 400);
  await handler({ method: 'GET' }, res); assert.equal(res.code, 405); assert.equal(res.headers.Allow, 'POST');
  await handler({ method: 'POST', body: '[' }, res); assert.equal(res.code, 400);
});

test('attendance endpoints expose public summaries and submit forms with inline validation errors', async () => {
  assert.equal(typeof rsvp.rsvpHandler, 'function');
  const handler = rsvp.rsvpHandler({ summary: async input => ({ going: Number(input.eventId) }), submit: async (input, meta) => { assert.equal(meta.ip, '127.0.0.1'); throw new HttpError(400, 'Check the form.', { email: 'Enter an email' }); } });
  const res = response();
  await handler({ method: 'GET', query: { eventId: 7 } }, res); assert.equal(res.value.going, 7);
  await handler({ method: 'POST', body: {}, socket: { remoteAddress: '127.0.0.1' } }, res); assert.equal(res.code, 400); assert.equal(res.value.errors.email, 'Enter an email');
  await handler({ method: 'DELETE' }, res); assert.equal(res.code, 405);
});

test('the webhook endpoint passes the exact signed bytes to its payment service', async () => {
  assert.equal(typeof webhook.webhookHandler, 'function');
  const bytes = Buffer.from('{ "event": "payment.captured" }\n');
  const handler = webhook.webhookHandler(async input => { assert.deepEqual(input.body, bytes); assert.equal(input.signature, 'fixture-signature'); return { ok: true }; });
  const req = Object.assign(Readable.from([bytes.subarray(0, 5), bytes.subarray(5)]), { method: 'POST', headers: { 'x-razorpay-signature': 'fixture-signature' } });
  const res = response(); await handler(req, res); assert.equal(res.code, 200);
  await handler({ method: 'GET' }, res); assert.equal(res.code, 405);
});

test('raw invalid form bodies are rejected', () => {
  for (const body of [null, false, 42]) assert.throws(() => jsonBody({ body }), e => e.status === 400);
});
test('unexpected server errors never leak attached details', () => {
  const res = response();
  const original = console.error; console.error = () => {};
  try { publicError(res, Object.assign(new Error('internal key secret'), { errors: { secret: 'private value' } }), 'fixture'); }
  finally { console.error = original; }
  assert.equal(res.code, 500); assert.doesNotMatch(JSON.stringify(res.value), /private value|internal key/);
});
