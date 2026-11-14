import { raw, createAuthClient } from './supabase.js';
import { createCommerceRepository } from './commerce.js';
import { query } from './publicRepository.js';
import { HttpError } from './http.js';
import { purchaseView } from './paymentService.js';
import { recoveryReceiptToken } from './paymentCrypto.js';

function contact(input) {
  const value = String(input?.contact || '').trim().toLowerCase();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) && value.length <= 160) return { email: value };
  const phone = value.replace(/[\s()-]/g, '');
  if (/^\+[1-9][0-9]{6,14}$/.test(phone)) return { phone };
  throw new HttpError(400, 'Enter your purchase email or a phone number with country code.');
}
export function createBuyerIdentity(client = createAuthClient) {
  return {
    async request(value) {
      const { error } = await client().auth.signInWithOtp({ ...value, options: { shouldCreateUser: true } });
      if (error) throw new HttpError(503, 'Contact verification is unavailable. Please try again or use your saved receipt.');
    },
    async verify(value, token) {
      const { data, error } = await client().auth.verifyOtp({ ...value, token, type: value.email ? 'email' : 'sms' });
      if (error || !data?.session?.access_token) throw new HttpError(403, 'The code is invalid or expired. Request a new code.');
      return data.session.access_token;
    },
    async user(token) {
      const { data, error } = await client().auth.getUser(token);
      if (error || !data?.user) throw new HttpError(403, 'Verify your email or phone again to view purchases.');
      return data.user;
    },
  };
}
export function createBuyerAccess({ identity = createBuyerIdentity(), repo = createCommerceRepository(), database = raw, signingKey = process.env.SESSION_SECRET } = {}) {
  async function owner(input) {
    if (!/^[a-z0-9-]{1,80}$/.test(input?.slug || '')) throw new HttpError(404, 'Profile not found.');
    const value = await repo.accountOwner(input.slug);
    if (!value) throw new HttpError(404, 'Profile not found.');
    return value;
  }
  return {
    async request(input, { ip = 'anon' } = {}) {
      const value = contact(input), account = await owner(input);
      await repo.claim(account.id, 'checkout', ip);
      await identity.request(value);
      return { sent: true };
    },
    async verify(input, { ip = 'anon' } = {}) {
      const value = contact(input), account = await owner(input);
      if (!/^\d{6,8}$/.test(input?.code || '')) throw new HttpError(400, 'Enter the verification code.');
      await repo.claim(account.id, 'checkout', ip);
      return { accessToken: await identity.verify(value, input.code) };
    },
    async list(input) {
      if (typeof input?.accessToken !== 'string' || input.accessToken.length > 8000) throw new HttpError(403, 'Verify your contact details first.');
      const account = await owner(input), user = await identity.user(input.accessToken), value = contact(input);
      const email = value.email && user.email_confirmed_at && user.email?.toLowerCase() === value.email;
      const phone = value.phone && user.phone_confirmed_at && `+${String(user.phone).replace(/^\+/, '')}` === value.phone;
      if (!email && !phone) throw new HttpError(403, 'Verify the contact details used for this purchase.');
      const page = Math.max(1, Math.min(10000, Math.floor(Number(input.page) || 1)));
      const result = await database().from('purchases').select('*', { count: 'exact' }).eq('owner_id', account.id).eq(email ? 'buyer_email' : 'buyer_phone', email ? value.email : value.phone).in('status', ['paid', 'free', 'refunded']).order('created_at', { ascending: false }).range((page - 1) * 50, page * 50 - 1);
      const rows = await query(result);
      const owned = rows.filter(row => row.owner_id === account.id && (email ? row.buyer_email === value.email : row.buyer_phone === value.phone));
      return { page, total: result.count || 0, rows: owned.map(row => ({ ...purchaseView(row), receipt: { requestId: row.request_id, receiptToken: recoveryReceiptToken(row, signingKey) } })) };
    },
  };
}
