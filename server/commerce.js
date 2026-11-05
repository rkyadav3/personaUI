import { raw } from './supabase.js';
import { normalizeVisibility } from './profile.js';
import { normalizePage } from '../shared/pageSettings.js';
import { cleanImg, normalizePortfolio } from '../shared/portfolio.js';
import { validRequestId } from '../shared/commerce.js';
import { createPublicRepository, query } from './publicRepository.js';
import { openSecret, sealSecret } from './paymentCrypto.js';
import { createPaymentService, purchaseView } from './paymentService.js';
import { createRazorpayGateway } from './razorpay.js';
import { HttpError } from './http.js';

const sharedAccount = () => ({ enabled: true, keyId: process.env.RAZORPAY_KEY_ID || '', keySecret: process.env.RAZORPAY_KEY_SECRET || '', webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '' });
function encryptionReady() {
  try { sealSecret('setup', 'setup'); return true; } catch { return false; }
}
const purchaseScope = row => `purchase:${row.owner_id}:${row.id}`;

export function createCommerceRepository(database = raw) {
  const db = () => database();
  return {
    ...createPublicRepository(database),
    async item(owner, ref) {
      const [profile] = await query(db().from('profiles').select('visibility').eq('owner_id', owner).eq('status', 'published').limit(1));
      if (!profile) return null;
      const [site] = await query(db().from('site_settings').select('page,portfolio').eq('owner_id', owner).limit(1));
      if (ref.kind === 'product') {
        const product = normalizePortfolio(site?.portfolio).products.find(p => p.id === ref.id);
        return product ? { kind: 'product', ...product } : null;
      }
      if (!normalizeVisibility(profile.visibility).contributions || !/^\d+$/.test(String(ref.id))) return null;
      const [offering] = await query(db().from('offerings').select('*').eq('owner_id', owner).eq('id', ref.id).eq('active', true).limit(1));
      if (!offering) return null;
      const [contribution] = await query(db().from('contributions').select('category').eq('owner_id', owner).eq('id', offering.contribution_id).eq('enabled', true).eq('visible', true).limit(1));
      if (!contribution || normalizePage(site?.page).placement[contribution.category] === 'hidden') return null;
      return { kind: 'offering', id: String(offering.id), title: offering.title, pricing: offering.pricing, amount: offering.price, currency: String(offering.currency || 'INR').toUpperCase(), deliveryUrl: cleanImg(offering.delivery_url) };
    },
    async account(owner) {
      const [row] = await query(db().from('payment_accounts').select('enabled').eq('owner_id', owner).limit(1));
      return { ...sharedAccount(), enabled: row?.enabled !== false };
    },
    sharedAccount: async () => sharedAccount(),
    sealAccount: (account, owner, id) => sealSecret(JSON.stringify(account), `purchase:${owner}:${id}`),
    purchaseAccount: async row => JSON.parse(openSecret(row.payment_credentials, purchaseScope(row))),
    byRequest: async (owner, request) => (await query(db().from('purchases').select('*').eq('owner_id', owner).eq('request_id', request).limit(1)))[0] || null,
    byOrder: async (owner, order) => (await query(db().from('purchases').select('*').eq('owner_id', owner).eq('razorpay_order_id', order).limit(1)))[0] || null,
    byPayment: async (owner, payment) => (await query(db().from('purchases').select('*').eq('owner_id', owner).eq('razorpay_payment_id', payment).limit(1)))[0] || null,
    // These global lookups are only used to verify signed notifications from the app's shared Razorpay account.
    webhookOrder: async order => (await query(db().from('purchases').select('*').eq('razorpay_order_id', order).limit(1)))[0] || null,
    webhookPayment: async payment => (await query(db().from('purchases').select('*').eq('razorpay_payment_id', payment).limit(1)))[0] || null,
    insert: record => query(db().from('purchases').insert(record).select('*').single()),
    attach: (owner, id, order) => query(db().from('purchases').update({ razorpay_order_id: order, updated_at: new Date().toISOString() }).eq('owner_id', owner).eq('id', id).eq('status', 'pending').select('*').single()),
    fail: (owner, id) => query(db().from('purchases').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('owner_id', owner).eq('id', id).eq('status', 'pending')),
    complete: a => query(db().rpc('complete_purchase', { p_owner: a.ownerId, p_purchase: a.purchaseId, p_order: a.orderId, p_payment: a.paymentId, p_amount: a.amount, p_currency: a.currency })),
    refund: (owner, id, amount) => query(db().rpc('record_purchase_refund', { p_owner: owner, p_purchase: id, p_amount: amount })),
  };
}
const service = () => createPaymentService({ repo: createCommerceRepository(), gateway: createRazorpayGateway() });
export const createPurchase = (input, meta) => service().create(input, meta);
export const verifyPurchase = input => service().verify(input);
export const purchaseReceipt = input => service().status(input);
export const recoverPurchaseReceipt = (input, meta) => service().recover(input, meta);
export const paymentWebhook = input => service().webhook(input);

export async function paymentSettings(db) {
  const [row] = await query(db.from('payment_accounts').select('enabled').limit(1));
  const ready = encryptionReady(), account = sharedAccount();
  return { mode: 'shared', keyId: account.keyId, enabled: row?.enabled !== false, configured: ready && !!account.keyId && !!account.keySecret, webhookConfigured: !!account.webhookSecret, encryptionReady: ready, testMode: account.keyId.startsWith('rzp_test_') };
}
export async function savePaymentSettings(db, input) {
  const [row] = await query(db.from('payment_accounts').select('*').limit(1));
  const enabled = input?.enabled === true, patch = { enabled, updated_at: new Date().toISOString() };
  if (enabled && (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET || !encryptionReady())) throw new HttpError(503, 'The platform administrator needs to finish the shared payment setup.');
  if (row) await query(db.from('payment_accounts').update(patch)); else await query(db.from('payment_accounts').insert(patch));
  return paymentSettings(db);
}

const PURCHASE_COLUMNS = 'id,request_id,item_kind,item_id,item_title,buyer_name,buyer_email,buyer_phone,amount,currency,status,refunded_amount,razorpay_order_id,razorpay_payment_id,delivery_url,fulfillment_status,admin_note,created_at,paid_at';
export async function listPurchases(db, input = {}) {
  const page = Math.max(1, Math.min(100000, Math.floor(Number(input.page) || 1))), size = 50;
  const status = ['paid', 'free', 'pending', 'failed', 'refunded'].includes(input.status) ? input.status : '';
  let request = db.from('purchases').select(PURCHASE_COLUMNS, { count: 'exact' });
  if (status) request = request.eq('status', status);
  const [result, summary] = await Promise.all([request.order('created_at', { ascending: false }).range((page - 1) * size, page * size - 1), query(db.rpc('purchase_summary'))]);
  const rows = await query(result);
  return { rows: rows.map(row => ({ ...purchaseView(row), orderId: row.razorpay_order_id || null, note: row.admin_note || '' })), total: result.count || 0, page, pageSize: size, summary };
}
export async function fulfillPurchase(db, input) {
  if (!validRequestId(input?.id)) throw new HttpError(400, 'Invalid purchase.');
  const [row] = await query(db.from('purchases').select('id,status').eq('id', input.id).limit(1));
  if (!row) throw new HttpError(404, 'Purchase not found.');
  if (!['paid', 'free'].includes(row.status)) throw new HttpError(409, 'Only completed purchases can be fulfilled.');
  await query(db.from('purchases').update({ fulfillment_status: input.fulfilled === true ? 'fulfilled' : 'pending', admin_note: typeof input.note === 'string' ? input.note.trim().slice(0, 1000) : '', updated_at: new Date().toISOString() }).eq('id', row.id));
  return { ok: true };
}
