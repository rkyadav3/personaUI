import { paymentWebhook } from '../server/commerce.js';
import { HttpError, publicError } from '../server/http.js';
export const config = { api: { bodyParser: false } };

export async function rawWebhookBody(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length; if (size > 128000) throw new HttpError(413, 'Webhook too large.');
    chunks.push(bytes);
  }
  if (!size) throw new HttpError(400, 'The original webhook body is required.');
  return Buffer.concat(chunks);
}
export function webhookHandler(process = paymentWebhook) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'POST only' }); }
    try {
      const body = await rawWebhookBody(req);
      return res.status(200).json(await process({ body, signature: req.headers?.['x-razorpay-signature'] }));
    } catch (error) { return publicError(res, error, 'razorpay-webhook'); }
  };
}
export default webhookHandler();
