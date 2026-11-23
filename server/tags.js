import { randomUUID } from 'node:crypto';
import { raw } from './supabase.js';
import { HttpError } from './http.js';
import { requirePlatformPermission } from './rbac.js';
import { ALL_PERMISSIONS, normalizePermissions, normalizePlatformPermissions } from '../shared/rbac.js';
import { PROFILE_TAGS } from '../shared/governance.js';
const columns = 'key,label,visibility';
const masterColumns = `${columns},permissions,platform_permissions`;
async function result(query) {
  const { data, error } = await query;
  if (error?.code === '23505') throw new HttpError(409, 'A tag with that name already exists.');
  if (error) throw new HttpError(503, 'Profile tags could not be saved or loaded. Apply the master-rbac database migration and try again.');
  return data || [];
}
export function createTagService(database = raw) {
  return {
    list: (internal = false) => result(internal ? database().from('profile_tags').select(columns).order('label') : database().from('profile_tags').select(columns).in('visibility',['public','private']).order('label')),
    async assignable(user) {
      requirePlatformPermission(user, 'profiles.edit');
      const tags = await result(database().from('profile_tags').select(masterColumns).order('label'));
      return user.isSuperAdmin ? tags : tags.filter(tag => !(tag.platform_permissions?.length)).map(({ key, label, visibility }) => ({ key, label, visibility }));
    },
    async master(user) {
      requirePlatformPermission(user, 'master.manage');
      return result(database().from('profile_tags').select(masterColumns).order('label'));
    },
    async create(user, input = {}) {
      requirePlatformPermission(user, 'master.manage');
      if (!user.isSuperAdmin && input.platformPermissions !== undefined) throw new HttpError(403, 'Only Superadmin can grant platform access.');
      const label = typeof input.label === 'string' ? input.label.trim() : '';
      if (!label || label.length > 40 || !['public','private','internal'].includes(input.visibility)) throw new HttpError(400,'Enter a tag name up to 40 characters and choose a visibility.');
      let permissions, platform_permissions;
      try { permissions = normalizePermissions(input.permissions ?? ALL_PERMISSIONS); platform_permissions=normalizePlatformPermissions(input.platformPermissions); } catch (error) { throw new HttpError(400, error.message); }
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/g, '') || randomUUID().slice(0, 8);
      const [tag] = await result(database().from('profile_tags').insert({ key: `custom-${slug}`, label, visibility: input.visibility, permissions, platform_permissions }).select(masterColumns));
      if (!tag) throw new HttpError(503, 'The new tag could not be confirmed. Reload tags before trying again.');
      return tag;
    },
    async update(user, input = {}) {
      requirePlatformPermission(user, 'master.manage');
      if (!user.isSuperAdmin && input.platformPermissions !== undefined) throw new HttpError(403, 'Only Superadmin can grant platform access.');
      if (typeof input.key !== 'string' || input.key.length > 64) throw new HttpError(400, 'Choose a valid tag.');
      const updates = {};
      if (input.platformPermissions !== undefined) { try { updates.platform_permissions=normalizePlatformPermissions(input.platformPermissions); } catch(error) { throw new HttpError(400,error.message); } }
      if (input.permissions !== undefined) {
        try { updates.permissions = normalizePermissions(input.permissions); } catch (error) { throw new HttpError(400, error.message); }
      }
      if (input.label !== undefined || input.visibility !== undefined) {
        if (Object.hasOwn(PROFILE_TAGS, input.key)) throw new HttpError(400, 'This tag’s name and visibility are fixed. Its feature permissions can be changed.');
        if (typeof input.label !== 'string' || !input.label.trim() || input.label.trim().length > 40 || !['public','private','internal'].includes(input.visibility)) throw new HttpError(400, 'Enter a name up to 40 characters and choose a valid visibility.');
        Object.assign(updates, { label: input.label.trim(), visibility: input.visibility });
      }
      if (!Object.keys(updates).length) throw new HttpError(400, 'Choose changes to save.');
      const [tag] = await result(database().from('profile_tags').update(updates).eq('key', input.key).select(masterColumns));
      if (!tag) throw new HttpError(404, 'Tag not found. Refresh Master and try again.');
      return tag;
    },
  };
}
