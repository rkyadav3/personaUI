// Public: POST /api/enquiry { slug, name, email, … } files a visitor's enquiry in that profile owner's admin inbox.
import { submitEnquiry } from '../server/engage.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'anon';
  try {
    const r = await submitEnquiry(body, { ip });
    return res.status(r.ok ? 200 : r.status || 400).json(r.ok ? { ok: true } : { ok: false, error: r.error, errors: r.errors });
  } catch (e) {
    console.error('enquiry', e);
    return res.status(500).json({ ok: false, error: 'Could not send your enquiry right now. Please try again in a moment.' });
  }
}
