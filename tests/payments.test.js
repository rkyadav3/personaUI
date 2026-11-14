import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';

const mod = await import('../server/paymentService.js').catch(e => { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e; });
const token = Buffer.alloc(32, 7).toString('base64url');
const requestId = '223ecb9d-6e31-4e2e-bb6e-5ce70c74e5ef';
const input = { slug: 'alice', requestId, receiptToken: token, item: { kind: 'offering', id: '5' }, buyer: { name: 'Buyer Name', email: 'buyer@example.test', phone: '' } };
const account = { enabled: true, keyId: 'rzp_test_fixture', keySecret: 'test-secret', webhookSecret: 'webhook-secret' };
const sign = paymentId => createHmac('sha256', account.keySecret).update(`order_fixture|${paymentId}`).digest('hex');

function fixture(options = {}) {
  const rows = [];
  let orders = 0, paymentReads = 0, captures = 0, completions = 0;
  const item = { kind: 'offering', id: '5', title: 'E-book', pricing: 'paid', amount: 149.5, currency: 'INR', deliveryUrl: 'https://example.test/private-download', ...options.item };
  const repo = {
    owner: async slug => ['alice', 'bob'].includes(slug) ? { id: slug === 'alice' ? 'owner-a' : 'owner-b', slug, name: slug } : null,
    accountOwner: async slug => ({ id: slug === 'alice' ? 'owner-a' : 'owner-b', slug }),
    item: async (owner, ref) => owner === 'owner-a' && ref.id === '5' ? item : null,
    account: async () => options.account || account,
    sharedAccount: async () => account,
    sealAccount: (value, owner, id) => JSON.stringify(value),
    purchaseAccount: async row => JSON.parse(row.payment_credentials),
    claim: async () => {},
    byRequest: async (owner, id) => rows.find(r => r.owner_id === owner && r.request_id === id) || null,
    byOrder: async (owner, id) => rows.find(r => r.owner_id === owner && r.razorpay_order_id === id) || null,
    byPayment: async (owner, id) => rows.find(r => r.owner_id === owner && r.razorpay_payment_id === id) || null,
    webhookOrder: async id => rows.find(r => r.razorpay_order_id === id) || null,
    webhookPayment: async id => rows.find(r => r.razorpay_payment_id === id) || null,
    insert: async row => { rows.push({ ...row }); return rows.at(-1); },
    attach: async (owner, id, order) => { const row = rows.find(r => r.owner_id === owner && r.id === id); row.razorpay_order_id = order; return row; },
    fail: async (owner, id) => { const row = rows.find(r => r.owner_id === owner && r.id === id); if (row.status === 'pending') row.status = 'failed'; },
    complete: async a => {
      const row = rows.find(r => r.owner_id === a.ownerId && r.id === a.purchaseId && r.razorpay_order_id === a.orderId);
      assert.equal(row.amount, a.amount); assert.equal(row.currency, a.currency);
      if (row.status !== 'paid') { completions++; row.status = 'paid'; row.razorpay_payment_id = a.paymentId; row.paid_at = '2026-11-04T12:00:00.000Z'; }
      return row;
    },
    refund: async (owner, id, amount) => { const row = rows.find(r => r.owner_id === owner && r.id === id); row.refunded_amount = Math.max(row.refunded_amount || 0, amount); if (amount === row.amount) row.status = 'refunded'; return row; },
  };
  const gateway = {
    createOrder: async (_, a) => { orders++; return { id: 'order_fixture', amount: a.amount, currency: a.currency }; },
    payment: async () => { paymentReads++; return { id: 'pay_fixture', order_id: 'order_fixture', amount: 14950, currency: 'INR', status: 'captured', ...options.payment }; },
    capture: async (_, id, amount, currency) => { captures++; return { id, order_id: 'order_fixture', amount, currency, status: 'captured' }; },
    orderPayments: async () => ({ items: [] }),
  };
  assert.equal(typeof mod.createPaymentService, 'function', 'The Razorpay checkout service has not been implemented.');
  return { service: mod.createPaymentService({ repo, gateway, clock: () => Date.parse('2026-11-04T12:00:00Z') }), repo, gateway, rows, counts: () => ({ orders, paymentReads, captures, completions }) };
}

test('the stored catalog price wins over a client-supplied amount', async () => {
  const { service, rows } = fixture();
  const result = await service.create({ ...input, amount: 1, item: { ...input.item, price: 0 } });
  assert.equal(result.amount, 14950); assert.equal(rows[0].amount, 14950);
  assert.doesNotMatch(JSON.stringify(result), /test-secret|private-download|payment_credentials/);
  assert.equal(rows[0].receipt_token_hash, createHash('sha256').update(token).digest('hex'));
});

test('a free claim is completed and recorded without Razorpay', async () => {
  const { service, counts } = fixture({ item: { pricing: 'free', amount: 0 } });
  const result = await service.create(input);
  assert.equal(result.status, 'free'); assert.equal(result.deliveryUrl, 'https://example.test/private-download'); assert.equal(counts().orders, 0);
});

test('repeating a checkout request creates only one purchase and one Razorpay order', async () => {
  const { service, rows, counts } = fixture();
  const first = await service.create(input), second = await service.create(input);
  assert.equal(first.id, second.id); assert.equal(rows.length, 1); assert.equal(counts().orders, 1);
});

test('a bad payment signature cannot mark an order paid', async () => {
  const { service, rows, counts } = fixture(); await service.create(input);
  await assert.rejects(service.verify({ ...input, razorpay_order_id: 'order_fixture', razorpay_payment_id: 'pay_fixture', razorpay_signature: '0'.repeat(64) }), /signature/i);
  assert.equal(rows[0].status, 'pending'); assert.equal(counts().paymentReads, 0);
});

test('a captured payment with the wrong amount is rejected', async () => {
  const { service, rows } = fixture({ payment: { amount: 1 } }); await service.create(input);
  await assert.rejects(service.verify({ ...input, razorpay_order_id: 'order_fixture', razorpay_payment_id: 'pay_fixture', razorpay_signature: sign('pay_fixture') }), /amount|match/i);
  assert.equal(rows[0].status, 'pending');
});

test('payments from another order or currency are rejected', async () => {
  for (const payment of [{ order_id: 'order_other' }, { currency: 'USD' }]) {
    const { service, rows } = fixture({ payment }); await service.create(input);
    await assert.rejects(service.verify({ ...input, razorpay_order_id: 'order_fixture', razorpay_payment_id: 'pay_fixture', razorpay_signature: sign('pay_fixture') }), /match/i);
    assert.equal(rows[0].status, 'pending');
  }
});

test('an authorized payment is captured before the private delivery link is returned', async () => {
  const { service, counts } = fixture({ payment: { status: 'authorized' } }); await service.create(input);
  const result = await service.verify({ ...input, razorpay_order_id: 'order_fixture', razorpay_payment_id: 'pay_fixture', razorpay_signature: sign('pay_fixture') });
  assert.equal(result.status, 'paid'); assert.equal(result.deliveryUrl, 'https://example.test/private-download'); assert.equal(counts().captures, 1);
});

test('a receipt from another profile or with a wrong token reveals no purchase', async () => {
  const { service } = fixture(); await service.create(input);
  await assert.rejects(service.status({ ...input, slug: 'bob' }), /not found|receipt/i);
  await assert.rejects(service.status({ ...input, receiptToken: Buffer.alloc(32, 8).toString('base64url') }), /receipt/i);
});

test('a signed webhook recovers a lost callback and stays idempotent', async () => {
  const { service, counts } = fixture(); await service.create(input);
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_fixture', order_id: 'order_fixture', amount: 14950, currency: 'INR', status: 'captured' } } } });
  const signature = createHmac('sha256', account.webhookSecret).update(body).digest('hex');
  await service.webhook({ slug: 'alice', body, signature }); await service.webhook({ slug: 'alice', body, signature });
  const result = await service.status(input);
  assert.equal(result.status, 'paid'); assert.equal(counts().completions, 1);
});

test('a forged webhook cannot complete a purchase', async () => {
  const { service, rows } = fixture(); await service.create(input);
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_fixture', order_id: 'order_fixture', amount: 14950, currency: 'INR', status: 'captured' } } } });
  await assert.rejects(service.webhook({ slug: 'alice', body, signature: '0'.repeat(64) }), /signature/i);
  assert.equal(rows[0].status, 'pending');
});

test('a disabled account or unpublished item cannot create a paid checkout', async () => {
  const disabled = fixture({ account: { ...account, enabled: false } });
  await assert.rejects(disabled.service.create(input), /payments|checkout|Razorpay/i);
  assert.equal(disabled.rows.length, 0);
  const hidden = fixture(); await assert.rejects(hidden.service.create({ ...input, item: { kind: 'offering', id: '999' } }), /available|found/i);
});

test('concurrent requests cannot reuse a receipt for a different product', async () => {
  const f = fixture(); let reads = 0;
  const other = { id: 'other', owner_id: 'owner-a', request_id: requestId, receipt_token_hash: createHash('sha256').update(token).digest('hex'), item_kind: 'offering', item_id: '6', status: 'paid' };
  f.repo.byRequest = async () => reads++ ? other : null;
  f.repo.insert = async () => { throw Object.assign(new Error('Duplicate'), { code: '23505' }); };
  await assert.rejects(f.service.create(input), /new checkout/i);
});

test('a receipt recovers a captured payment when the browser callback and webhook were missed', async () => {
  const f = fixture(); await f.service.create(input);
  f.gateway.orderPayments = async () => ({ items: [{ id: 'pay_fixture', order_id: 'order_fixture', amount: 14950, currency: 'INR', status: 'captured' }] });
  assert.equal((await f.service.status(input)).status, 'paid');
  assert.equal(f.counts().completions, 1);
});

test('the shared Razorpay webhook identifies the profile owner from the stored order', async () => {
  const f = fixture(); await f.service.create(input);
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_fixture', order_id: 'order_fixture', amount: 14950, currency: 'INR', status: 'captured', notes: { owner_id: 'forged-owner' } } } } });
  const signature = createHmac('sha256', account.webhookSecret).update(body).digest('hex');
  await f.service.webhook({ body, signature });
  assert.equal(f.rows[0].owner_id, 'owner-a'); assert.equal(f.rows[0].status, 'paid');
});

test('an item without a delivery file cannot take a payment or record a free claim', async () => {
  for (const pricing of ['paid', 'free']) {
    const f = fixture({ item: { pricing, deliveryUrl: '' } });
    await assert.rejects(f.service.create(input), /delivery file/i); assert.equal(f.rows.length, 0);
  }
});

test('invalid receipts, contact details and item references are rejected before storage', async () => {
  for (const patch of [{ requestId: 'bad' }, { receiptToken: 'bad' }, { buyer: { name: 'A', email: 'bad' } }, { item: { kind: 'invalid', id: '5' } }, { slug: 'Alice/secret' }]) {
    const f = fixture(); await assert.rejects(f.service.create({ ...input, ...patch }), e => [400, 404].includes(e.status)); assert.equal(f.rows.length, 0);
  }
  const f = fixture({ item: { amount: 1.234 } }); await assert.rejects(f.service.create(input), /valid price/);
});

test('failed gateway order creation records failure without permitting delivery', async () => {
  const f = fixture(); f.gateway.createOrder = async () => ({ id: 'order_bad', amount: 1, currency: 'INR' });
  await assert.rejects(f.service.create(input), /does not match/); assert.equal(f.rows[0].status, 'failed');
  assert.equal((await f.service.status(input)).deliveryUrl, undefined);
});

test('pending receipts reject invalid recovery responses and unmatched verification references', async () => {
  const f = fixture(); await f.service.create(input);
  f.gateway.orderPayments = async () => null;
  await assert.rejects(f.service.status(input), /status could not be read/);
  f.gateway.orderPayments = async () => ({ items: [{ id: 'invalid', status: 'captured' }] });
  await assert.rejects(f.service.status(input), /Invalid payment/);
  await assert.rejects(f.service.verify({ ...input, razorpay_order_id: 'order_other', razorpay_payment_id: 'pay_fixture' }), /does not match/);
});

test('free receipts need no verification and repeated valid payment verification is idempotent', async () => {
  const free = fixture({ item: { pricing: 'free', amount: 0 } }); await free.service.create(input);
  assert.equal((await free.service.verify(input)).status, 'free');
  const paid = fixture(); await paid.service.create(input);
  const callback = { ...input, razorpay_order_id: 'order_fixture', razorpay_payment_id: 'pay_fixture', razorpay_signature: sign('pay_fixture') };
  await paid.service.verify(callback); await paid.service.verify(callback);
  assert.equal(paid.counts().completions, 1); assert.equal(paid.counts().paymentReads, 1);
});

test('failed payment notifications do not undo a completed purchase', async () => {
  const f = fixture(); await f.service.create(input);
  const data = { event: 'payment.failed', payload: { payment: { entity: { id: 'pay_fixture', order_id: 'order_fixture', amount: 14950, currency: 'INR', status: 'failed' } } } };
  const body = JSON.stringify(data), signature = createHmac('sha256', account.webhookSecret).update(body).digest('hex');
  await f.service.webhook({ body, signature }); assert.equal(f.rows[0].status, 'failed');
  await f.service.verify({ ...input, razorpay_order_id: 'order_fixture', razorpay_payment_id: 'pay_fixture', razorpay_signature: sign('pay_fixture') });
  await f.service.webhook({ body, signature }); assert.equal(f.rows[0].status, 'paid');
});

test('refund webhooks use the gateway’s cumulative amount and revoke fully refunded access', async () => {
  const f = fixture({ payment: { amount_refunded: 14950 } }); await f.service.create(input);
  await f.service.verify({ ...input, razorpay_order_id: 'order_fixture', razorpay_payment_id: 'pay_fixture', razorpay_signature: sign('pay_fixture') });
  const body = JSON.stringify({ event: 'refund.processed', payload: { refund: { entity: { payment_id: 'pay_fixture', amount: 1 } } } });
  const signature = createHmac('sha256', account.webhookSecret).update(body).digest('hex');
  await f.service.webhook({ body, signature }); await f.service.webhook({ body, signature });
  const result = await f.service.status(input); assert.equal(result.status, 'refunded'); assert.equal(result.refundedAmount, 14950); assert.equal(result.deliveryUrl, undefined);
});

test('unknown signed orders are ignored and malformed webhook bodies are rejected', async () => {
  const f = fixture(), body = JSON.stringify({ event: 'other.event' });
  const signature = createHmac('sha256', account.webhookSecret).update(body).digest('hex');
  assert.equal((await f.service.webhook({ body, signature })).ignored, true);
  await assert.rejects(f.service.webhook({ body: '[', signature }), e => e.status === 400);
});
