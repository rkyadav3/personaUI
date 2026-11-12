import test from 'node:test';
import assert from 'node:assert/strict';
import { publicUser } from '../server/auth.js';
import { createAdminHandler } from '../api/admin.js';
import { createSuggestionService } from '../server/governance.js';
import { scriptedDatabase, step } from './support/database.js';
import { buildHomeFeed } from '../server/home.js';
import { publicProfile } from '../server/profile.js';
import { createPublicRepository } from '../server/publicRepository.js';
import { createPlatformService, buildSalesReport } from '../server/platform.js';
import { normalizeHomeSettings, HOME_DEFAULTS } from '../shared/homeSettings.js';
const response = () => ({ setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } });

test('legacy platform owner profiles do not appear publicly or expose their knowledge', async () => {
  const previous = process.env.SUPERADMIN_EMAILS;
  try {
    process.env.SUPERADMIN_EMAILS = 'owner@example.test';
    const owner = { id: 'owner', email: 'owner@example.test', slug: 'owner', tags: [] };
    assert.equal(buildHomeFeed({ profiles: [{ owner_id: 'owner', name: 'Owner', status: 'published' }], users: [owner] }).members.length, 0);
    const db = scriptedDatabase({ table: 'users', data: [owner] });
    assert.equal(await publicProfile('owner', null, db), null);
    assert.equal(db.calls.length, 1);
    const repository = createPublicRepository(() => scriptedDatabase({ table: 'users', data: [owner] }));
    assert.equal(await repository.accountOwner('owner'), null);
  } finally { if (previous === undefined) delete process.env.SUPERADMIN_EMAILS; else process.env.SUPERADMIN_EMAILS = previous; }
});

test('checkout support validates the admin and saves settings inside that admin’s tenant', async () => {
  const owner = { isSuperAdmin: true };
  const calls = [], db = scriptedDatabase({ table: 'users', data: [{ id: 'admin', email: 'admin@example.test' }] });
  const service = createPlatformService({ database: () => db, tenant: id => ({ ownerId: id }), saveCheckout: async (tenant, input) => { calls.push({ tenant, input }); return { enabled: input.enabled }; } });
  assert.deepEqual(await service.setCheckout(owner, { id: 'admin', enabled: false }), { enabled: false });
  assert.deepEqual(calls, [{ tenant: { ownerId: 'admin' }, input: { enabled: false } }]);
  await assert.rejects(service.setCheckout({ isAdmin: true }, { id: 'admin', enabled: false }), e => e.status === 403);
  for (const input of [{}, { id: 'admin', enabled: 'yes' }, { id: 12, enabled: true }]) await assert.rejects(service.setCheckout(owner, input), e => e.status === 400);
  await assert.rejects(createPlatformService({ database: () => scriptedDatabase({ table: 'users', data: [] }) }).setCheckout(owner, { id: 'missing', enabled: true }), e => e.status === 404);
});

test('sales pagination reads beyond the first 1000 records and retains deleted seller earnings', async () => {
  const sale = { owner_id: 'former', seller_name: 'Former seller', seller_email: 'former@example.test', item_kind: 'product', item_id: 'book', currency: 'INR', amount: 100, status: 'paid' };
  const db = scriptedDatabase({ table: 'platform_sales', data: Array.from({ length: 1000 }, (_, i) => ({ ...sale, id: String(i) })) }, { table: 'users', data: [] }, { table: 'payment_accounts', data: [] }, { table: 'platform_sales', data: [{ ...sale, id: '1000' }] });
  const result = await createPlatformService({ database: () => db }).sales({ isSuperAdmin: true });
  assert.equal(result.counts.paidSales, 1001); assert.equal(result.currencies[0].gross, 100100);
  assert.equal(result.admins[0].accountExists, false); assert.equal(result.admins[0].name, 'Former seller'); assert.equal(result.recent.length, 50);
  assert.deepEqual(step(db.calls[3], 'range'), [1000, 1999]);
});

test('invalid financial records fail explicitly and totals never overflow safe integers', () => {
  const base = { owner_id: 'a', amount: 100, refunded_amount: 0, currency: 'INR', status: 'paid' };
  for (const change of [{ amount: -1 }, { amount: 1.5 }, { refunded_amount: 200 }, { refunded_amount: -1 }, { currency: 'invalid' }]) assert.throws(() => buildSalesReport({ sales: [{ ...base, ...change }] }), e => e.status === 503);
  assert.throws(() => buildSalesReport({ sales: [{ ...base, amount: Number.MAX_SAFE_INTEGER }, base] }), e => e.status === 503);
  assert.equal(buildSalesReport({ sales: [{ ...base, status: 'unknown' }] }).counts.paidSales, 0);
  assert.equal(buildSalesReport().admins.length, 0);
});

test('homepage settings reject unsafe colors and unknown values while preserving explicit toggles', async () => {
  assert.deepEqual(normalizeHomeSettings(null), HOME_DEFAULTS);
  assert.deepEqual(normalizeHomeSettings([]), HOME_DEFAULTS);
  const settings = normalizeHomeSettings({ accent: 'url(secret)', background: '#123ABC', defaultSort: 'invalid', siteName: 'x'.repeat(100), showFeatured: false, showProducts: 'false', unknown: 'discard' });
  assert.equal(settings.accent, HOME_DEFAULTS.accent); assert.equal(settings.background, '#123ABC'); assert.equal(settings.defaultSort, 'rated'); assert.equal(settings.siteName.length, 80); assert.equal(settings.showFeatured, false); assert.equal(settings.showProducts, true); assert.equal(settings.unknown, undefined);
  const service = createPlatformService({ database: () => scriptedDatabase({ table: 'platform_settings', data: [] }) });
  assert.deepEqual(await service.home(), HOME_DEFAULTS);
  for (const input of [null, [], 'invalid']) await assert.rejects(service.saveHome({ isSuperAdmin: true }, input), e => e.status === 400);
});

test('the platform owner has no personal admin role and ordinary accounts are profile admins', () => {
  const previous = process.env.SUPERADMIN_EMAILS;
  try {
    process.env.SUPERADMIN_EMAILS = 'owner@example.test';
    const owner = publicUser({ id: 'owner', email: 'owner@example.test' });
    assert.equal(owner.isSuperAdmin, true); assert.equal(owner.isAdmin, false); assert.equal(owner.role, 'superadmin');
    const admin = publicUser({ id: 'admin', email: 'ordinary@example.test' });
    assert.equal(admin.isAdmin, true); assert.equal(admin.role, 'admin');
  } finally { if (previous === undefined) delete process.env.SUPERADMIN_EMAILS; else process.env.SUPERADMIN_EMAILS = previous; }
});

test('SuperAdmins cannot call personal Studio operations or send suggestions', async () => {
  const owner = { id: 'owner', isSuperAdmin: true, isAdmin: false };
  const handler = createAdminHandler({ sessionUser: async () => owner, scoped: () => { throw new Error('Personal scope must never be created'); }, operations: { overview: () => { throw new Error('Must not run'); } } });
  const res = response(); await handler({ method: 'POST', body: { op: 'overview' } }, res); assert.equal(res.code, 403);
  await assert.rejects(createSuggestionService(() => scriptedDatabase()).create(owner, { kind: 'add', title: 'Idea', body: 'Description' }), e => e.status === 403);
});

test('sales summaries separate currencies and include refunds without counting failed or pending earnings', async () => {
  const { buildSalesReport } = await import('../server/platform.js');
  const report = buildSalesReport({ users: [{ id: 'a', name: 'Maya', email: 'maya@example.test' }, { id: 'b', name: 'Dev', email: 'dev@example.test' }], sales: [
    { id: '1', owner_id: 'a', item_kind: 'product', item_id: 'book', item_title: 'Book', currency: 'INR', amount: 10000, refunded_amount: 2000, status: 'paid' },
    { id: '2', owner_id: 'a', item_kind: 'product', item_id: 'book', item_title: 'Book', currency: 'INR', amount: 5000, refunded_amount: 5000, status: 'refunded' },
    { id: '3', owner_id: 'b', item_kind: 'product', item_id: 'book', item_title: 'Other Book', currency: 'USD', amount: 1000, refunded_amount: 0, status: 'paid' },
    { id: '4', owner_id: 'a', item_kind: 'offering', item_id: 'free', item_title: 'Free guide', currency: 'INR', amount: 0, status: 'free' },
    { id: '5', owner_id: 'a', currency: 'INR', amount: 100000, status: 'pending' },
    { id: '6', owner_id: 'a', currency: 'INR', amount: 100000, status: 'failed' },
  ] });
  assert.equal(report.counts.paidSales, 3); assert.equal(report.counts.freeOrders, 1); assert.equal(report.counts.pending, 1);
  assert.deepEqual(report.currencies.find(row => row.currency === 'INR'), { currency: 'INR', gross: 15000, refunds: 7000, net: 8000, paidSales: 2 });
  assert.equal(report.currencies.find(row => row.currency === 'USD').net, 1000);
  assert.equal(report.admins.find(row => row.id === 'a').paidSales, 2);
  assert.equal(report.products.find(row => row.ownerId === 'a' && row.itemId === 'book').paidSales, 2);
});

test('financial support reads every ledger page without returning credentials or delivery links', async () => {
  const { createPlatformService } = await import('../server/platform.js');
  const db = scriptedDatabase({ table: 'platform_sales', data: [{ id: '1', owner_id: 'a', status: 'paid', amount: 100, currency: 'INR', refunded_amount: 0, payment_credentials: 'secret', delivery_url: 'private' }] }, { table: 'users', data: [{ id: 'a', name: 'Maya' }] }, { table: 'payment_accounts', data: [] });
  const result = await createPlatformService({ database: () => db }).sales({ isSuperAdmin: true });
  const select = step(db.calls.find(call => call.table === 'platform_sales'), 'select')[0];
  assert.doesNotMatch(select, /payment_credentials|delivery_url|receipt_token/);
  assert.doesNotMatch(JSON.stringify(result), /secret|private/);
  assert.equal(result.currencies[0].net, 100);
  await assert.rejects(createPlatformService({ database: () => scriptedDatabase() }).sales({ isAdmin: true }), e => e.status === 403);
});

test('main site settings use normalized text and only the SuperAdmin can save them', async () => {
  const { createPlatformService } = await import('../server/platform.js');
  const db = scriptedDatabase({ table: 'platform_settings', data: [{ value: { siteName: 'Community', headline: 'Find people', showProducts: false } }] }, { table: 'platform_settings', data: [{ value: { siteName: 'New name' } }] });
  const service = createPlatformService({ database: () => db });
  assert.equal((await service.home()).siteName, 'Community');
  await assert.rejects(service.saveHome({ isAdmin: true }, { siteName: 'Spoofed' }), e => e.status === 403);
  await service.saveHome({ isSuperAdmin: true }, { siteName: ' New name ', headline: 'Discover creators', showProducts: false });
  const [row] = step(db.calls[1], 'upsert'); assert.equal(row.key, 'home'); assert.equal(row.value.siteName, 'New name'); assert.equal(row.value.showProducts, false);
});
