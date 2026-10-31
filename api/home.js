// Public, read-only: GET /api/home returns the member cards and every public offering for the home page.
import { homeFeed } from '../server/home.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=30, stale-while-revalidate=60');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  try { return res.status(200).json(await homeFeed()); }
  catch (e) { console.error(e); return res.status(500).json({ error: 'Could not load the members right now.' }); }
}
