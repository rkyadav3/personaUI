import test from 'node:test';
import assert from 'node:assert/strict';
import * as portfolio from '../shared/portfolio.js';
const { normalizePortfolio } = portfolio;
import { resolveSite } from '../src/lib/portfolioModel.js';

test('portfolio products retain stable identifiers, numeric prices and private delivery links', () => {
  const p = normalizePortfolio({ products: [{ id: 'ebook-a', title: 'E-book', pricing: 'paid', amount: 149.5, currency: 'INR', deliveryUrl: 'https://example.test/access' }] }).products[0];
  assert.equal(p.id, 'ebook-a');
  assert.equal(p.pricing, 'paid');
  assert.equal(p.amount, 149.5);
  assert.equal(p.deliveryUrl, 'https://example.test/access');
});

test('old Free and rupee prices remain usable during catalog migration', () => {
  const products = normalizePortfolio({ products: [{ title: 'Guide', price: 'Free' }, { title: 'Book', price: '₹499.50' }] }).products;
  assert.equal(products[0].pricing, 'free');
  assert.equal(products[0].amount, 0);
  assert.equal(products[1].pricing, 'paid');
  assert.equal(products[1].amount, 499.5);
});

test('the profile shop keeps every visible free and paid offering with checkout references', () => {
  const offerings = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, title: `Item ${i + 1}`, pricing: i % 2 ? 'paid' : 'free', price: i % 2 ? 99 : null, currency: 'INR' }));
  const model = resolveSite({ name: 'Owner', contributions: [{ category: 'Books', offerings }], events: [{ id: 17, title: 'Meetup' }] }, 'owner');
  assert.equal(model.products.length, 7);
  assert.deepEqual(model.products[0].checkout, { kind: 'offering', id: '1' });
  assert.equal(model.products[0].pricing, 'free');
  assert.deepEqual(model.events.map(x => x.id), [17]);
});

test('categories explicitly hidden by their owner stay out of the shop', () => {
  const model = resolveSite({ page: { placement: { Books: 'hidden' } }, contributions: [{ category: 'Books', offerings: [{ id: 1, title: 'Private item', pricing: 'free' }] }] }, 'owner');
  assert.equal(model.products.length, 0);
});

test('public portfolio data never contains private delivery links', () => {
  assert.equal(typeof portfolio.publicPortfolio, 'function');
  const data = portfolio.publicPortfolio({ products: [{ id: 'book', title: 'Book', pricing: 'paid', amount: 49, deliveryUrl: 'https://example.test/private-file', url: 'https://example.test/product-info' }] });
  assert.equal(data.products[0].url, 'https://example.test/product-info');
  assert.doesNotMatch(JSON.stringify(data), /private-file/);
});

test('access readiness survives public data normalization without exposing the delivery link', () => {
  const data = portfolio.publicPortfolio({ products: [
    { id: 'ready', title: 'Ready guide', pricing: 'free', deliveryUrl: 'https://example.test/private-file' },
    { id: 'not-ready', title: 'Coming soon', pricing: 'paid', amount: 49 },
  ] });
  const model = resolveSite({ portfolio: data }, 'owner');
  assert.equal(model.products[0].accessReady, true);
  assert.equal(model.products[1].accessReady, false);
  assert.doesNotMatch(JSON.stringify(model), /private-file/);
});

test('free and paid Talk Shows are included in the profile home shop', () => {
  const model = resolveSite({ contributions: [{ category: 'Talk Shows', offerings: [{ id: 9, title: 'Recorded talk', pricing: 'paid', price: 49 }] }] }, 'owner');
  assert.equal(model.products.length, 1);
  assert.deepEqual(model.products[0].checkout, { kind: 'offering', id: '9' });
});

test('legacy lowercase offering currencies remain usable in online checkout', () => {
  const model = resolveSite({ contributions: [{ category: 'Books', offerings: [{ id: 1, title: 'Book', pricing: 'paid', price: 49, currency: 'inr' }] }] }, 'owner');
  assert.equal(model.products[0].currency, 'INR');
});
