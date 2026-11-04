import test from 'node:test';
import assert from 'node:assert/strict';
import * as actions from '../src/lib/publicActions.js';
import { minorUnits, normalizeBuyer, formatAmount } from '../shared/commerce.js';

test('checkout capabilities are random, valid and reusable across browser reloads', () => {
  const store = new Map();
  const storage = { getItem: k => store.get(k), setItem: (k, v) => store.set(k, v) };
  const item = { kind: 'product', id: 'book' };
  const first = actions.newReceipt(), second = actions.newReceipt();
  assert.match(first.requestId, /^[0-9a-f-]{36}$/);
  assert.match(first.receiptToken, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first.receiptToken, second.receiptToken);
  actions.saveReceipt('owner', item, first, storage);
  assert.deepEqual(actions.readReceipt('owner', item, storage), first);
  assert.equal(actions.readReceipt('other-owner', item, storage), null);
  assert.equal(actions.readReceipt('owner', { ...item, id: 'other' }, storage), null);
});

test('unavailable storage and invalid saved receipts do not prevent a new checkout', () => {
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(actions.readReceipt('owner', { kind: 'product', id: 'book' }, denied), null);
  assert.doesNotThrow(() => actions.saveReceipt('owner', { kind: 'product', id: 'book' }, actions.newReceipt(), denied));
  assert.equal(actions.readReceipt('owner', {}, { getItem: () => '{"receiptToken":"invalid"}' }), null);
});

test('public form failures preserve field errors and HTTP status for inline feedback', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: 'Check the form.', errors: { email: 'Invalid email' } }) });
  try {
    await assert.rejects(actions.publicRequest('/api/rsvp', { name: 'Visitor' }), error => error.status === 400 && error.errors.email === 'Invalid email');
  } finally { globalThis.fetch = original; }
});

test('checkout sends only the requested action and its data and handles non-JSON errors', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (path, options) => {
    assert.equal(path, '/api/payments');
    assert.deepEqual(JSON.parse(options.body), { slug: 'owner', requestId: 'request', op: 'status' });
    return { ok: true, json: async () => ({ status: 'paid' }) };
  };
  try { assert.deepEqual(await actions.paymentRequest('status', { slug: 'owner', requestId: 'request' }), { status: 'paid' }); }
  finally { globalThis.fetch = original; }
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => { throw new Error('HTML response'); } });
  try { await assert.rejects(actions.publicRequest('/api/rsvp', {}), /503/); }
  finally { globalThis.fetch = original; }
});

test('money conversion rejects invalid prices and accepts supported decimal currencies', () => {
  for (const amount of [null, '', 0, -1, 'bad', 1e7, 1.234]) assert.throws(() => minorUnits(amount, 'INR'), /valid price/);
  assert.throws(() => minorUnits(49, 'XXX'), /currency/);
  assert.equal(minorUnits(49.5, 'USD'), 4950);
  assert.equal(formatAmount(100, 'not-a-code'), 'not-a-code 1.00');
  assert.equal(normalizeBuyer({ name: 'Visitor', email: 'visitor@example.test', phone: '12' }).ok, false);
  assert.equal(normalizeBuyer(null).ok, false);
});

test('gateway script loading can retry after a network error and reuses a loaded gateway', async () => {
  const priorWindow = globalThis.window, priorDocument = globalThis.document;
  let script;
  globalThis.window = {};
  globalThis.document = { createElement: () => ({ remove() {} }), head: { appendChild(node) { script = node; } } };
  try {
    const failed = actions.loadRazorpay(); script.onerror(); await assert.rejects(failed, /could not load/);
    const ready = actions.loadRazorpay(), same = actions.loadRazorpay(); assert.equal(ready, same);
    class Gateway {}
    window.Razorpay = Gateway; script.onload();
    assert.equal(await ready, Gateway); assert.equal(await actions.loadRazorpay(), Gateway);
  } finally { if (priorWindow === undefined) delete globalThis.window; else globalThis.window = priorWindow; if (priorDocument === undefined) delete globalThis.document; else globalThis.document = priorDocument; }
});
