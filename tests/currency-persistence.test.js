import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStudioPlan, studioModelContext } from '../server/studioPlan.js';
import { normalizePage } from '../shared/pageSettings.js';
import { normalizePortfolio } from '../shared/portfolio.js';
import { savePage } from '../server/site.js';
import { scriptedDatabase, step } from './support/database.js';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

const state = () => ({ settings: { version: 'v1', page: normalizePage({ currency: 'EUR' }), portfolio: normalizePortfolio() }, contributions: [{ id: 1, category: 'Books' }], assets: [], offerings: [] });
test('saved currency codes normalize consistently for selectors and public prices', () => {
  assert.equal(normalizePage({ currency: ' inr ' }).currency, 'INR');
  assert.equal(normalizePage({ currency: 'usd' }).currency, 'USD');
});
test('assistant-created items inherit the account currency through a save and reload', () => {
  for (const entity of ['products', 'offerings']) {
    const snapshot = state();
    const values = entity === 'products' ? { title: 'Book', pricing: 'paid', amount: 20, deliveryKind: 'service' } : { title: 'Book', contributionId: 1, pricing: 'paid', price: 20, deliveryKind: 'service' };
    const plan = makeStudioPlan({ actions: [{ entity, action: 'create', values }] }, snapshot, { id: 'owner' });
    const saved = entity === 'products' ? plan.steps[0].args.portfolio.products[0] : plan.steps[0].args;
    assert.equal(saved.currency, 'EUR');
    assert.ok(plan.expected.some(item => item.root === 'settings'), 'A changed Store default must invalidate this pending review');
    assert.equal(studioModelContext(snapshot, [entity], { id: 'owner' })[entity].defaultCurrency, 'EUR');
  }
});
test('actual currency migration updates all owned items, preserves prices and receipts, and rolls back stale saves', async () => {
  const db = new PGlite();
  const owner = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec('create role anon; create role authenticated; create role service_role; create table site_settings(owner_id uuid primary key,page jsonb,portfolio jsonb,updated_at timestamptz); create table offerings(id bigint primary key,owner_id uuid,currency text,price numeric,updated_at timestamptz); create table purchases(owner_id uuid,currency text,amount numeric);');
    const sql = await readFile(new URL('../supabase/store-currency.sql', import.meta.url), 'utf8'); await db.exec(sql); await db.exec(sql);
    for (const uid of [owner, other]) {
      await db.query('insert into site_settings values($1,$2,$3,$4)', [uid, { currency: 'USD', theme: { radius: 32 } }, { products: [{ id: 'book', title: 'Book', amount: 20, currency: 'USD', quantity: 3 }], bio: 'Keep my introduction' }, '2026-11-14T00:00:00Z']);
      await db.query('insert into offerings values($1,$2,$3,$4,now())', [uid === owner ? 1 : 2, uid, 'USD', 50]);
      await db.query('insert into purchases values($1,$2,$3)', [uid, 'USD', 2000]);
    }
    const apply = () => db.query('select save_store_currency($1,$2,$3)', [owner, 'INR', '2026-11-14T00:00:00Z']);
    await apply();
    const saved = (await db.query('select * from site_settings where owner_id=$1', [owner])).rows[0];
    assert.equal(saved.page.currency, 'INR'); assert.equal(saved.page.theme.radius, 32);
    assert.equal(saved.portfolio.products[0].currency, 'INR'); assert.equal(saved.portfolio.products[0].amount, 20); assert.equal(saved.portfolio.products[0].quantity, 3);
    assert.equal(saved.portfolio.bio, 'Keep my introduction');
    const offers = (await db.query('select * from offerings order by id')).rows;
    assert.equal(offers[0].currency, 'INR'); assert.equal(Number(offers[0].price), 50); assert.equal(offers[1].currency, 'USD');
    assert.equal((await db.query('select page from site_settings where owner_id=$1', [other])).rows[0].page.currency, 'USD');
    assert.ok((await db.query('select currency from purchases')).rows.every(row => row.currency === 'USD'));
    await assert.rejects(apply(), /changed/);
    assert.equal((await db.query('select currency from offerings where id=1')).rows[0].currency, 'INR');
    const denied = await db.query("select has_function_privilege('anon','public.save_store_currency(uuid,text,timestamptz)','execute') as allowed");
    assert.equal(denied.rows[0].allowed, false);
    const fresh = '33333333-3333-4333-8333-333333333333';
    await db.query('insert into offerings values(3,$1,$2,10,now())', [fresh, 'USD']);
    await db.query('select save_store_currency($1,$2,null)', [fresh, 'INR']);
    assert.equal((await db.query('select page from site_settings where owner_id=$1', [fresh])).rows[0].page.currency, 'INR');
    assert.equal((await db.query('select currency from offerings where owner_id=$1', [fresh])).rows[0].currency, 'INR');
  } finally { await db.close(); }
});
test('applying INR to saved USD items uses one atomic owner-scoped save', async () => {
  const current = { id: 1, updated_at: 'v1', page: { currency: 'USD' }, portfolio: { products: [{ id: 'book', title: 'Book', pricing: 'paid', amount: 50, currency: 'USD' }] } };
  const db = scriptedDatabase({ table: 'site_settings', data: [current] }, { table: 'rpc:save_store_currency', data: null }, { table: 'site_settings', data: [{ ...current, page: { currency: 'INR' }, portfolio: { products: [{ ...current.portfolio.products[0], currency: 'INR' }] } }] });
  db.uid = 'owner';
  const saved = await savePage(db, { page: { currency: 'INR' }, expectedVersion: 'v1', applyItemCurrency: true });
  const call = db.calls.find(call => call.table === 'rpc:save_store_currency');
  assert.ok(call, 'Must atomically persist currencies, rather than just displaying a new fallback');
  const params = step(call, 'rpc')[0];
  assert.equal(params.p_owner, 'owner'); assert.equal(params.p_currency, 'INR');
  assert.equal(saved.portfolio.products[0].currency, 'INR');
});
