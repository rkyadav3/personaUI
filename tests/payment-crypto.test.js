import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { sealSecret, openSecret, validSignature } from '../server/paymentCrypto.js';
import { createRazorpayGateway } from '../server/razorpay.js';

test('credentials are encrypted, tamper-resistant and bound to their owner', () => {
  const key = Buffer.alloc(32, 6), value = sealSecret('private-key', 'owner-a', key);
  assert.doesNotMatch(value, /private-key/); assert.equal(openSecret(value, 'owner-a', key), 'private-key');
  assert.throws(() => openSecret(value, 'owner-b', key), /could not be read/);
  assert.throws(() => openSecret(`${value}X`, 'owner-a', key), /could not be read/);
  assert.throws(() => sealSecret('key', 'owner', Buffer.alloc(16)), /encryption/i);
});

test('webhook signatures are checked against the exact raw body', () => {
  const body = '{"event":"payment.captured"}', signature = createHmac('sha256', 'secret').update(body).digest('hex');
  assert.equal(validSignature(body, signature, 'secret'), true);
  assert.equal(validSignature(`${body}\n`, signature, 'secret'), false);
  assert.equal(validSignature(body, 'not-a-signature', 'secret'), false);
  assert.equal(validSignature(body, signature, ''), false);
});

test('the Razorpay adapter sends server-held amounts and never exposes gateway secrets on failure', async () => {
  const calls = [], gateway = createRazorpayGateway(async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ id: 'order_123' }) }; });
  await gateway.createOrder({ keyId: 'id', keySecret: 'secret' }, { amount: 19900, currency: 'INR', receipt: 'receipt' });
  assert.equal(calls[0].url, 'https://api.razorpay.com/v1/orders'); assert.equal(JSON.parse(calls[0].options.body).amount, 19900);
  assert.throws(() => gateway.payment({ keyId: 'id', keySecret: 'secret' }, '../secret'), /Invalid payment/);
  const unavailable = createRazorpayGateway(async () => { throw new Error('secret credential'); });
  await assert.rejects(unavailable.payment({}, 'pay_123'), error => error.status === 502 && !error.message.includes('secret'));
});

test('gateway payment lookup, capture and order lookup use validated paths and amounts', async () => {
  const calls = [], gateway = createRazorpayGateway(async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ id: 'pay_123' }) }; });
  await gateway.payment({}, 'pay_123'); await gateway.capture({}, 'pay_123', 4900, 'INR'); await gateway.orderPayments({}, 'order_123');
  assert.equal(calls[0].options.method, 'GET'); assert.deepEqual(JSON.parse(calls[1].options.body), { amount: 4900, currency: 'INR' }); assert.match(calls[2].url, /orders\/order_123\/payments$/);
  assert.throws(() => gateway.orderPayments({}, '../secret'), /Invalid order/);
  for (const status of [401, 500]) {
    const unavailable = createRazorpayGateway(async () => ({ ok: false, status }));
    await assert.rejects(unavailable.payment({}, 'pay_123'), e => e.status === (status === 401 ? 503 : 502));
  }
  await assert.rejects(createRazorpayGateway(async () => ({ ok: true, json: async () => { throw new Error('HTML'); } })).payment({}, 'pay_123'), /invalid response/);
});

test('invalid encryption configuration and malformed ciphertext produce setup errors', () => {
  for (const key of ['bad-key', 1, Buffer.alloc(0)]) assert.throws(() => sealSecret('secret', 'scope', key), e => e.status === 503);
  assert.throws(() => openSecret('v2.invalid', 'scope', Buffer.alloc(32, 6)), /could not be read/);
  assert.equal(validSignature('body', null, 'secret'), false);
});
