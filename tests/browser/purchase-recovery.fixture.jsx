// Real checkout UI with an old purchase and a local mock API; no real payment requests.
import React from 'react';
import { createRoot } from 'react-dom/client';
import CheckoutDialog from '../../src/components/commerce/CheckoutDialog.jsx';
import '../../src/styles.css';

const receipt = { requestId: '223ecb9d-6e31-4e2e-bb6e-5ce70c74e5ef', receiptToken: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc' };
const purchase = { id: 'old-purchase', requestId: receipt.requestId, kind: 'offering', itemId: '5', title: 'Original book', amount: 14950, currency: 'INR', status: 'paid', paymentId: 'pay_fixture', buyer: { name: 'Buyer', email: 'buyer@example.test' }, deliveryUrl: 'https://example.test/book' };
window.fetch = async (url, options) => {
  if (url !== '/api/payments') throw new Error('Unexpected fixture request');
  const input = JSON.parse(options.body);
  const found = input.op === 'recover'
    ? input.email === 'buyer@example.test' && input.paymentId === 'pay_fixture' && input.item?.id === '5'
    : input.op === 'status' && input.requestId === receipt.requestId && input.receiptToken === receipt.receiptToken;
  return new Response(JSON.stringify(found ? { ...purchase, ...(input.op === 'recover' ? { receipt } : {}) } : { error: 'No matching purchase was found for this item, email and payment ID.' }), { status: found ? 200 : 404, headers: { 'Content-Type': 'application/json' } });
};
createRoot(document.getElementById('root')).render(<CheckoutDialog slug="recovery-fixture" item={{ title: 'Book', pricing: 'paid', price: '₹149.50', checkout: { kind: 'offering', id: '5' } }} onClose={() => {}} />);
