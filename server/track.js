// Visitor events for the home page rails: profile views, offering views, buy/enquire clicks and star ratings.
// Visitors are anonymous, so this is deliberately light: counters only, no IPs stored (ratings keep a salted hash so one
// visitor gets one vote per offering), and a member's own visits and votes never count.
import { createHash } from 'node:crypto';
import { sessionUser } from './auth.js';
import { raw, run } from './supabase.js';

const SLUG = s => String(s || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
const intId = v => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };

export const voterHash = (ip, ua) => createHash('sha256').update(`${process.env.SESSION_SECRET || ''}|${ip}|${ua || ''}`).digest('hex').slice(0, 32);

/** Returns { ok, avg?, count?, error? }. Unknown or inactive targets are ignored quietly. */
export async function track(body, { req, ip, ua }) {
  const kind = body?.kind, db = raw();
  const me = await sessionUser(req).catch(() => null);

  if (kind === 'profile') {
    const [u] = await run(db.from('users').select('id').eq('slug', SLUG(body.slug)).limit(1));
    if (u && u.id !== me?.id) await run(db.rpc('bump_profile_view', { p_owner: u.id }));
    return { ok: true };
  }

  const id = intId(body?.id);
  if (!id || !['view', 'click', 'rate'].includes(kind)) return { ok: false, error: 'Bad request.' };
  const [o] = await run(db.from('offerings').select('id,owner_id,active').eq('id', id).limit(1));
  if (!o || !o.active) return { ok: true };
  const own = o.owner_id === me?.id;

  if (kind === 'rate') {
    const stars = Math.round(Number(body.stars));
    if (!(stars >= 1 && stars <= 5)) return { ok: false, error: 'Pick 1 to 5 stars.' };
    if (own) return { ok: false, error: "You can't rate your own offering." };
    await run(db.rpc('rate_offering', { p_id: id, p_voter: voterHash(ip, ua), p_stars: stars }));
    const [r] = await run(db.from('offerings').select('rating_sum,rating_count').eq('id', id).limit(1));
    const n = r?.rating_count || 0;
    return { ok: true, count: n, avg: n ? Math.round((r.rating_sum / n) * 10) / 10 : 0 };
  }

  if (!own) await run(db.rpc('bump_offering', { p_id: id, p_field: kind === 'view' ? 'views' : 'clicks' }));
  return { ok: true };
}
