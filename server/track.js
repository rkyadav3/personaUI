// Visitor events for the home page rails: profile views, offering views, buy/enquire clicks and star ratings.
// Visitors are anonymous, so this is deliberately light: counters only, no IPs stored (ratings keep a salted hash so one
// visitor gets one vote per offering), and a member's own visits and votes never count.
import { createHash } from 'node:crypto';
import { sessionUser } from './auth.js';
import { raw, run } from './supabase.js';
import { normalizePage } from '../shared/pageSettings.js';
import { normalizeVisibility } from './profile.js';
import { canViewProfile } from '../shared/governance.js';
const SLUG = s => String(s || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
const intId = v => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
export const voterHash = (ip, ua) => createHash('sha256').update(`${process.env.SESSION_SECRET || ''}|${ip}|${ua || ''}`).digest('hex').slice(0, 32);

/** Returns { ok, avg?, count?, error? }. Unknown or inactive targets are ignored quietly. */
export function createTracker({
  db,
  sessionUser: getUser = sessionUser
}) {
  return async function record(body, {
    req,
    ip,
    ua
  }) {
    const kind = body?.kind;
    const me = await getUser(req).catch(() => null);
    if (kind === 'profile') {
      const [u] = await run(db.from('users').select('id,tags,profile_private,locked_until').eq('slug', SLUG(body.slug)).limit(1));
      if (canViewProfile(u) && u.id !== me?.id) await run(db.rpc('bump_profile_view', {
        p_owner: u.id
      }));
      return {
        ok: true
      };
    }
    const id = intId(body?.id);
    if (!id || !['view', 'click', 'rate'].includes(kind)) return {
      ok: false,
      error: 'Bad request.'
    };
    const stars = Number(body.stars);
    if (kind === 'rate' && (!Number.isInteger(stars) || stars < 1 || stars > 5)) return {
      ok: false,
      error: 'Pick 1 to 5 stars.'
    };
    const [o] = await run(db.from('offerings').select('id,owner_id,contribution_id,active').eq('id', id).limit(1));
    if (!o || !o.active) return {
      ok: true
    };
    const own = o.owner_id === me?.id;
    if (own) return kind === 'rate' ? {
      ok: false,
      error: "You can't rate your own offering."
    } : {
      ok: true
    };

    // An active offering is public only while its profile, category and shop are also public.
    const [profile] = await run(db.from('profiles').select('id,visibility,users!inner(id,tags,profile_private,locked_until)').eq('owner_id', o.owner_id).eq('status', 'published').limit(1));
    if (!profile || !canViewProfile(profile.users) || !normalizeVisibility(profile.visibility).contributions) return {
      ok: true
    };
    const [category] = await run(db.from('contributions').select('category').eq('id', o.contribution_id).eq('owner_id', o.owner_id).eq('enabled', true).eq('visible', true).limit(1));
    if (!category) return {
      ok: true
    };
    const [site] = await run(db.from('site_settings').select('page').eq('owner_id', o.owner_id).limit(1));
    const page = normalizePage(site?.page);
    if (!page.sections.store || page.placement[category.category] === 'hidden') return {
      ok: true
    };
    if (kind === 'rate') {
      await run(db.rpc('rate_offering', {
        p_id: id,
        p_voter: voterHash(ip, ua),
        p_stars: stars
      }));
      const [r] = await run(db.from('offerings').select('rating_sum,rating_count').eq('id', id).limit(1));
      const n = r?.rating_count || 0;
      return {
        ok: true,
        count: n,
        avg: n ? Math.round(r.rating_sum / n * 10) / 10 : 0
      };
    }
    await run(db.rpc('bump_offering', {
      p_id: id,
      p_field: kind === 'view' ? 'views' : 'clicks'
    }));
    return {
      ok: true
    };
  };
}
export const track = (body, meta) => createTracker({
  db: raw()
})(body, meta);
