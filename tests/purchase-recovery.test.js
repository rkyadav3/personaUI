import test from 'node:test';
import assert from 'node:assert/strict';
import { hashToken } from '../server/paymentCrypto.js';
import { createPaymentService } from '../server/paymentService.js';
import { scriptedDatabase, step, hasEq } from './support/database.js';
import { createCommerceRepository } from '../server/commerce.js';
import { paymentHandler } from '../api/payments.js';

const requestId = '223ecb9d-6e31-4e2e-bb6e-5ce70c74e5ef';
const token = Buffer.alloc(32, 7).toString('base64url');
const signingKey = 'test-only-recovery-signing-key-32-chars';
const input = { slug: 'alice', item: { kind: 'offering', id: '5' }, email: 'buyer@example.test', paymentId: 'pay_fixture' };
const account = { keyId: 'rzp_test_fixture', keySecret: 'test-secret', enabled: true };
const rawRow = { id: '223ecb9d-6e31-4e2e-bb6e-5ce70c74e500', owner_id: 'owner-a', request_id: requestId, receipt_token_hash: hashToken(token), item_kind: 'offering', item_id: '5', item_title: 'Original book', buyer_name: 'Buyer', buyer_email: 'Buyer@Example.Test ', amount: 14950, currency: 'INR', status: 'paid', razorpay_order_id: 'order_fixture', razorpay_payment_id: 'pay_fixture', delivery_url: 'https://example.test/private-book' };
function fixture(patch = {}) {
  let row = { ...rawRow, ...patch };
  const calls = [];
  const repo = {
    accountOwner: async slug => ({ id: slug === 'alice' ? 'owner-a' : 'owner-b' }),
    claim: async (owner, kind, ip) => { calls.push({ type: 'claim', owner, kind, ip }); },
    byPayment: async (owner, id) => { calls.push({ type: 'lookup', owner, id }); return row.owner_id === owner && row.razorpay_payment_id === id ? row : null; },
    byOrder: async (owner, id) => row.owner_id === owner && row.razorpay_order_id === id ? row : null,
    byRequest: async (owner, id) => row.owner_id === owner && row.request_id === id ? row : null,
    sharedAccount: async () => account,
    complete: async () => { calls.push({ type: 'complete' }); row = { ...row, status: 'paid', razorpay_payment_id: 'pay_fixture' }; return row; },
  };
  const gateway = { payment: async () => { calls.push({ type: 'gateway' }); return { id: 'pay_fixture', order_id: 'order_fixture', amount: 14950, currency: 'INR', status: 'captured' }; } };
  return { repo, gateway, calls, row: () => row, service: createPaymentService({ repo, gateway, receiptSigningKey: signingKey }) };
}

test('an old paid purchase is recovered with normalized email and its original payment ID', async () => {
  const f = fixture(), result = await f.service.recover({ ...input, email: ' BUYER@example.TEST ', paymentId: ' pay_fixture ' }, { ip: '192.0.2.1' });
  assert.equal(result.title, 'Original book'); assert.equal(result.status, 'paid'); assert.equal(result.deliveryUrl, rawRow.delivery_url);
  assert.equal(result.receipt.requestId, requestId); assert.match(result.receipt.receiptToken, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(f.calls.some(call => call.type === 'claim' && call.owner === 'owner-a' && call.ip === '192.0.2.1'));
  assert.equal(f.calls.filter(call => call.type === 'gateway').length, 0);
  assert.doesNotMatch(JSON.stringify(result), /receipt_token_hash|test-secret|signing-key/);
});

test('recovery does not invalidate the old browser receipt and the new receipt survives later status checks', async () => {
  const f = fixture(), result = await f.service.recover(input);
  assert.equal((await f.service.status({ slug: 'alice', requestId, receiptToken: token })).status, 'paid');
  assert.equal((await f.service.status({ slug: 'alice', ...result.receipt })).deliveryUrl, rawRow.delivery_url);
  assert.equal(f.row().receipt_token_hash, hashToken(token));
});

test('wrong email, item, profile or payment all return the same no-match response without exposing access', async () => {
  const messages = [];
  for (const patch of [{ email: 'other@example.test' }, { item: { kind: 'offering', id: '6' } }, { item: { kind: 'product', id: '5' } }, { slug: 'bob' }, { paymentId: 'pay_other' }]) {
    const f = fixture();
    await assert.rejects(f.service.recover({ ...input, ...patch }), error => { messages.push(error.message); return error.status === 404 && !error.message.includes('private-book'); });
    assert.equal(f.calls.filter(call => call.type === 'complete').length, 0);
  }
  assert.equal(new Set(messages).size, 1);
});

test('a recovered receipt cannot be used for a different purchase or after a signing-key change', async () => {
  const f = fixture(), result = await f.service.recover(input), changed = fixture({ id: 'different-row' });
  await assert.rejects(changed.service.status({ slug: 'alice', ...result.receipt }), error => error.status === 403);
  const rotated = createPaymentService({ repo: f.repo, gateway: f.gateway, receiptSigningKey: 'different-server-signing-key-long-enough' });
  await assert.rejects(rotated.status({ slug: 'alice', ...result.receipt }), error => error.status === 403);
});

test('invalid email, missing payment ID and malformed item inputs fail before any storage or gateway lookup', async () => {
  for (const patch of [{ email: '' }, { email: 'bad' }, { email: {} }, { email: 'x'.repeat(161) + '@example.test' }, { paymentId: '' }, { paymentId: 'order_fixture' }, { paymentId: 'pay_/bad' }, { item: null }, { item: { kind: 'wrong', id: '5' } }]) {
    const f = fixture(); await assert.rejects(f.service.recover({ ...input, ...patch }), error => error.status === 400); assert.equal(f.calls.length, 0);
  }
});

test('captured payments with a missed callback recover through the owner-bound stored order', async () => {
  const f = fixture({ status: 'pending', razorpay_payment_id: null });
  assert.equal((await f.service.recover(input)).status, 'paid');
  assert.equal(f.calls.filter(call => call.type === 'complete').length, 1);
});

test('recovery rejects mismatched gateway IDs, amounts, currencies, orders and uncaptured payments', async () => {
  for (const patch of [{ id: 'pay_other' }, { order_id: 'order_other' }, { amount: 1 }, { currency: 'USD' }, { status: 'authorized' }]) {
    const f = fixture({ status: 'pending', razorpay_payment_id: null });
    f.gateway.payment = async () => ({ id: 'pay_fixture', order_id: 'order_fixture', amount: 14950, currency: 'INR', status: 'captured', ...patch });
    await assert.rejects(f.service.recover(input), error => [400, 404, 409].includes(error.status));
    assert.equal(f.calls.filter(call => call.type === 'complete').length, 0);
  }
});

test('refunded purchases show their status but never return a download link', async () => {
  const f = fixture({ status: 'refunded', refunded_amount: 14950 }), result = await f.service.recover(input);
  assert.equal(result.status, 'refunded'); assert.equal(result.deliveryUrl, undefined);
});

test('a rate-limit or gateway failure is surfaced rather than reported as no purchase', async () => {
  const f = fixture(); f.repo.claim = async () => { throw Object.assign(new Error('Too many requests'), { status: 429 }); };
  await assert.rejects(f.service.recover(input), error => error.status === 429);
  assert.equal(f.calls.length, 0);
  const waiting = fixture({ status: 'pending', razorpay_payment_id: null }); waiting.gateway.payment = async () => { throw Object.assign(new Error('Gateway temporarily unavailable'), { status: 502 }); };
  await assert.rejects(waiting.service.recover(input), error => error.status === 502);
});

test('a remotely refunded payment with a missed callback cannot release paid access', async () => {
  const f = fixture({ status: 'pending', razorpay_payment_id: null });
  f.gateway.payment = async () => ({ id: 'pay_fixture', order_id: 'order_fixture', amount: 14950, currency: 'INR', status: 'captured', amount_refunded: 14950 });
  await assert.rejects(f.service.recover(input), error => error.status === 409 && /refund/i.test(error.message));
  assert.equal(f.calls.filter(call => call.type === 'complete').length, 0);
});

test('missing recovery signing setup preserves existing checkout receipts and fails recovery explicitly', async () => {
  const f = fixture(), unavailable = createPaymentService({ repo: f.repo, gateway: f.gateway, receiptSigningKey: '' });
  assert.equal((await unavailable.status({ slug: 'alice', requestId, receiptToken: token })).status, 'paid');
  await assert.rejects(unavailable.recover(input), error => error.status === 503 && /setup|configured/i.test(error.message));
});

test('the payment API dispatches recovery and keeps the buyer proof out of URLs', async () => {
  let received;
  const handler = paymentHandler({ recover: async (value, meta) => { received = { value, meta }; return { status: 'paid' }; } });
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method: 'POST', body: { op: 'recover', ...input }, headers: { 'x-forwarded-for': '192.0.2.1' } }, res);
  assert.equal(res.code, 200); assert.deepEqual(received, { value: input, meta: { ip: '192.0.2.1' } });
});

test('purchase payment and order lookups keep owner filters and have no date cutoff', async () => {
  const db = scriptedDatabase({ table: 'purchases', data: [rawRow] }, { table: 'purchases', data: [rawRow] }), repo = createCommerceRepository(() => db);
  await repo.byPayment('owner-a', 'pay_fixture'); await repo.byOrder('owner-a', 'order_fixture');
  for (const call of db.calls) { assert.ok(hasEq(call, 'owner_id', 'owner-a')); assert.equal(step(call, 'gte'), undefined); }
});
