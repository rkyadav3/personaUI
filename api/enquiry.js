// Public: POST /api/enquiry { slug, name, email, … } files a visitor's enquiry in that profile owner's admin inbox.
import { submitEnquiry } from '../server/engage.js';
import { createJobPublicService } from '../server/jobs.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET' && req.query?.kind === 'jobs') {
    try { return res.status(200).json(await createJobPublicService().list(String(req.query.slug || ''))); }
    catch(error) { return res.status(error.status || 500).json({error:error.status ? error.message : 'Jobs could not be loaded.'}); }
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'anon';
  try {
    if (body.action==='job.upload' || body.action==='job.apply') {
      const service=createJobPublicService();
      return res.status(200).json(await (body.action==='job.upload'?service.upload(body,ip):service.submit(body,ip)));
    }
    const r = await submitEnquiry(body, { ip });
    return res.status(r.ok ? 200 : r.status || 400).json(r.ok ? { ok: true } : { ok: false, error: r.error, errors: r.errors });
  } catch (e) {
    if(e.status) return res.status(e.status).json({ok:false,error:e.message});
    console.error('enquiry', e);
    return res.status(500).json({ ok: false, error: 'Could not send your enquiry right now. Please try again in a moment.' });
  }
}
