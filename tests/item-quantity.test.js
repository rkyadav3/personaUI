import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { normalizeQuantity } from '../shared/commerce.js';
import { normalizePortfolio } from '../shared/portfolio.js';
import { saveOffering } from '../server/profile.js';
import { scriptedDatabase, step } from './support/database.js';
import { createRazorpayGateway } from '../server/razorpay.js';

test('optional quantity accepts unlimited and zero, rejecting invalid inventory', () => {
  for (const value of [undefined, null, '', '  ']) assert.equal(normalizeQuantity(value), null);
  assert.equal(normalizeQuantity('0'), 0);
  assert.equal(normalizeQuantity('12'), 12);
  for (const value of [-1, 1.5, '1.5', false, [], {}, Infinity, 1000000001]) assert.throws(() => normalizeQuantity(value), /Quantity/);
  assert.equal(normalizePortfolio({ products: [{ title: 'Book', quantity: '3' }] }).products[0].quantity, 3);
  assert.equal(normalizePortfolio({ products: [{ title: 'Book' }] }).products[0].quantity, null);
});

test('offering saves persist quantity, preserve omitted stock and clear explicit blanks', async () => {
  for (const quantity of [3, 0, '', undefined]) {
    const db = scriptedDatabase({ table: 'contributions', data: [{ id: 1, category: 'Books' }] }, { table: 'offerings', data: [{ id: 5 }] });
    await saveOffering(db, { title: 'Book', contributionId: 1, pricing: 'free', ...(quantity !== undefined ? { quantity } : {}) });
    const saved = step(db.calls.find(call => call.table === 'offerings'), 'insert')[0];
    if (quantity === undefined) assert.equal(Object.hasOwn(saved, 'quantity'), false);
    else assert.equal(saved.quantity, quantity === '' ? null : quantity);
  }
  const stale = scriptedDatabase({ table: 'contributions', data: [{ id: 1, category: 'Books' }] }, { table: 'offerings', data: [] });
  await assert.rejects(saveOffering(stale, { id: 5, title: 'Book', contributionId: 1, pricing: 'free', quantity: 5, expectedItemVersion: 'old' }), /changed in another editor/);
});

test('gateway distinguishes explicit order rejection from uncertain network and server failures', async () => {
  const account = { keyId: 'test-key', keySecret: 'test-secret' };
  for (const status of [400, 401, 500]) {
    const gateway = createRazorpayGateway(async () => new Response('{}', { status }));
    await assert.rejects(gateway.createOrder(account, {}), error => (error.orderNotCreated === true) === (status < 500));
  }
  const unreachable = createRazorpayGateway(async () => { throw new Error('Network timeout'); });
  await assert.rejects(unreachable.createOrder(account, {}), error => error.orderNotCreated !== true);
});

test('actual purchase trigger reserves stock atomically, preserves tenant boundaries and restores setup failures', async () => {
  const db = new PGlite();
  const owner = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table offerings(id bigint primary key,owner_id uuid not null,updated_at timestamptz default now());
      create table site_settings(owner_id uuid primary key,portfolio jsonb,updated_at timestamptz default now());
      create table purchases(id integer primary key,owner_id uuid not null,request_id integer not null,item_kind text,item_id text,status text,razorpay_order_id text,unique(owner_id,request_id));
    `);
    const migration = await readFile(new URL('../supabase/item-quantity.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration); // Re-running must not reset stock or break triggers.
    await db.exec(`
      insert into offerings(id,owner_id,quantity) values(1,'${owner}',1),(2,'${other}',5),(3,'${owner}',null);
      insert into site_settings(owner_id,portfolio) values('${owner}','{"products":[{"id":"book","title":"Book","quantity":1},{"id":"unlimited","title":"Unlimited"}]}');
    `);
    const buy = (id, kind = 'offering', item = '1', who = owner, status = 'pending') => db.exec(`insert into purchases(id,owner_id,request_id,item_kind,item_id,status) values(${id},'${who}',${id},'${kind}','${item}','${status}');`);
    const stock = async id => (await db.query(`select quantity from offerings where id=${id}`)).rows[0].quantity;
    const requests = await Promise.allSettled([buy(1), buy(2)]);
    assert.equal(requests.filter(result => result.status === 'fulfilled').length, 1, 'Only one checkout gets the last unit.');
    assert.match(requests.find(result => result.status === 'rejected').reason.message, /sold out/);
    assert.equal(await stock(1), 0);
    await assert.rejects(buy(3, 'offering', '2'), /not available in this account/);
    assert.equal(await stock(2), 5, 'Foreign stock cannot be touched.');
    await assert.rejects(buy(1), /duplicate key/);
    assert.equal(await stock(1), 0, 'Duplicate receipt does not deduct again.');
    await db.exec("update purchases set status='failed' where id=1;");
    assert.equal(await stock(1), 1, 'Failed order setup returns stock.');
    await db.exec("update purchases set status='failed' where id=1;");
    assert.equal(await stock(1), 1, 'Repeated failure does not return stock twice.');
    await buy(4);
    await db.exec("update purchases set razorpay_order_id='order_live' where id=4; update purchases set status='failed' where id=4;");
    assert.equal(await stock(1), 0, 'An existing payment order retains its reservation for retry.');
    await db.exec("update purchases set status='paid' where id=4;");
    assert.equal(await stock(1), 0, 'Payment completion does not deduct again.');
    await buy(5, 'offering', '3', owner, 'free'); await buy(6, 'offering', '3', owner, 'free');
    assert.equal(await stock(3), null, 'Unlimited offers stay unlimited.');
    await buy(7, 'product', 'book', owner, 'free');
    await assert.rejects(buy(8, 'product', 'book'), /sold out/);
    await assert.rejects(buy(9, 'product', 'book', other), /not available in this account/);
    const document = (await db.query(`select portfolio from site_settings where owner_id='${owner}'`)).rows[0].portfolio;
    assert.equal(document.products[0].quantity, 0);
    assert.equal(document.products[0].title, 'Book', 'Stock updates retain other product fields.');
    await buy(10, 'product', 'unlimited');
    await assert.rejects(db.exec(`update purchases set owner_id='${other}' where id=7;`), /ownership cannot be changed/);
    await assert.rejects(db.exec("update purchases set item_id='unlimited' where id=7;"), /purchase item cannot be changed/);
  } finally { await db.close(); }
});
