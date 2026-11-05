import { normalizePurchaseRecovery, validReceiptToken, validRequestId } from '../../shared/commerce.js';

export async function publicRequest(path, body, options = {}) {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(25000), ...options,
  });
  let data;
  try { data = await response.json(); } catch { /* A proxy may return an HTML error page. */ }
  if (!response.ok || !data) {
    const error = new Error(data?.error || `Request failed (${response.status}). Please try again.`);
    error.status = response.status; error.errors = data?.errors || {}; throw error;
  }
  return data;
}

export const paymentRequest = (op, input) => publicRequest('/api/payments', { ...input, op });
export async function recoverPurchase(slug, item, details, { request = paymentRequest, storage } = {}) {
  const proof = normalizePurchaseRecovery(details);
  if (!proof.ok) throw Object.assign(new Error('Check your purchase details.'), { errors: proof.errors });
  const row = await request('recover', { slug, item, ...proof.value });
  const receipt = row?.receipt;
  if (!['paid', 'refunded'].includes(row?.status) || row?.kind !== item.kind || String(row?.itemId) !== String(item.id) || row?.requestId !== receipt?.requestId || !validRequestId(receipt?.requestId) || !validReceiptToken(receipt?.receiptToken)) throw new Error('The recovered receipt could not be read. Please try again.');
  saveReceipt(slug, item, receipt, storage);
  return row;
}
export function newReceipt() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return { requestId: crypto.randomUUID(), receiptToken: btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') };
}
const receiptKey = (slug, item) => `persona-receipt:${slug}:${item.kind}:${item.id}`;
export function readReceipt(slug, item, storage) {
  try {
    const value = JSON.parse((storage || localStorage).getItem(receiptKey(slug, item)) || 'null');
    return validRequestId(value?.requestId) && validReceiptToken(value?.receiptToken) ? { requestId: value.requestId, receiptToken: value.receiptToken } : null;
  } catch { return null; }
}
export function saveReceipt(slug, item, receipt, storage) {
  try { (storage || localStorage).setItem(receiptKey(slug, item), JSON.stringify(receipt)); } catch { /* Checkout still works when browser storage is disabled. */ }
}

let razorpayScript;
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!razorpayScript) {
    razorpayScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const fail = () => { clearTimeout(timer); script.remove(); razorpayScript = null; reject(new Error('Payment checkout could not load. Check your connection and try again.')); };
      const timer = setTimeout(fail, 15000);
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.async = true;
      script.onload = () => { if (!window.Razorpay) return fail(); clearTimeout(timer); resolve(window.Razorpay); };
      script.onerror = fail; document.head.appendChild(script);
    });
  }
  return razorpayScript;
}
