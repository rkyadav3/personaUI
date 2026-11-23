import bcrypt from 'bcryptjs';
import { raw, run } from './supabase.js';
import { isSuperAdminEmail } from './auth.js';
import { hasPlatformPermission, PROFILE_TYPES } from '../shared/rbac.js';
import { HttpError } from './http.js';
import { isJobsProfileAccount } from '../shared/jobsProfile.js';
export function needProfileCreator(user) {
  if (!hasPlatformPermission(user, 'profiles.create'))
    throw new HttpError(403, 'Profile creation access is required.');
}
export function createProfileCreationService(database = raw) {
  return {
    async list(user) {
      needProfileCreator(user);
      const db = database();
      let query = db
        .from('users')
        .select('id,name,email,slug,tags,profile_type,job_seeker,approval_status,profile_created_by,created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (!user.isSuperAdmin) query = query.eq('profile_created_by', user.id);
      const [users, tags] = await Promise.all([run(query), run(db.from('profile_tags').select('key,permissions'))]);
      return { users: users.filter(person => !isJobsProfileAccount(person, tags)) };
    },
    async create(user, input = {}) {
      needProfileCreator(user);
      const name = String(input.name || '').trim(),
        email = String(input.email || '')
          .trim()
          .toLowerCase(),
        slug = String(input.slug || '')
          .trim()
          .toLowerCase();
      if (
        !name ||
        name.length > 120 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        email.length > 160 ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
        slug.length < 3 ||
        slug.length > 40 ||
        !Object.hasOwn(PROFILE_TYPES, input.type)
      )
        throw new HttpError(400, 'Enter a name, valid email, username and profile type.');
      if (isSuperAdminEmail(email))
        throw new HttpError(403, 'Platform owner accounts cannot be created here.');
      if (
        typeof input.password !== 'string' ||
        input.password.length < 8 ||
        Buffer.byteLength(input.password) > 72
      )
        throw new HttpError(400, 'Use a password of at least 8 characters and no more than 72 bytes.');
      const hash = await bcrypt.hash(input.password, 12);
      const { data, error } = await database().rpc('create_admin_profile', {
        p_actor: user.id,
        p_owner: user.isSuperAdmin === true,
        p_name: name,
        p_email: email,
        p_slug: slug,
        p_type: input.type,
        p_hash: hash,
      });
      if (error)
        throw new HttpError(
          error.code === '23505' ? 409 : 400,
          error.code === '23505'
            ? 'This email or username is already in use.'
            : 'Profile creation failed. Check your access and the profile creation migration.'
        );
      return data;
    },
    async approve(user, input) {
      if (!user?.isSuperAdmin) throw new HttpError(403, 'Only Superadmin can approve profiles.');
      if (!['approve', 'reject'].includes(input.action))
        throw new HttpError(400, 'Choose approve or reject.');
      const rows = await run(
        database()
          .from('users')
          .update({
            approval_status: input.action === 'approve' ? 'approved' : 'rejected',
            profile_approved_by: user.id,
          })
          .eq('id', input.id)
          .eq('approval_status', 'pending')
          .select('id,approval_status')
      );
      if (!rows.length) throw new HttpError(409, 'This profile is no longer pending. Refresh Profiles.');
      return rows[0];
    },
  };
}
