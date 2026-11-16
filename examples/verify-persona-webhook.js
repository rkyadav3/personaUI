import { createHmac, timingSafeEqual } from 'node:crypto';

// Pass the original Buffer/Uint8Array from the HTTP request before JSON parsing.
export function verifyPersonaWebhook({ rawBody, timestamp, signature, secret, now = Date.now() }) {
  if (!secret || !/^\d{10}$/.test(timestamp || '') ||
      Math.abs(now / 1000 - Number(timestamp)) > 300 ||
      !/^v1=[a-f0-9]{64}$/.test(signature || '')) return false;
  const expected = 'v1=' + createHmac('sha256', secret).update(timestamp + '.').update(rawBody).digest('hex');
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
