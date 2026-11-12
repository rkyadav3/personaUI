import { raw, run, paged } from './supabase.js';
import { needSuperAdmin } from './governance.js';
import { normalizeHomeSettings } from '../shared/homeSettings.js';
import { HttpError } from './http.js';
import { scoped } from './tenant.js';
import { savePaymentSettings } from './commerce.js';
import { isSuperAdminEmail } from './auth.js';

const SALES_COLUMNS = 'id,owner_id,seller_name,seller_email,item_kind,item_id,item_title,buyer_name,amount,currency,status,refunded_amount,razorpay_payment_id,created_at,paid_at';
const completed = status => ['paid', 'refunded'].includes(status);
const add = (a, b) => { const sum = a + b; if (!Number.isSafeInteger(sum)) throw new HttpError(503, 'The sales totals are too large to display accurately.'); return sum; };
const emptyMoney = currency => ({ currency, gross: 0, refunds: 0, net: 0, paidSales: 0 });
const money = (map, currency) => { if (!map.has(currency)) map.set(currency, emptyMoney(currency)); return map.get(currency); };

export function buildSalesReport({ sales = [], users = [], accounts = [] } = {}) {
  const counts = { paidSales: 0, freeOrders: 0, pending: 0, failed: 0, refundedOrders: 0 };
  const currencies = new Map(), sellers = new Map(), products = new Map();
  const seller = (id, sale = {}) => {
    if (!sellers.has(id)) {
      const user = users.find(user => user.id === id);
      sellers.set(id, { id, name: user?.name || sale.seller_name || 'Former admin', email: user?.email || sale.seller_email || '', slug: user?.slug || null, accountExists: Boolean(user), paidSales: 0, freeOrders: 0, pending: 0, checkoutEnabled: accounts.find(account => account.owner_id === id)?.enabled !== false, money: new Map() });
    }
    return sellers.get(id);
  };
  for (const user of users.filter(user => !user.isSuperAdmin && !isSuperAdminEmail(user.email))) seller(user.id);
  for (const sale of sales) {
    const admin = seller(sale.owner_id, sale);
    if (sale.status === 'pending') { counts.pending++; admin.pending++; continue; }
    if (sale.status === 'failed') { counts.failed++; continue; }
    if (!completed(sale.status) && sale.status !== 'free') continue;
    const amount = Number(sale.amount), refunded = Number(sale.refunded_amount || 0);
    if (!Number.isSafeInteger(amount) || amount < 0 || !Number.isSafeInteger(refunded) || refunded < 0 || refunded > amount || !/^[A-Z]{3}$/.test(sale.currency)) throw new HttpError(503, 'A sales record needs review before totals can be displayed.');
    const productKey = JSON.stringify([sale.owner_id, sale.item_kind, sale.item_id, sale.currency]);
    if (!products.has(productKey)) products.set(productKey, { ownerId: sale.owner_id, adminName: admin.name, kind: sale.item_kind, itemId: sale.item_id, title: sale.item_title || 'Untitled product', currency: sale.currency, paidSales: 0, freeOrders: 0, gross: 0, refunds: 0, net: 0 });
    const product = products.get(productKey);
    if (sale.status === 'free') { counts.freeOrders++; admin.freeOrders++; product.freeOrders++; continue; }
    counts.paidSales++; admin.paidSales++; product.paidSales++;
    if (sale.status === 'refunded') counts.refundedOrders++;
    for (const total of [money(currencies, sale.currency), money(admin.money, sale.currency)]) {
      total.gross = add(total.gross, amount); total.refunds = add(total.refunds, refunded); total.net = total.gross - total.refunds; total.paidSales++;
    }
    product.gross = add(product.gross, amount); product.refunds = add(product.refunds, refunded); product.net = product.gross - product.refunds;
  }
  return {
    counts,
    currencies: [...currencies.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    admins: [...sellers.values()].map(({ money, ...admin }) => ({ ...admin, earnings: [...money.values()] })).sort((a, b) => b.paidSales - a.paidSales || a.name.localeCompare(b.name)),
    products: [...products.values()].sort((a, b) => b.paidSales - a.paidSales),
    recent: [...sales].sort((a, b) => String(b.paid_at || b.created_at || '').localeCompare(String(a.paid_at || a.created_at || ''))).slice(0, 50).map(sale => ({ id: sale.id, ownerId: sale.owner_id, adminName: seller(sale.owner_id, sale).name, title: sale.item_title, buyerName: sale.buyer_name, amount: sale.amount, refundedAmount: sale.refunded_amount || 0, currency: sale.currency, status: sale.status, paymentId: sale.razorpay_payment_id || null, createdAt: sale.created_at, paidAt: sale.paid_at })),
  };
}

export function createPlatformService({ database = raw, tenant = scoped, saveCheckout = savePaymentSettings } = {}) {
  return {
    async home() {
      const [row] = await run(database().from('platform_settings').select('value').eq('key', 'home').limit(1));
      return normalizeHomeSettings(row?.value);
    },
    async saveHome(user, input) {
      needSuperAdmin({ user });
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Provide main site settings.');
      const value = normalizeHomeSettings(input);
      await run(database().from('platform_settings').upsert({ key: 'home', value, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: 'key' }));
      return value;
    },
    async sales(user) {
      needSuperAdmin({ user });
      const db = database();
      const [sales, users, accounts] = await Promise.all([
        paged(db, 'platform_sales', SALES_COLUMNS, q => q.order('id')),
        paged(db, 'users', 'id,name,email,slug', q => q.order('id')),
        paged(db, 'payment_accounts', 'owner_id,enabled', q => q.order('owner_id')),
      ]);
      return buildSalesReport({ sales, users, accounts });
    },
    async setCheckout(user, input) {
      needSuperAdmin({ user });
      if (typeof input?.enabled !== 'boolean' || typeof input.id !== 'string') throw new HttpError(400, 'Choose an admin and checkout state.');
      const [admin] = await run(database().from('users').select('id,email').eq('id', input.id).limit(1));
      if (!admin || isSuperAdminEmail(admin.email)) throw new HttpError(404, 'Admin account not found.');
      return saveCheckout(tenant(admin.id), { enabled: input.enabled });
    },
  };
}
