// Public, read-only: GET /api/profile?slug=... returns only what the owner chose to publish.
import { publicProfile } from '../server/profile.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  try {
    const p = await publicProfile(req.query?.slug);
    if (!p) return res.status(404).json({ error: 'No public profile here.' });
    return res.status(200).json(p);
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Something went wrong.' }); }
}
