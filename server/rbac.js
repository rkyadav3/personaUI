import { raw, run } from './supabase.js';
import { HttpError } from './http.js';
import { resolvePermissions, hasPermission, operationPermissions, FEATURE_PERMISSIONS } from '../shared/rbac.js';

export async function loadPermissions(user, database = raw()) {
  if (user.isSuperAdmin) return { ...user, permissions: [] };
  const tags = user.tags || [];
  const definitions = await run(database.from('profile_tags').select('key,permissions').in('key', tags.length ? tags : ['standard']));
  return { ...user, permissions: resolvePermissions(tags, definitions) };
}

export function requireOperationPermissions(user, op) {
  if (user.isSuperAdmin) return;
  const missing = operationPermissions(op).filter(permission => !hasPermission(user, permission));
  if (missing.length) throw new HttpError(403, `Your profile tags do not allow ${missing.map(key => FEATURE_PERMISSIONS[key]).join(', ')}. Contact platform support to request access.`);
}

export function requireAssetPermission(user, purpose) {
  if (!user) return; // Internal services already enforce their feature boundary.
  const permitted = purpose === 'delivery' ? hasPermission(user, 'commerce') : ['profile', 'content', 'commerce'].some(key => hasPermission(user, key));
  if (!permitted) throw new HttpError(403, 'Your profile tags do not allow this file feature. Contact platform support to request access.');
}

export function requireFeaturePermission(user, permission) {
  if (user && !hasPermission(user, permission)) throw new HttpError(403, `Your profile tags do not allow ${FEATURE_PERMISSIONS[permission]}. Contact platform support to request access.`);
}
