import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommerceRepository, paymentSettings, savePaymentSettings, listPurchases, fulfillPurchase } from '../server/commerce.js';
import { createEventRepository, listResponses, deleteResponse } from '../server/events.js';
import { createPublicRepository, query } from '../server/publicRepository.js';
import { scriptedDatabase, step, hasEq } from './support/database.js';

const id = '223ecb9d-6e31-4e2e-bb6e-5ce70c74e5ef';
const purchase = { id, owner_id: 'owner-a', request_id: id, item_kind: 'offering', item_id: '5', item_title: 'Book', buyer_name: 'Visitor', buyer_email: 'visitor@example.test', amount: 4900, currency: 'INR', status: 'paid', delivery_url: 'https://example.test/access', razorpay_order_id: 'order_test', razorpay_payment_id: 'pay_test', fulfillment_status: 'fulfilled', admin_note: 'Saved note' };
function envFixture(values, fn) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) { if (value === null) delete process.env[key]; else process.env[key] = value; }
  return Promise.resolve().then(fn).finally(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
}

test('public repositories resolve published owners and hash rate-limit keys', async () => {
  const db = scriptedDatabase({ table: 'users', data: [{ id: 'owner-a', slug: 'alice' }] }, { table: 'profiles', data: [{ id: 1 }] }, { table: 'rpc:claim_public_action', data: true });
  const repo = createPublicRepository(() => db);
  assert.equal((await repo.owner('alice')).id, 'owner-a');
  assert.ok(hasEq(db.calls[0], 'slug', 'alice'));
  assert.ok(hasEq(db.calls[1], 'owner_id', 'owner-a')); assert.ok(hasEq(db.calls[1], 'status', 'published'));
  await envFixture({ SESSION_SECRET: 'test-only-rate-key' }, () => repo.claim('owner-a', 'rsvp', '192.0.2.1'));
  const params = step(db.calls[2], 'rpc')[0];
  assert.equal(params.p_owner, 'owner-a'); assert.equal(params.p_limit, 20); assert.match(params.p_ip_hash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(params), /192\.0\.2\.1|test-only/);
  await envFixture({ SESSION_SECRET: null, SUPABASE_SERVICE_KEY: null }, () => assert.rejects(repo.claim('owner-a', 'checkout', ''), e => e.status === 503));
});

test('missing owners and unpublished profiles cannot be used for submissions', async () => {
  assert.equal(await createPublicRepository(() => scriptedDatabase({ table: 'users', data: [] })).owner('missing'), null);
  const db = scriptedDatabase({ table: 'users', data: [{ id: 'owner-a' }] }, { table: 'profiles', data: [] });
  assert.equal(await createPublicRepository(() => db).owner('alice'), null);
});

test('repository errors produce actionable status codes without database details', async () => {
  for (const code of ['42P01', '42703', 'PGRST205', 'PGRST202']) await assert.rejects(query({ error: { code, message: 'private database details' } }), e => e.status === 503 && !e.message.includes('private'));
  for (const [message, status] of [['Too many requests.', 429], ['This event is no longer accepting responses.', 403], ['A response already exists.', 409]]) await assert.rejects(query({ error: { code: 'P0001', message } }), e => e.status === status);
  await assert.rejects(query({ error: { code: '23505', message: 'private database details' } }), e => e.status === 500 && e.code === '23505' && !e.message.includes('private'));
});

test('event reads and writes carry the correct owner and event into SQL operations', async () => {
  const db = scriptedDatabase({ table: 'updates', data: [{ id: 7 }] }, { table: 'rpc:event_rsvp_summary', data: { going: 2 } }, { table: 'rpc:save_event_response', data: { id: 9 } });
  const repo = createEventRepository(() => db);
  assert.equal((await repo.event('owner-a', 7)).id, 7);
  assert.ok(hasEq(db.calls[0], 'owner_id', 'owner-a')); assert.ok(hasEq(db.calls[0], 'id', 7));
  assert.equal((await repo.summary('owner-a', 7)).going, 2);
  await repo.save('owner-a', 7, { response: 'going' }, 'hash');
  assert.deepEqual(step(db.calls[2], 'rpc')[0], { p_owner: 'owner-a', p_event: 7, p_value: { response: 'going' }, p_token_hash: 'hash' });
});

test('admin event responses paginate beyond 500 and exclude private edit tokens', async () => {
  const db = scriptedDatabase({ table: 'updates', data: [{ id: 7, kind: 'event' }] }, { table: 'event_responses', data: Array.from({ length: 500 }, (_, id) => ({ id })) }, { table: 'event_responses', data: [{ id: 501 }] });
  assert.equal((await listResponses(db, { eventId: 7 })).length, 501);
  assert.deepEqual(step(db.calls[1], 'range'), [0, 499]); assert.deepEqual(step(db.calls[2], 'range'), [500, 999]);
  assert.doesNotMatch(step(db.calls[1], 'select')[0], /edit_token_hash/);
  await assert.rejects(listResponses(db, { eventId: -1 }), e => e.status === 400);
  await assert.rejects(listResponses(scriptedDatabase({ table: 'updates', data: [{ id: 8, kind: 'schedule' }] }), { eventId: 8 }), e => e.status === 404);
  const deletion = scriptedDatabase({ table: 'event_responses' });
  await deleteResponse(deletion, { eventId: 7, id: 9 });
  assert.ok(hasEq(deletion.calls[0], 'event_id', 7)); assert.ok(hasEq(deletion.calls[0], 'id', 9));
});

test('product checkout reads the correct owner’s published profile and private catalog', async () => {
  const db = scriptedDatabase({ table: 'profiles', data: [{ visibility: {} }] }, { table: 'site_settings', data: [{ portfolio: { products: [{ id: 'book', title: 'Book', pricing: 'paid', amount: 49, deliveryUrl: 'https://example.test/private' }] } }] });
  const item = await createCommerceRepository(() => db).item('owner-a', { kind: 'product', id: 'book' });
  assert.equal(item.amount, 49); assert.equal(item.deliveryUrl, 'https://example.test/private');
  assert.ok(db.calls.every(call => hasEq(call, 'owner_id', 'owner-a')));
  assert.equal(await createCommerceRepository(() => scriptedDatabase({ table: 'profiles', data: [] })).item('owner-a', { kind: 'product', id: 'book' }), null);
});

test('offering checkout requires active, visible, enabled categories belonging to the owner', async () => {
  const data = [
    { table: 'profiles', data: [{ visibility: { contributions: true } }] },
    { table: 'site_settings', data: [{ page: {} }] },
    { table: 'offerings', data: [{ id: 5, contribution_id: 2, title: 'Guide', pricing: 'free', delivery_url: 'https://example.test/access' }] },
    { table: 'contributions', data: [{ category: 'Books' }] },
  ];
  const db = scriptedDatabase(...data);
  assert.equal((await createCommerceRepository(() => db).item('owner-a', { kind: 'offering', id: '5' })).pricing, 'free');
  assert.ok(hasEq(db.calls[2], 'active', true)); assert.ok(hasEq(db.calls[3], 'visible', true)); assert.ok(hasEq(db.calls[3], 'enabled', true));
  const hidden = scriptedDatabase(...data.map(row => row.table === 'site_settings' ? { ...row, data: [{ page: { placement: { Books: 'hidden' } } }] } : row));
  assert.equal(await createCommerceRepository(() => hidden).item('owner-a', { kind: 'offering', id: '5' }), null);
  const disabled = scriptedDatabase(...data.map(row => row.table === 'contributions' ? { ...row, data: [] } : row));
  assert.equal(await createCommerceRepository(() => disabled).item('owner-a', { kind: 'offering', id: '5' }), null);
});

test('payment settings use one shared account and encrypt order credentials with owner binding', async () => {
  await envFixture({ RAZORPAY_KEY_ID: 'rzp_test_fixture', RAZORPAY_KEY_SECRET: 'fixture-secret', RAZORPAY_WEBHOOK_SECRET: 'fixture-webhook', PAYMENT_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString('base64') }, async () => {
    const db = scriptedDatabase({ table: 'payment_accounts', data: [{ enabled: false }] }, { table: 'payment_accounts', data: [{ enabled: true }] });
    const repo = createCommerceRepository(() => db), account = await repo.account('owner-a');
    assert.equal(account.enabled, false); assert.equal(account.keyId, 'rzp_test_fixture');
    const cipher = repo.sealAccount(account, 'owner-a', id);
    assert.doesNotMatch(cipher, /fixture-secret/);
    assert.equal((await repo.purchaseAccount({ owner_id: 'owner-a', id, payment_credentials: cipher })).keySecret, 'fixture-secret');
    await assert.rejects(repo.purchaseAccount({ owner_id: 'owner-b', id, payment_credentials: cipher }), /could not be read/);
    const settings = await paymentSettings(db);
    assert.equal(settings.mode, 'shared'); assert.equal(settings.configured, true); assert.equal(settings.testMode, true);
    assert.doesNotMatch(JSON.stringify(settings), /fixture-secret|fixture-webhook/);
  });
  await envFixture({ RAZORPAY_KEY_ID: null, RAZORPAY_KEY_SECRET: null, PAYMENT_ENCRYPTION_KEY: null, RAZORPAY_WEBHOOK_SECRET: null }, async () => {
    const db = scriptedDatabase({ table: 'payment_accounts', data: [] }, { table: 'payment_accounts', data: [] });
    assert.equal((await paymentSettings(db)).configured, false);
    await assert.rejects(savePaymentSettings(db, { enabled: true }), e => e.status === 503);
  });
});

test('owners can disable paid checkout without supplying merchant credentials', async () => {
  const db = scriptedDatabase({ table: 'payment_accounts', data: [{ enabled: true }] }, { table: 'payment_accounts' }, { table: 'payment_accounts', data: [{ enabled: false }] });
  assert.equal((await savePaymentSettings(db, { enabled: false })).enabled, false);
  assert.equal(step(db.calls[1], 'update')[0].enabled, false);
});

test('purchase persistence binds lookups and state transitions to the owner', async () => {
  const db = scriptedDatabase(...Array.from({ length: 7 }, () => ({ table: 'purchases', data: [purchase] })), { table: 'rpc:complete_purchase', data: purchase }, { table: 'rpc:record_purchase_refund', data: purchase });
  const repo = createCommerceRepository(() => db);
  await repo.byRequest('owner-a', id); await repo.byOrder('owner-a', 'order_test'); await repo.byPayment('owner-a', 'pay_test');
  assert.ok(db.calls.every(call => hasEq(call, 'owner_id', 'owner-a')));
  await repo.webhookOrder('order_test'); await repo.webhookPayment('pay_test'); await repo.insert(purchase); await repo.attach('owner-a', id, 'order_test');
  await repo.complete({ ownerId: 'owner-a', purchaseId: id, orderId: 'order_test', paymentId: 'pay_test', amount: 4900, currency: 'INR' });
  await repo.refund('owner-a', id, 1000);
  assert.equal(step(db.calls[7], 'rpc')[0].p_owner, 'owner-a'); assert.equal(step(db.calls[8], 'rpc')[0].p_amount, 1000);
});

test('admin purchases include count, filtered pagination and totals, excluding secret columns', async () => {
  const db = scriptedDatabase({ table: 'purchases', data: [purchase], count: 51 }, { table: 'rpc:purchase_summary', data: { total: 51, paid: 50, revenue: [{ currency: 'INR', amount: 245000 }] } });
  const result = await listPurchases(db, { page: 2, status: 'paid' });
  assert.equal(result.total, 51); assert.equal(result.rows[0].buyer.email, 'visitor@example.test'); assert.equal(result.rows[0].orderId, 'order_test');
  assert.deepEqual(step(db.calls[0], 'range'), [50, 99]); assert.ok(hasEq(db.calls[0], 'status', 'paid'));
  assert.doesNotMatch(step(db.calls[0], 'select')[0], /payment_credentials|receipt_token_hash/);
  const update = scriptedDatabase({ table: 'purchases', data: [{ id, status: 'paid' }] }, { table: 'purchases' });
  await fulfillPurchase(update, { id, fulfilled: true, note: '  Delivered  ' });
  assert.equal(step(update.calls[1], 'update')[0].admin_note, 'Delivered');
  await assert.rejects(fulfillPurchase(update, { id: 'bad' }), e => e.status === 400);
  await assert.rejects(fulfillPurchase(scriptedDatabase({ table: 'purchases', data: [] }), { id }), e => e.status === 404);
  await assert.rejects(fulfillPurchase(scriptedDatabase({ table: 'purchases', data: [{ id, status: 'pending' }] }), { id }), e => e.status === 409);
});
