import { raw, run } from './supabase.js';
import { HttpError } from './http.js';
import { resolvePermissions, hasPermission, operationPermissions, FEATURE_PERMISSIONS, normalizePlatformPermissions, hasPlatformPermission, PLATFORM_OPERATIONS } from '../shared/rbac.js';

export function requirePlatformPermission(user, permission) {
  if (!hasPlatformPermission(user, permission)) throw new HttpError(403, 'This Superadmin feature has not been enabled for your account.');
}
export function authorizePlatformOperation(user, op) {
  if (user?.isSuperAdmin) return;
  const permission = PLATFORM_OPERATIONS[op];
  if (!permission) throw new HttpError(403, 'Superadmin access is required.');
  requirePlatformPermission(user, permission);
}

export async function loadPermissions(user, database = raw()) {
  if (user.isSuperAdmin) return { ...user, permissions: [] };
  const tags = user.tags || [];
  const definitions = await run(database.from('profile_tags').select('key,permissions,platform_permissions').in('key', tags.length ? tags : ['standard']));
  const grants = [...(user.platformPermissions || []), ...definitions.flatMap(tag => tag.platform_permissions || [])];
  return { ...user, permissions: resolvePermissions(tags, definitions), platformPermissions: normalizePlatformPermissions(grants) };
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
