import bcrypt from 'bcryptjs';
import { login, publicUser } from './auth.js';
import { raw, run } from './supabase.js';
import { HttpError } from './http.js';

export async function changeAccount(user, args, db = raw()) {
  if (!user?.id) throw new HttpError(401, 'Sign in to change your account.');
  if (!args || !['password', 'userId'].includes(args.kind)) throw new HttpError(400, 'Choose password or user ID.');
  if (typeof args.currentPassword !== 'string' || !args.currentPassword || Buffer.byteLength(args.currentPassword) > 72) throw new HttpError(400, 'Enter your current password.');
  let passwordHash = null, slug = null;
  if (args.kind === 'password') {
    if (typeof args.password !== 'string' || args.password.length < 8 || Buffer.byteLength(args.password) > 72) throw new HttpError(400, 'Use at least 8 characters and no more than 72 bytes for your new password.');
    if (args.password !== args.confirm) throw new HttpError(400, 'The new passwords do not match.');
    if (args.password === args.currentPassword) throw new HttpError(400, 'Choose a password different from your current password.');
  } else {
    slug = typeof args.userId === 'string' ? args.userId.trim().toLowerCase() : '';
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 3 || slug.length > 40) throw new HttpError(400, 'Use 3–40 lowercase letters, numbers or single hyphens for your user ID.');
  }
  const [current] = await run(db.from('users').select('*').eq('id', user.id));
  if (!current) throw new HttpError(401, 'Your account is no longer available.');
  // Reuse the same database-backed failed-password counter as sign-in.
  const verified = await login({ email: current.email, password: args.currentPassword }, db);
  if (!verified.user) throw new HttpError(403, verified.error);
  if (args.kind === 'password') passwordHash = await bcrypt.hash(args.password, 12);
  const { data, error } = await db.rpc('change_own_account', {
    p_user: user.id, p_expected_hash: current.password_hash,
    p_password_hash: passwordHash, p_slug: slug,
  });
  if (error) {
    if (error.code === '23505') throw new HttpError(409, 'That user ID is already taken. Choose another.');
    throw new HttpError(error.code === 'P0001' ? 409 : 500, error.code === 'P0001' ? error.message : 'Account changes could not be saved. Check the account-settings database setup and try again.');
  }
  if (!data?.id) throw new HttpError(500, 'The account change could not be confirmed. Reload before trying again.');
  return { user: publicUser(data), passwordChanged: args.kind === 'password' };
}
