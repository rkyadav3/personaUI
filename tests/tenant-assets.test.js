import test from 'node:test';
import assert from 'node:assert/strict';
import { scoped } from '../server/tenant.js';
import { scriptedDatabase, step, hasEq } from './support/database.js';
import { signAsset, registerAsset, getAsset } from '../server/assets.js';
import { publishedPassages } from '../server/knowledgeBoundary.js';
import { createPaymentService } from '../server/paymentService.js';
import { hashToken } from '../server/paymentCrypto.js';
import { createBuyerAccess, createBuyerIdentity } from '../server/buyerAccess.js';
import { raw } from '../server/supabase.js';
import { normalizeBuyer } from '../shared/commerce.js';
import { saveOffering } from '../server/profile.js';
import { saveItem } from '../server/catalogue.js';
import { createMediaHandler } from '../api/media.js';
import { normalizePortfolio, publicPortfolio } from '../shared/portfolio.js';

const id = '11111111-1111-4111-8111-111111111111';
const asset = { id, owner_id: 'alice', storage_path: `alice/${id}.pdf`, status: 'ready', purpose: 'delivery', mime: 'application/pdf', size: 100, name: 'Book.pdf' };
const dbFor = (...responses) => { const db = scriptedDatabase(...responses); db.uid = 'alice'; return db; };

test('tenant scope stamps writes, filters reads and cannot call unknown tables or RPCs', async () => {
  const raw = scriptedDatabase({ table: 'assets' }, { table: 'files' }, { table: 'rpc:hybrid_search' }, { table: 'rpc:set_embeddings' });
  const db = scoped('alice', () => raw);
  await db.from('assets').insert({ owner_id: 'bob', name: 'Book' });
  await db.from('files').select('*');
  await db.rpc('hybrid_search', { p_owner: 'bob' });
  assert.equal(step(raw.calls[0], 'insert')[0].owner_id, 'alice');
  assert.ok(hasEq(raw.calls[1], 'owner_id', 'alice'));
  assert.equal(step(raw.calls[2], 'rpc')[0].p_owner, 'alice');
  await db.rpc('set_embeddings', { p_owner: 'bob', items: [{ id: 1, embedding: [0] }] });
  assert.equal(step(raw.calls[3], 'rpc')[0].p_owner, 'alice');
  for (const table of ['users', 'unknown', 'payment_credentials']) assert.throws(() => db.from(table), /not available/);
  assert.throws(() => db.rpc('arbitrary_sql'), /not available/);
  assert.equal(raw.calls.length, 4);
});

test('signing uploads stores a generated tenant path and rejects executable types and oversized files', async () => {
  const db = dbFor({ table: 'assets' }); let path;
  const storage = { signUpload: async value => { path = value; return { data: { token: 'one-time' } }; } };
  const result = await signAsset(db, { name: 'Book.pdf', size: 100, purpose: 'delivery' }, storage);
  assert.match(path, /^alice\/[0-9a-f-]{36}\.pdf$/);
  assert.equal(result.path, path);
  assert.equal(step(db.calls[0], 'insert')[0].purpose, 'delivery');
  const empty = dbFor();
  for (const input of [{ name: 'file.html' }, { name: 'file.svg' }, { name: '../file.pdf' }, { size: 52428801 }, { purpose: 'knowledge' }]) await assert.rejects(signAsset(empty, { name: 'Book.pdf', size: 100, purpose: 'delivery', ...input }, storage));
  assert.equal(empty.calls.length, 0);
});

test('registration verifies actual stored size and MIME; no content is indexed', async () => {
  const db = dbFor({ table: 'assets', data: [asset] }, { table: 'assets' });
  const result = await registerAsset(db, { id }, { info: async path => { assert.equal(path, asset.storage_path); return { data: { size: 100, content_type: 'application/pdf' } }; } });
  assert.equal(result.id, id); assert.deepEqual(db.calls.map(row => row.table), ['assets', 'assets']);
  for (const data of [{ size: 101, content_type: 'application/pdf' }, { size: 100, content_type: 'text/html' }]) {
    const failed = dbFor({ table: 'assets', data: [asset] });
    await assert.rejects(registerAsset(failed, { id }, { info: async () => ({ data }) }), /does not match/);
    assert.equal(failed.calls.length, 1);
  }
});

test('foreign assets, wrong-purpose assets and traversal paths never reach storage', async () => {
  for (const row of [{ ...asset, owner_id: 'bob' }, { ...asset, storage_path: `alice/../bob/${id}.pdf` }, { ...asset, storage_path: `alice/${id}.pdf?query=x` }]) {
    let requests = 0;
    await assert.rejects(registerAsset(dbFor({ table: 'assets', data: [row] }), { id }, { info: async () => { requests++; } }), /not found/);
    assert.equal(requests, 0);
  }
  await assert.rejects(getAsset(dbFor({ table: 'assets', data: [{ ...asset, purpose: 'media' }] }), id, 'delivery'), /not ready/);
});

test('AI context uses fresh published owner chunks, excluding foreign, draft and store content', async () => {
  const candidates = [1, 2, 3, 4].map(id => ({ id, content: 'Untrusted RPC payload', similarity: 0.9 }));
  const db = dbFor(
    { table: 'chunks', data: [
      { id: 1, owner_id: 'alice', source_type: 'file', source_id: 10, source_name: 'Notes', content: 'Alice knowledge' },
      { id: 2, owner_id: 'bob', source_type: 'file', source_id: 20, content: 'Bob secrets' },
      { id: 3, owner_id: 'alice', source_type: 'post', source_id: 30, content: 'Draft secrets' },
      { id: 4, owner_id: 'alice', source_type: 'asset', source_id: id, content: 'Paid book' },
    ] },
    { table: 'files', data: [{ id: 10, owner_id: 'alice' }, { id: 20, owner_id: 'bob' }] },
    { table: 'posts', data: [] },
  );
  const result = await publishedPassages(db, candidates);
  assert.deepEqual(result.map(row => row.content), ['Alice knowledge']);
  assert.ok(db.calls.filter(row => ['files', 'posts'].includes(row.table)).every(row => hasEq(row, 'status', 'published')));
});

test('download access requires the owner-bound receipt, completed status and snapshotted asset', async () => {
  const token = Buffer.alloc(32, 2).toString('base64url');
  const row = { id, owner_id: 'alice', request_id: id, receipt_token_hash: hashToken(token), status: 'paid', delivery_asset_id: asset.id };
  let downloads = 0;
  const service = createPaymentService({ repo: { accountOwner: async slug => ({ id: slug }), byRequest: async owner => owner === 'alice' ? row : null, downloadAsset: async (owner, assetId) => { downloads++; assert.equal(owner, 'alice'); assert.equal(assetId, asset.id); return { url: 'https://storage.test/signed', expiresIn: 60 }; } } });
  const input = { slug: 'alice', requestId: id, receiptToken: token };
  assert.equal((await service.download(input)).expiresIn, 60);
  for (const status of ['pending', 'failed', 'refunded']) { row.status = status; await assert.rejects(service.download(input), /completed purchase/); }
  row.status = 'paid';
  await assert.rejects(service.download({ ...input, slug: 'bob' }), /not found/);
  await assert.rejects(service.download({ ...input, receiptToken: Buffer.alloc(32, 3).toString('base64url') }), /receipt/);
  assert.equal(downloads, 1);
  row.delivery_kind = 'service';
  await assert.rejects(service.download(input), /completed purchase/);
  assert.equal(downloads, 1);
});

test('real Supabase OTP sessions never replace the shared service-role credentials', async () => {
  const previous = { fetch: globalThis.fetch, url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY, anon: process.env.SUPABASE_ANON_KEY };
  const credentials = [];
  process.env.SUPABASE_URL = 'https://supabase-auth-isolation.test';
  process.env.SUPABASE_SERVICE_KEY = 'service-role';
  delete process.env.SUPABASE_ANON_KEY;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('/auth/v1/verify')) return new Response(JSON.stringify({ access_token: 'buyer-session', refresh_token: 'refresh', expires_in: 3600, token_type: 'bearer', user: { id, email: 'buyer@example.test' } }), { headers: { 'Content-Type': 'application/json' } });
    credentials.push(new Headers(options.headers).get('authorization'));
    return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    await raw().from('purchases').select('id');
    assert.equal(await createBuyerIdentity().verify({ email: 'buyer@example.test' }, '123456'), 'buyer-session');
    await raw().from('purchases').select('id');
    assert.deepEqual(credentials, ['Bearer service-role', 'Bearer service-role']);
    assert.equal((await raw().auth.getSession()).data.session, null);
  } finally {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of Object.entries({ SUPABASE_URL: previous.url, SUPABASE_SERVICE_KEY: previous.key, SUPABASE_ANON_KEY: previous.anon })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('service saves detach files and stale item versions preserve the stored item', async () => {
  const db = dbFor({ table: 'contributions', data: [{ id: 7, category: 'Books' }] }, { table: 'offerings', data: [{ id: 8 }] });
  await saveOffering(db, { id: 8, contributionId: 7, title: 'Service', pricing: 'free', deliveryKind: 'service', assetId: id, expectedItemVersion: 'version' });
  assert.equal(step(db.calls[1], 'update')[0].delivery_asset_id, null);
  assert.ok(hasEq(db.calls[1], 'updated_at', 'version'));
  const stale = dbFor({ table: 'contributions', data: [{ id: 7, category: 'Books' }] }, { table: 'offerings', data: [] });
  await assert.rejects(saveOffering(stale, { id: 8, contributionId: 7, title: 'Service', expectedItemVersion: 'old' }), /changed in another editor/);
  const product = normalizePortfolio({ products: [{ title: 'Service', assetId: id, deliveryKind: 'service' }] }).products[0];
  assert.equal(product.assetId, '');
});

test('catalogue rejects invalid item kinds and prices before database calls', async () => {
  const db = dbFor();
  for (const input of [{ kind: 'unknown' }, { kind: 'offering', pricing: 'paid', price: -1 }, { kind: 'product', pricing: 'paid', price: 'bad' }]) await assert.rejects(saveItem(db, input));
  assert.equal(db.calls.length, 0);
});

test('phone checkout and verified phone recovery use the same country-code identity', async () => {
  const buyer = { name: 'Buyer', email: 'buyer@example.test', phone: '+91 (98765) 43210' };
  const normalized = normalizeBuyer(buyer);
  assert.equal(normalized.ok, true); assert.equal(normalized.value.phone, '+919876543210');
  assert.equal(normalizeBuyer({ ...buyer, phone: '9876543210' }).ok, false);
  const db = dbFor({ table: 'purchases', data: [] });
  const service = createBuyerAccess({ database: () => db, identity: { user: async () => ({ phone: '919876543210', phone_confirmed_at: '2026-11-14' }) }, repo: { accountOwner: async () => ({ id: 'alice' }) } });
  await service.list({ slug: 'alice', contact: normalized.value.phone, accessToken: 'verified' });
  assert.ok(hasEq(db.calls[0], 'buyer_phone', normalized.value.phone));
  await assert.rejects(createBuyerIdentity(() => ({ auth: { signInWithOtp: async () => ({ error: { message: 'Provider unavailable' } }) } })).request({ phone: normalized.value.phone }), /unavailable/);
});

test('private media checks profile access before storage and survives owner slug changes', async () => {
  const res = () => ({ setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; }, redirect(code, url) { this.code = code; this.url = url; return this; } });
  let visible = false, signed = 0;
  const handler = createMediaHandler({ viewerFor: async () => null, repository: () => ({ accountOwner: async slug => { assert.equal(slug, 'new-slug'); return { id }; }, owner: async () => visible ? { id } : null }), database: () => scriptedDatabase({ table: 'users', data: [{ slug: 'new-slug' }] }), scope: owner => { assert.equal(owner, id); const db = scriptedDatabase({ table: 'assets', data: [{ ...asset, owner_id: id, storage_path: `${id}/${asset.id}.pdf`, purpose: 'media' }] }); db.uid = owner; return db; }, storage: () => ({ signDownload: async () => { signed++; return { data: { signedUrl: 'https://storage.test/signed' } }; } }) });
  const request = { method: 'GET', query: { owner: id, id: asset.id } };
  const denied = res(); await handler(request, denied); assert.equal(denied.code, 404); assert.equal(signed, 0);
  visible = true;
  const allowed = res(); await handler(request, allowed); assert.equal(allowed.code, 302); assert.equal(signed, 1);
});

test('owner can preview draft media but foreign-owner asset payloads cannot reach storage', async () => {
  const response = () => ({ setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; }, redirect(code) { this.code = code; return this; } });
  let signed = 0, foreign = false;
  const handler = createMediaHandler({ viewerFor: async () => ({ id: 'alice' }), repository: () => ({ accountOwner: async () => ({ id: 'alice' }), owner: () => { throw new Error('Owner preview should not require a public profile.'); } }), scope: () => dbFor({ table: 'assets', data: [{ ...asset, purpose: 'media', owner_id: foreign ? 'bob' : 'alice' }] }), storage: () => ({ signDownload: async () => { signed++; return { data: { signedUrl: 'https://storage.test/signed' } }; } }) });
  const request = { method: 'GET', query: { slug: 'alice', id } };
  const allowed = response(); await handler(request, allowed); assert.equal(allowed.code, 302);
  foreign = true;
  const denied = response(); await handler(request, denied); assert.equal(denied.code, 404); assert.equal(signed, 1);
});

test('verified purchase lookup scopes both owner and verified buyer contact without purchase IDs', async () => {
  const database = scriptedDatabase({ table: 'purchases', data: [], count: 0 });
  const identity = { user: async () => ({ email: 'buyer@example.test', email_confirmed_at: '2026-11-14' }) };
  const service = createBuyerAccess({ database: () => database, identity, repo: { accountOwner: async () => ({ id: 'alice' }) } });
  await service.list({ slug: 'alice', contact: 'buyer@example.test', accessToken: 'verified' });
  assert.ok(hasEq(database.calls[0], 'owner_id', 'alice'));
  assert.ok(hasEq(database.calls[0], 'buyer_email', 'buyer@example.test'));
  await assert.rejects(service.list({ slug: 'alice', contact: 'someone@example.test', accessToken: 'verified' }), /Verify/);
  assert.equal(database.calls.length, 1);
});

test('unverified email and phone identities reveal no purchase data', async () => {
  for (const user of [{ email: 'buyer@example.test' }, { phone: '919876543210' }]) {
    const db = scriptedDatabase();
    const service = createBuyerAccess({ database: () => db, identity: { user: async () => user }, repo: { accountOwner: async () => ({ id: 'alice' }) } });
    await assert.rejects(service.list({ slug: 'alice', contact: user.email || '+919876543210', accessToken: 'unverified' }), /Verify/);
    assert.equal(db.calls.length, 0);
  }
});

test('paragraphs survive saved catalogue descriptions; public data omits private asset references', () => {
  const text = 'First paragraph.\n\nSecond paragraph.';
  const data = normalizePortfolio({ products: [{ id: 'book', title: 'Book', summary: text, assetId: id }] });
  assert.equal(data.products[0].summary, text);
  const visible = publicPortfolio(data);
  assert.equal(visible.products[0].accessReady, true); assert.equal(visible.products[0].assetId, undefined);
});
