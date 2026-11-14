import { createPurchase, purchaseReceipt, recoverPurchaseReceipt, verifyPurchase, purchaseDownload } from '../server/commerce.js';
import { HttpError, jsonBody, publicError } from '../server/http.js';

export function paymentHandler(service = { create: createPurchase, verify: verifyPurchase, status: purchaseReceipt, recover: recoverPurchaseReceipt, download: purchaseDownload }) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'POST only' }); }
    try {
      const { op, ...input } = jsonBody(req);
      const ip = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'anon').split(',')[0].trim();
      const operations = { create: () => service.create(input, { ip }), verify: () => service.verify(input), status: () => service.status(input), recover: () => service.recover(input, { ip }), download: () => service.download(input) };
      if (!Object.hasOwn(operations, op)) throw new HttpError(400, 'Choose a valid payment action.');
      return res.status(200).json(await operations[op]());
    } catch (error) { return publicError(res, error, 'checkout'); }
  };
}
export default paymentHandler();
