// Public, read-only: GET /api/home returns the member cards and every public offering for the home page.
import { createTagService } from '../server/tags.js';
import { homeFeed } from '../server/home.js';
import { createPlatformService } from '../server/platform.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  try { const [feed, settings, tagDefinitions] = await Promise.all([homeFeed(), createPlatformService().home(), createTagService().list()]); return res.status(200).json({ ...feed, name: settings.siteName || feed.name, settings, tagDefinitions }); }
  catch (e) { console.error(e); return res.status(500).json({ error: 'Could not load the members right now.' }); }
}
