import { randomUUID } from 'node:crypto';
import { raw } from './supabase.js';
import { HttpError } from './http.js';
import { needSuperAdmin } from './governance.js';
const columns = 'key,label,visibility';
async function result(query) {
  const { data, error } = await query;
  if (error?.code === '23505') throw new HttpError(409, 'A tag with that name already exists.');
  if (error) throw new HttpError(503, 'Profile tags could not be saved or loaded. Check the admin-experience database setup and try again.');
  return data || [];
}
export function createTagService(database = raw) {
  return {
    list: () => result(database().from('profile_tags').select(columns).order('label')),
    async create(user, input = {}) {
      needSuperAdmin({ user });
      const label = typeof input.label === 'string' ? input.label.trim() : '';
      if (!label || label.length > 40 || !['public', 'private'].includes(input.visibility)) throw new HttpError(400, 'Enter a tag name up to 40 characters and choose Public or Private visibility.');
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/g, '') || randomUUID().slice(0, 8);
      const [tag] = await result(database().from('profile_tags').insert({ key: `custom-${slug}`, label, visibility: input.visibility }).select(columns));
      if (!tag) throw new HttpError(503, 'The new tag could not be confirmed. Reload tags before trying again.');
      return tag;
    },
  };
}
