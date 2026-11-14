const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const { transformSync } = require('esbuild');
Module._extensions['.jsx'] = (module, file) => module._compile(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'jsx', format: 'cjs', jsx: 'automatic' }).code, file);
Module._extensions['.css'] = () => {};
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

test('checkout offers recovery separately from creating another paid order', () => {
  const CheckoutDialog = require('../src/components/commerce/CheckoutDialog.jsx').default;
  const html = renderToStaticMarkup(React.createElement(CheckoutDialog, { slug: 'alice', item: { title: 'Book', pricing: 'paid', checkout: { kind: 'offering', id: '5' } }, onClose() {} }));
  assert.match(html, /Already purchased/); assert.match(html, /My purchases/); assert.match(html, /Use an old payment receipt/);
});

test('the recovery form asks for the purchase email and payment ID with accessible errors', () => {
  const { PurchaseRecoveryForm } = require('../src/components/commerce/CheckoutDialog.jsx');
  const html = renderToStaticMarkup(React.createElement(PurchaseRecoveryForm, { details: { email: '', paymentId: '' }, errors: { email: 'Enter a valid email' }, onChange() {}, onSubmit() {}, onBack() {} }));
  assert.match(html, /Purchase email/); assert.match(html, /Razorpay payment ID/); assert.match(html, /pay_/);
  assert.match(html, /aria-invalid="true"/); assert.match(html, /Enter a valid email/); assert.match(html, /Recover purchase/);
});

test('browser recovery saves the verified receipt under the correct profile and item', async () => {
  const { recoverPurchase, readReceipt } = await import('../src/lib/publicActions.js');
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const item = { kind: 'offering', id: '5' }, receipt = { requestId: '223ecb9d-6e31-4e2e-bb6e-5ce70c74e5ef', receiptToken: Buffer.alloc(32, 8).toString('base64url') };
  let sent;
  const result = await recoverPurchase('alice', item, { email: ' BUYER@Example.Test ', paymentId: ' pay_fixture ' }, { storage, request: async (op, body) => { sent = { op, body }; return { requestId: receipt.requestId, kind: 'offering', itemId: '5', status: 'paid', receipt }; } });
  assert.deepEqual(sent, { op: 'recover', body: { slug: 'alice', item, email: 'buyer@example.test', paymentId: 'pay_fixture' } });
  assert.deepEqual(readReceipt('alice', item, storage), receipt); assert.equal(readReceipt('bob', item, storage), null); assert.equal(result.status, 'paid');
});

test('malformed or cross-item recovery responses never overwrite the saved receipt', async () => {
  const { recoverPurchase } = await import('../src/lib/publicActions.js');
  const storage = { setItem() { throw new Error('Must not save'); } };
  for (const response of [null, { kind: 'offering', itemId: '6' }, { kind: 'offering', itemId: '5', receipt: { requestId: 'bad', receiptToken: 'bad' } }]) {
    await assert.rejects(recoverPurchase('alice', { kind: 'offering', id: '5' }, { email: 'buyer@example.test', paymentId: 'pay_fixture' }, { storage, request: async () => response }), /receipt|recover/i);
  }
});
