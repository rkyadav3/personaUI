import { createBuyerAccess } from '../server/buyerAccess.js';
import { HttpError, jsonBody, publicError } from '../server/http.js';
export function buyerAccessHandler(service = createBuyerAccess()) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    try {
      const { op, ...input } = jsonBody(req);
      if (!['request', 'verify', 'list'].includes(op)) throw new HttpError(400, 'Invalid purchase action.');
      const ip = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'anon').split(',')[0].trim();
      return res.status(200).json(await service[op](input, { ip }));
    } catch (error) { return publicError(res, error, 'purchase access'); }
  };
}
export default buyerAccessHandler();
