import { isSuperAdminEmail } from './auth.js';
import { createHmac } from 'node:crypto';
import { raw } from './supabase.js';
import { HttpError } from './http.js';
import { canViewProfile } from '../shared/governance.js';

export async function query(promise) {
  const { data, error } = await promise;
  if (error) {
    if (['42P01', '42703', 'PGRST205', 'PGRST202'].includes(error.code)) throw new HttpError(503, 'Events and checkout are not available yet. The profile owner needs to complete setup.');
    if (error.code === 'P0001') throw new HttpError(/Too many/i.test(error.message) ? 429 : /closed|accepting/i.test(error.message) ? 403 : 409, error.message);
    throw Object.assign(new HttpError(500, 'The request could not be saved. Please try again.'), { code: error.code });
  }
  return data;
}

export function createPublicRepository(database = raw) {
  async function accountOwner(slug) {
    const [user] = await query(database().from('users').select('id,email,slug,name,tags,profile_private,locked_until').eq('slug', slug).limit(1));
    return isSuperAdminEmail(user?.email) ? null : user || null;
  }
  async function owner(slug) {
    const user = await accountOwner(slug);
    if (!canViewProfile(user)) return null;
    const profile = (await query(database().from('profiles').select('*').eq('owner_id', user.id).eq('status', 'published').limit(1)))[0];
    return profile ? { ...user, profile } : null;
  }
  async function claim(ownerId, kind, ip) {
    const secret = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_KEY;
    if (!secret) throw new HttpError(503, 'The server needs to complete setup before accepting submissions.');
    const hash = createHmac('sha256', secret).update(`${ownerId}:${String(ip || 'anon').slice(0, 128)}`).digest('hex');
    await query(database().rpc('claim_public_action', { p_owner: ownerId, p_kind: kind, p_ip_hash: hash, p_limit: kind === 'rsvp' ? 20 : 15 }));
  }
  return { owner, accountOwner, claim };
}
