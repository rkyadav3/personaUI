import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError } from './http.js';

export const hashToken = token => createHash('sha256').update(token).digest('hex');
export function validSignature(body, signature, secret) {
  if (!secret || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signature, 'hex'), createHmac('sha256', secret).update(body).digest());
}

function encryptionKey(value = process.env.PAYMENT_ENCRYPTION_KEY) {
  const key = typeof value === 'string' ? Buffer.from(value, /^[a-f0-9]{64}$/i.test(value) ? 'hex' : 'base64') : value;
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new HttpError(503, 'Payment encryption is not configured. The profile owner needs to complete payment setup.');
  return key;
}
export function sealSecret(value, scope, key) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', encryptionKey(key), iv);
  cipher.setAAD(Buffer.from(scope));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}
export function openSecret(value, scope, key) {
  const cryptoKey = encryptionKey(key);
  try {
    const [version, iv, tag, encrypted, extra] = String(value || '').split('.');
    if (version !== 'v1' || !iv || !tag || !encrypted || extra) throw new Error('Invalid ciphertext');
    const decipher = createDecipheriv('aes-256-gcm', cryptoKey, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(scope)); decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
  } catch { throw new HttpError(503, 'Payment credentials could not be read. The profile owner needs to check payment setup.'); }
}
