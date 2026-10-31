// Public, read-only: GET /api/site?slug=... returns the background image URL and look for that persona.
import { publicSettings } from '../server/site.js';
import { publicOffers } from '../server/profile.js';
import { registrationMode } from '../server/auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=20, s-maxage=20');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  try {
    // one round trip gives the persona page everything public: look, offerings, link to the profile, sign-up mode
    const [s, o] = await Promise.all([publicSettings(req.query?.slug), publicOffers(req.query?.slug).catch(() => null)]);
    return res.status(200).json({ ...(s || { imageUrl: null, bg: null }), handle: o?.handle || null, name: o?.name || null, hasProfile: !!o?.hasProfile, contact: o?.contact || null, offers: o?.offers || [], mode: registrationMode() });
  } catch (e) { console.error(e); return res.status(200).json({ imageUrl: null, bg: null }); }   // the page works without it
}
