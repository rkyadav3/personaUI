export const FEATURE_PERMISSIONS = {
  profile: 'Profile & public page',
  content: 'Content, files & activity',
  knowledge: 'AI knowledge & visitor Q&A',
  commerce: 'Store, orders & payments',
  enquiries: 'Enquiries',
  community: 'Invites & suggestions',
};
export const ALL_PERMISSIONS = Object.keys(FEATURE_PERMISSIONS);
export const PROFILE_TYPES = { individual: 'Individual', organisation: 'Organisation' };

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
  if (/^(profile\.|site\.|page\.)/.test(op)) return ['profile'];
  if (/^(content\.|files\.|folders\.|topics\.|posts\.|templates\.|updates\.|events\.)/.test(op)) return ['content'];
  if (/^(index\.|chat\.)/.test(op)) return ['knowledge'];
  if (/^(items\.|contributions\.|offerings\.|purchases\.|payments\.)/.test(op)) return ['commerce'];
  if (/^enquiries\./.test(op)) return ['enquiries'];
  if (/^(invites\.|suggestions\.)/.test(op)) return ['community'];
  // These tools aggregate several areas. Requiring all permissions prevents
  // the assistant and shared asset tools from bypassing a disabled feature.
  if (/^(studio\.|activity\.)/.test(op) || op === 'overview') return ALL_PERMISSIONS;
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
    invites: ['community'], suggestions: ['community'],
  };
  return permissions[route] || [];
}

export const canOpenRoute = (user, to) => {
  const [pathname, search = ''] = to.split('?');
  return routePermissions(pathname, search).every(permission => hasPermission(user, permission));
};
