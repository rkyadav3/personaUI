// Public, read-only: GET /api/site?slug=... returns the background image URL and look for that persona.
import { publicSettings } from '../server/site.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=20, s-maxage=20');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  try {
    const s = await publicSettings(req.query?.slug);
    return res.status(200).json(s || { imageUrl: null, bg: null });
  } catch (e) { console.error(e); return res.status(200).json({ imageUrl: null, bg: null }); }   // the page works without it
}
