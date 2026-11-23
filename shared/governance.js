export const PROFILE_TAGS = {
  'profile-creator': 'Profile Creator',
  university: 'University', hospital: 'Hospital', special: 'Special', hero: 'Hero',
  contributors: 'Contributors', standard: 'Standard', founders: 'Founders',
  god: 'God', fraud: 'Fraud', scammer: 'Scammer', 'narration-setter': 'Narration Setter',
  'gov-departments': 'Gov-Departments', 'commercial-enterprises': 'Commercial/Enterprises',
  community: 'Community', manufacturer: 'Manufacturer', private: 'Private profile',
};
export const SUGGESTION_KINDS = { add: 'Add', remove: 'Remove', update: 'Update' };
export const SUGGESTION_STATUSES = ['new', 'reviewed', 'planned', 'done', 'declined'];

export const customTagKey = tag => typeof tag === 'string' && tag.length <= 64 && /^custom-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag);
export const tagLabel = (key, definitions = []) => definitions.find(tag => tag.key === key)?.label || PROFILE_TAGS[key] || key.replace(/^custom-/, '').replace(/-/g, ' ');
export const publicTags = (tags = [], definitions = []) => tags.filter(key => key !== 'profile-creator' && (Object.hasOwn(PROFILE_TAGS,key) || definitions.some(tag => tag.key===key && tag.visibility!=='internal')));
export const isPrivateProfile = account => account?.profile_private === true || account?.tags?.includes('private');

export function normalizeTags(tags = [], definitions = []) {
  if (!Array.isArray(tags)) throw new Error('Tags must be an array.');
  if (tags.length > 20) throw new Error('Choose up to 20 profile tags.');
  if (tags.some(tag => !Object.hasOwn(PROFILE_TAGS, tag) && !(customTagKey(tag) && definitions.some(definition => definition.key === tag)))) throw new Error('Unknown profile tag.');
  return [...new Set(tags)];
}

export function canViewProfile(account, viewer = null) {
  if (account?.approval_status && account.approval_status !== 'approved') return false;
  if (account?.workspace_status && account.workspace_status !== 'active') return false;
  if (!account || (account.locked_until && new Date(account.locked_until) > new Date())) return false;
  // Unknown or malformed tag data fails closed.
  if (account.tags != null && (!Array.isArray(account.tags) || account.tags.some(tag => !Object.hasOwn(PROFILE_TAGS, tag) && !customTagKey(tag)))) return false;
  if (account.tags?.some(customTagKey) && typeof account.profile_private !== 'boolean') return false;
  return !isPrivateProfile(account) || viewer?.id === account.id || viewer?.isSuperAdmin === true;
}
