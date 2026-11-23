import { raw, run } from './supabase.js';
import { HttpError } from './http.js';
import { PROFILE_TYPES } from '../shared/rbac.js';

export async function chooseProfileType(user, input = {}, database = raw()) {
  if (!user?.id || user.isSuperAdmin) throw new HttpError(403, 'Choose a profile type from your own account.');
  if (!Object.hasOwn(PROFILE_TYPES, input.type)) throw new HttpError(400, 'Choose Individual, Organisation or Jobs Profile.');
  const result = await run(database.rpc('choose_profile_type', { p_user: user.id, p_type: input.type }));
  if (!result?.profile_type) throw new HttpError(503, 'The profile type could not be saved. Apply the master-rbac database migration and try again.');
  return { profileType: result.profile_type };
}
