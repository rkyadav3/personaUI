// Public: POST /api/track { kind: 'profile'|'view'|'click'|'rate', slug | id, stars }. Best-effort counters for the home page.
// The limits below live in memory per warm instance. For real protection add Vercel's firewall rate limiting.
import { track } from '../server/track.js';

const hits = new Map(), seen = new Map();
const WINDOW = { profile: 30 * 60e3, view: 30 * 60e3, click: 5 * 60e3, rate: 0 };

function limited(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < 60e3);
  list.push(now); hits.set(ip, list); if (hits.size > 5000) hits.clear();
  return list.length > 40;
}
function repeat(ip, kind, target) {   // the same visitor opening the same thing again within the window is not counted twice
  const win = WINDOW[kind]; if (!win) return false;
  const key = `${ip}|${kind}|${target}`, now = Date.now(), last = seen.get(key);
  if (last && now - last < win) return true;
  seen.set(key, now); if (seen.size > 20000) seen.clear();
  return false;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'anon';
  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
  if (limited(ip)) return res.status(429).json({ ok: false, error: 'Slow down a little.' });
  if (repeat(ip, body.kind, body.slug || body.id)) return res.status(200).json({ ok: true });
  try {
    const r = await track(body, { req, ip, ua: String(req.headers['user-agent'] || '').slice(0, 200) });
    return res.status(r.ok ? 200 : 400).json(r);
  } catch (e) { console.error(e); return res.status(200).json({ ok: true }); }   // counters must never break a page
}
