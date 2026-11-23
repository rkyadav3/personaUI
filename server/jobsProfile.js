import { raw, run, paged } from './supabase.js';
import { HttpError } from './http.js';
import { hasPermission, hasPlatformPermission } from '../shared/rbac.js';
import { isJobsProfile, isJobsProfileAccount, normalizeJobsProfileSection, normalizeJobsHome, visibleJobsProfile, resolveJobsProfilePermissions } from '../shared/jobsProfile.js';
import { listUsersDetailed } from './invites.js';

const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
const checked = fn => { try { return fn(); } catch (error) { throw new HttpError(400, error.message); } };
function requireOwner(ctx) {
  if (!isJobsProfile(ctx.user) || !hasPermission(ctx.user, 'profile') || !ctx.db?.uid || ctx.workspace && !['owner', 'admin'].includes(ctx.workspace.role)) throw new HttpError(403, 'Open your Jobs Profile as its owner or administrator.');
}
export async function getJobsProfile(ctx) {
  requireOwner(ctx);
  const [document] = await run(ctx.db.from('jobs_profiles').select('*').limit(1));
  const saved = document || { sections: {}, home: normalizeJobsHome(), published: false, version: 0 };
  return { ...visibleJobsProfile(saved, 'owner', ctx.user.jobsProfilePermissions || []), published: saved.published, version: saved.version, enabledSections: ctx.user.jobsProfilePermissions || [] };
}
export async function saveJobsProfile(ctx, input = {}) {
  requireOwner(ctx);
  if (!Number.isInteger(input.version) || input.version < 0) throw new HttpError(400, 'Reload your profile before saving.');
  const section = input.section;
  if (section !== 'home' && !ctx.user.jobsProfilePermissions?.includes(section)) throw new HttpError(403, 'This Jobs Profile section is hidden by your role permissions.');
  const value = checked(() => section === 'home' ? normalizeJobsHome(input.value) : normalizeJobsProfileSection(section, input));
  if (input.published !== undefined && (section !== 'home' || typeof input.published !== 'boolean')) throw new HttpError(400, 'Choose Publish or Unpublish in the Home page editor.');
  const { data, error } = await ctx.db.rpc('save_jobs_profile', { p_actor: ctx.user.id, p_section: section, p_value: value, p_version: input.version, p_published: input.published ?? null });
  if (error) throw new HttpError(/changed/i.test(error.message) ? 409 : /access|permission|hidden|approved/i.test(error.message) ? 403 : 400, /changed/i.test(error.message) ? 'Your profile changed in another editor. Reload the saved profile before saving; your draft is still here.' : 'Your profile could not be saved. Check your access and the Jobs Profile migration.');
  if (!data) throw new HttpError(503, 'The saved profile could not be confirmed. Reload before trying again.');
  return { ...visibleJobsProfile(data, 'owner', ctx.user.jobsProfilePermissions || []), published: data.published, version: data.version, enabledSections: ctx.user.jobsProfilePermissions || [] };
}
export async function jobsProfileGrants(ownerId, database = raw(), audience = 'owner') {
  const [account] = await run(database.from('users').select('tags,profile_type,job_seeker,profile_private,approval_status,workspace_status,locked_until').eq('id', ownerId).limit(1));
  if (!account || !(account.job_seeker || account.profile_type === 'jobs') || account.approval_status !== 'approved' || account.workspace_status && account.workspace_status !== 'active' || account.locked_until && Date.parse(account.locked_until) > Date.now() || audience !== 'owner' && account.profile_private) return null;
  const tags = account.tags?.length ? account.tags : ['standard'];
  const definitions = await run(database.from('profile_tags').select('key,permissions,jobs_profile_permissions').in('key', tags));
  if (!tags.some(key => definitions.find(tag => tag.key === key)?.permissions?.includes('job_seeker')) && !tags.every(key => definitions.find(tag => tag.key === key)?.permissions?.includes('profile'))) return null;
  return resolveJobsProfilePermissions(tags, definitions);
}
export async function publicJobsProfile(ownerId, slug, database = raw()) {
  const [document] = await run(database.from('jobs_profiles').select('sections,home,published').eq('owner_id', ownerId).limit(1));
  if (!document?.published) return null;
  const enabled = await jobsProfileGrants(ownerId, database, 'public');
  if (!enabled) return null;
  const result = visibleJobsProfile(document, 'public', enabled);
  return { ...result, slug, name: result.sections.basics?.value.name || result.home.title || 'Jobs Profile' };
}
export async function reviewJobsProfile(user, input, database = raw()) {
  if (!hasPlatformPermission(user, 'profiles.review')) throw new HttpError(403, 'Jobs Profile review access is required.');
  if (!uuid(input.id)) throw new HttpError(400, 'Choose a valid Jobs Profile.');
  const [document] = await run(database.from('jobs_profiles').select('sections,home').eq('owner_id', input.id).limit(1));
  if (!document) throw new HttpError(404, 'Jobs Profile details have not been saved yet.');
  const enabled = await jobsProfileGrants(input.id, database);
  if (!enabled) throw new HttpError(404, 'Jobs Profile access is disabled or the profile is unavailable.');
  return visibleJobsProfile(document, 'owner', enabled);
}
export async function listJobsProfileReviews(user, database = raw()) {
  const canEdit = hasPlatformPermission(user, 'profiles.edit');
  if (!canEdit && !hasPlatformPermission(user, 'profiles.review')) throw new HttpError(403, 'Jobs Profile account or review access is required.');
  const [accounts, tags, documents] = await Promise.all([
    canEdit ? listUsersDetailed(user, () => database, true) : paged(database, 'users', 'id,name,email,slug,tags,profile_type,job_seeker,approval_status', q => q.order('created_at', { ascending: false }).order('id', { ascending: false })),
    run(database.from('profile_tags').select('key,label,visibility,permissions,platform_permissions')),
    paged(database, 'jobs_profiles', 'owner_id'),
  ]);
  const saved = new Set(documents.map(document => document.owner_id));
  return {
    profiles: accounts.filter(account => (canEdit || isJobsProfileAccount(account, tags)) && !account.isSuperAdmin && (canEdit || account.approval_status === 'approved')).slice(0, 500).map(account => ({ ...(canEdit ? account : { id: account.id, name: account.name, email: account.email, slug: account.slug, approval_status: account.approval_status }), hasDetails: saved.has(account.id) })),
    tags: canEdit ? tags.filter(tag => user.isSuperAdmin || !tag.platform_permissions?.length).map(({ key, label, visibility }) => ({ key, label, visibility })) : [],
  };
}
export async function applicationJobsProfile(ctx, input, database = raw()) {
  if (!hasPermission(ctx.user, 'enquiries') || ctx.workspace && !['owner', 'admin'].includes(ctx.workspace.role)) throw new HttpError(403, 'Inbox administrator access is required.');
  if (!/^\d+$/.test(String(input.id))) throw new HttpError(400, 'Choose a valid application.');
  const [application] = await run(ctx.db.from('enquiries').select('job_id,applicant_profile_owner').eq('id', input.id).limit(1));
  if (!application?.job_id || !application.applicant_profile_owner) throw new HttpError(404, 'No Jobs Profile was shared with this application.');
  const [document] = await run(database.from('jobs_profiles').select('sections,home').eq('owner_id', application.applicant_profile_owner).limit(1));
  if (!document) throw new HttpError(404, 'The applicant profile is no longer available.');
  const enabled = await jobsProfileGrants(application.applicant_profile_owner, database, 'applied_jobs');
  if (!enabled) throw new HttpError(404, 'Jobs Profile access is disabled or the profile is unavailable.');
  return visibleJobsProfile(document, 'applied_jobs', enabled);
}
