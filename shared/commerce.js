export const CHECKOUT_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED'];
const text = (v, n) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '';
export const validRequestId = v => typeof v === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
export const validReceiptToken = v => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);

export function normalizePurchaseRecovery(input = {}) {
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
  const paymentId = typeof input?.paymentId === 'string' ? input.paymentId.trim() : '';
  const errors = {};
  if (email.length > 160 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = 'Enter the email used for this purchase.';
  if (!/^pay_[A-Za-z0-9]{1,80}$/.test(paymentId)) errors.paymentId = 'Enter the Razorpay payment ID from your original receipt (pay_…).';
  return { ok: !Object.keys(errors).length, value: { email, paymentId }, errors };
}

export function normalizeBuyer(input = {}) {
  const value = { name: text(input?.name, 100), email: text(input?.email, 160).toLowerCase(), phone: text(input?.phone, 40) };
  const errors = {};
  if (value.name.length < 2) errors.name = 'Please enter your name.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.email)) errors.email = 'Enter a valid email address.';
  if (value.phone && value.phone.replace(/\D/g, '').length < 7) errors.phone = 'Enter a valid phone number.';
  return { ok: !Object.keys(errors).length, value, errors };
}

export function minorUnits(amount, currency = 'INR') {
  const value = Number(amount), scaled = value * 100, rounded = Math.round(scaled);
  if (!CHECKOUT_CURRENCIES.includes(currency)) throw new Error('This currency is not supported for online checkout. Please contact the seller.');
  if (amount == null || amount === '' || !Number.isFinite(value) || value <= 0 || value >= 1e7 || Math.abs(scaled - rounded) > 0.000001) throw new Error('This item needs a valid price with up to two decimal places. Please contact the seller.');
  return rounded;
}

export function formatAmount(amount, currency = 'INR') {
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(amount || 0) / 100); }
  catch { return `${currency} ${(Number(amount || 0) / 100).toFixed(2)}`; }
}
