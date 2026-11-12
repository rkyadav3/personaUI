export const PROFILE_TAGS = { hero: 'Hero', special: 'Special', private: 'Private profile' };
export const SUGGESTION_KINDS = { add: 'Add', remove: 'Remove', update: 'Update' };
export const SUGGESTION_STATUSES = ['new', 'reviewed', 'planned', 'done', 'declined'];

export const customTagKey = tag => typeof tag === 'string' && tag.length <= 64 && /^custom-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag);
export const tagLabel = (key, definitions = []) => definitions.find(tag => tag.key === key)?.label || PROFILE_TAGS[key] || key.replace(/^custom-/, '').replace(/-/g, ' ');
export const isPrivateProfile = account => account?.profile_private === true || account?.tags?.includes('private');

export function normalizeTags(tags = [], definitions = []) {
  if (!Array.isArray(tags)) throw new Error('Tags must be an array.');
  if (tags.length > 20) throw new Error('Choose up to 20 profile tags.');
  if (tags.some(tag => !Object.hasOwn(PROFILE_TAGS, tag) && !(customTagKey(tag) && definitions.some(definition => definition.key === tag)))) throw new Error('Unknown profile tag.');
  return [...new Set(tags)];
}

export function canViewProfile(account, viewer = null) {
  if (!account || (account.locked_until && new Date(account.locked_until) > new Date())) return false;
  // Unknown or malformed tag data fails closed.
  if (account.tags != null && (!Array.isArray(account.tags) || account.tags.some(tag => !Object.hasOwn(PROFILE_TAGS, tag) && !customTagKey(tag)))) return false;
  if (account.tags?.some(customTagKey) && typeof account.profile_private !== 'boolean') return false;
  return !isPrivateProfile(account) || viewer?.id === account.id || viewer?.isSuperAdmin === true;
}
