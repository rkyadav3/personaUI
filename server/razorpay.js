import { HttpError } from './http.js';

export function createRazorpayGateway(fetcher = fetch) {
  async function request(account, path, body) {
    let response;
    try {
      response = await fetcher(`https://api.razorpay.com/v1/${path}`, {
        method: body ? 'POST' : 'GET', headers: { Authorization: `Basic ${Buffer.from(`${account.keyId}:${account.keySecret}`).toString('base64')}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000),
      });
    } catch { throw new HttpError(502, 'Razorpay could not be reached. Please try again.'); }
    if (!response.ok) {
      const error = new HttpError(response.status === 401 ? 503 : 502, response.status === 401 ? 'The seller needs to check their Razorpay settings.' : 'Razorpay could not complete this payment request. Please try again.');
      if (path === 'orders' && [400, 401, 403, 422, 429].includes(response.status)) error.orderNotCreated = true;
      throw error;
    }
    try { return await response.json(); } catch { throw new HttpError(502, 'Razorpay returned an invalid response. Please try again.'); }
  }
  const paymentId = id => { if (!/^pay_[A-Za-z0-9]+$/.test(id || '')) throw new HttpError(400, 'Invalid payment reference.'); return id; };
  const orderId = id => { if (!/^order_[A-Za-z0-9]+$/.test(id || '')) throw new HttpError(400, 'Invalid order reference.'); return id; };
  return {
    createOrder: (account, order) => request(account, 'orders', { ...order, payment_capture: 1 }),
    payment: (account, id) => request(account, `payments/${paymentId(id)}`),
    capture: (account, id, amount, currency) => request(account, `payments/${paymentId(id)}/capture`, { amount, currency }),
    orderPayments: (account, id) => request(account, `orders/${orderId(id)}/payments`),
  };
}
