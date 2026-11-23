export const FEATURE_PERMISSIONS = {
  profile: 'Profile & public page',
  content: 'Content, files & activity',
  knowledge: 'AI knowledge & visitor Q&A',
  commerce: 'Store, orders & payments',
  enquiries: 'Enquiries',
  community: 'Invites & suggestions',
  jobs: 'Jobs & applications',
};
export const ALL_PERMISSIONS = Object.keys(FEATURE_PERMISSIONS);
export const PROFILE_TYPES = { individual: 'Individual', organisation: 'Organisation' };
export const PLATFORM_PERMISSIONS = {
  'profiles.create': 'Create profiles',
  'profiles.edit': 'Edit profiles & assign tags',
  'master.manage': 'Manage tags & feature permissions',
};
export const PLATFORM_OPERATIONS = {
  'platform.profiles.list': 'profiles.create',
  'platform.profiles.create': 'profiles.create',
  'users.list': 'profiles.edit',
  'users.update': 'profiles.edit',
  'platform.master.get': 'master.manage',
  'platform.tags.create': 'master.manage',
  'platform.tags.update': 'master.manage',
};
export function normalizePlatformPermissions(value = []) {
  if (!Array.isArray(value) || value.some(key => !Object.hasOwn(PLATFORM_PERMISSIONS,key))) throw new Error('Choose valid Superadmin feature access.');
  return Object.keys(PLATFORM_PERMISSIONS).filter(key => value.includes(key));
}
export const hasPlatformPermission = (user,key) => !!user && (user.isSuperAdmin === true || user.platformPermissions?.includes(key) === true);
export const hasPlatformAccess = user => Object.keys(PLATFORM_PERMISSIONS).some(key => hasPlatformPermission(user, key));
export function canOpenPlatformRoute(user, path) {
  if (user?.isSuperAdmin) return true;
  if (['/superadmin/profiles', '/superadmin/customers'].includes(path)) return ['profiles.create', 'profiles.edit'].some(key => hasPlatformPermission(user, key));
  return path === '/superadmin/master' && hasPlatformPermission(user, 'master.manage');
}
export const platformHome = user => user?.isSuperAdmin ? '/superadmin' : hasPlatformPermission(user, 'profiles.create') || hasPlatformPermission(user, 'profiles.edit') ? '/superadmin/profiles' : '/superadmin/master';

export function normalizePermissions(value) {
  if (!Array.isArray(value) || value.some(key => !Object.hasOwn(FEATURE_PERMISSIONS, key))) throw new Error('Choose valid feature permissions.');
  return ALL_PERMISSIONS.filter(key => value.includes(key));
}

// Every assigned tag must allow a feature. Missing definitions fail closed.
export function resolvePermissions(tags, definitions) {
  if (!Array.isArray(tags)) return [];
  const keys = tags.length ? tags : ['standard'];
  return ALL_PERMISSIONS.filter(permission => keys.every(key => {
    const definition = definitions.find(tag => tag.key === key);
    return Array.isArray(definition?.permissions) && definition.permissions.includes(permission);
  }));
}

export function hasPermission(user, permission) {
  if (!user || user.isSuperAdmin) return false;
  // Untagged sessions from before RBAC retain the existing Studio access.
  const permissions = user.permissions ?? (user.tags?.length ? [] : ALL_PERMISSIONS);
  return Array.isArray(permissions) && permissions.includes(permission);
}

export function operationPermissions(op) {
  if (op === 'jobs.resume') return ['enquiries'];
  if (/^jobs\./.test(op)) return ['jobs'];
  if (op === 'workspace.setup') return ['profile'];
  if (/^(profile\.|site\.|page\.)/.test(op)) return ['profile'];
  if (/^(content\.|files\.|folders\.|topics\.|posts\.|templates\.|updates\.|events\.)/.test(op)) return ['content'];
  if (/^(index\.|chat\.|knowledge\.|integrations\.)/.test(op)) return ['knowledge'];
  if (/^(items\.|contributions\.|offerings\.|purchases\.|payments\.)/.test(op)) return ['commerce'];
  if (/^enquiries\./.test(op)) return ['enquiries'];
  if (/^(invites\.|suggestions\.|team\.)/.test(op)) return ['community'];
  // These tools aggregate several areas. Requiring all permissions prevents
  // the assistant and shared asset tools from bypassing a disabled feature.
  if (/^(studio\.|activity\.|webhooks\.)/.test(op) || ['overview', 'data.export'].includes(op)) return ALL_PERMISSIONS;
  return [];
}

export function routePermissions(pathname, search = '') {
  if (!pathname.startsWith('/admin')) return [];
  const route = pathname.split('/')[2];
  const tab = new URLSearchParams(search).get('tab');
  if (route === 'settings') return tab === 'account' ? [] : [['payments', 'settings'].includes(tab) ? 'commerce' : 'profile'];
  const permissions = {
    profile: ['profile'], portfolio: ['profile'], page: ['profile'],
    store: ['commerce'], purchases: ['commerce'],
    writing: ['content'], templates: ['content'], topics: ['content'], files: ['content'], add: ['content'], activity: ['content'], updates: ['content'],
    knowledge: ['knowledge'], questions: ['knowledge'], enquiries: ['enquiries'],
    invites: ['community'], suggestions: ['community'], team: ['community'],
    integrations: ['knowledge'], webhooks: ALL_PERMISSIONS, export: ALL_PERMISSIONS,
    jobs: ['jobs'],
  };
  return permissions[route] || [];
}

export const canOpenRoute = (user, to) => {
  const [pathname, search = ''] = to.split('?');
  return routePermissions(pathname, search).every(permission => hasPermission(user, permission));
};
