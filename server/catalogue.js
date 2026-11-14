// A single catalogue interface. Legacy item references stay stable for receipts and Home selections.
import { getSettings, savePage } from './site.js';
import { getProfile, saveOffering, deleteOffering } from './profile.js';
import { HttpError } from './http.js';
import { randomUUID } from 'node:crypto';
import { normalizeQuantity } from '../shared/commerce.js';

export async function listItems(db) {
  const [site, profile] = await Promise.all([getSettings(db), getProfile(db)]);
  const categories = profile.contributions || [];
  return { version: site.version, categories, items: [
    ...site.portfolio.products.map(item => ({ ...item, kind: 'product', description: item.summary, price: item.amount, categoryName: item.category || 'Uncategorized', active: true })),
    ...categories.flatMap(category => (category.offerings || []).map(item => ({ ...item, kind: 'offering', contributionId: category.id, categoryName: category.subtype || category.category, assetId: item.delivery_asset_id || '', deliveryKind: item.delivery_kind || 'file', deliveryUrl: item.delivery_url || '', expectedItemVersion: item.updated_at }))),
  ] };
}
export async function saveItem(db, input) {
  if (Object.hasOwn(input, 'quantity')) { try { input = { ...input, quantity: normalizeQuantity(input.quantity) }; } catch (error) { throw new HttpError(400, error.message); } }
  if (!['product', 'offering'].includes(input.kind)) throw new HttpError(400, 'Choose a valid item type.');
  if (!['free', 'paid', 'unspecified'].includes(input.pricing)) throw new HttpError(400, 'Choose a valid price type.');
  if (input.pricing === 'paid' && (!Number.isFinite(Number(input.price)) || Number(input.price) <= 0 || Number(input.price) >= 1e9)) throw new HttpError(400, 'Enter a valid positive price.');
  if (input.deliveryKind && !['file', 'service'].includes(input.deliveryKind)) throw new HttpError(400, 'Choose file or service delivery.');
  if (input.kind !== 'product') return saveOffering(db, { ...input, deliveryUrl: '', assetId: input.assetId || '', deliveryKind: input.deliveryKind || 'file' });
  const site = await getSettings(db);
  const existing = site.portfolio.products.find(item => item.id === input.id);
  if (input.id && !existing) throw new HttpError(404, 'Item not found in this account.');
  if (input.expectedVersion !== site.version) throw new HttpError(409, 'Store content changed. Reload before saving.');
  const item = { ...existing, ...input, id: existing?.id || randomUUID(), summary: input.description, amount: input.price, deliveryUrl: '' };
  const products = existing ? site.portfolio.products.map(value => value.id === item.id ? item : value) : [...site.portfolio.products, item];
  await savePage(db, { portfolioPatch: { products }, expectedVersion: site.version });
  return { id: item.id };
}
export async function deleteItem(db, input) {
  if (!['product', 'offering'].includes(input.kind)) throw new HttpError(400, 'Choose a valid item type.');
  if (input.kind !== 'product') return deleteOffering(db, input.id);
  const site = await getSettings(db);
  if (input.expectedVersion !== site.version) throw new HttpError(409, 'Store content changed. Reload before deleting.');
  await savePage(db, { portfolioPatch: { products: site.portfolio.products.filter(item => item.id !== input.id) }, expectedVersion: site.version });
}
