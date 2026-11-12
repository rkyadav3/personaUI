// Self-service accounts: register, sign in, sign out. Passwords are hashed with bcrypt; 5 wrong passwords lock
// the account for 10 minutes (stored in the DB, so it holds across browsers). Sessions are signed JWTs in an
// httpOnly cookie.
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { env } from './config.js';
import { raw, run } from './supabase.js';

const COOKIE = 'persona_session', MAX_AGE = 60 * 60 * 24 * 7;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DUMMY = bcrypt.hashSync('dummy-password', 12);   // equalises timing for unknown emails

const secretKey = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('Set SESSION_SECRET (16+ random characters).');
  return new TextEncoder().encode(s);
};
const now = () => new Date();
const parse = ts => (ts ? new Date(ts) : null);

/** open = anyone, invite = needs a code, closed = no sign-ups. Default is invite. */
export function registrationMode() {
  if (['0', 'false', 'no', 'off', 'closed'].includes(String(env('ALLOW_REGISTRATION', 'true')).trim().toLowerCase())) return 'closed';
  const m = String(env('REGISTRATION_MODE', 'invite')).trim().toLowerCase();
  return ['open', 'invite', 'closed'].includes(m) ? m : 'invite';
}
export const isAdminEmail = email => {
  const adminList = String(env('ADMIN_EMAILS', '')).split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const superList = String(env('SUPERADMIN_EMAILS', '')).split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const all = [...new Set([...adminList, ...superList])];
  return all.includes((email || '').toLowerCase());
};
export const isSuperAdminEmail = email => {
  const configured = String(env('SUPERADMIN_EMAILS', '')).trim();
  const list = (configured || String(env('ADMIN_EMAILS', ''))).split(',').map(value => value.trim().toLowerCase());
  return Boolean(email) && list.includes(String(email).trim().toLowerCase());
};

export const normCode = code => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export async function checkInvite(code) {
  code = normCode(code);
  if (!code) return { error: 'An invite link or code is required to register.' };
  const [r] = await run(raw().from('invite_codes').select('*').eq('code', code));
  if (!r) return { error: "That invite link or code isn't valid." };
  if (r.revoked) return { error: 'This invite link has been revoked.' };
  const exp = parse(r.expires_at);
  if (exp && exp < now()) return { error: 'This invite link has expired.' };
  if ((r.uses || 0) >= (r.max_uses || 1)) return { error: 'This invite link has already reached its maximum uses.' };
  return { row: r };
}

/** Only succeeds if `uses` is still what we read, so two people can't both take the last use. */
export async function consumeInvite(r) {
  const rows = await run(raw().from('invite_codes').update({ uses: (r.uses || 0) + 1 }).eq('id', r.id).eq('uses', r.uses || 0).select());
  return rows.length > 0;
}

const slugFor = email =>
  `${(email.split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'user')}-${randomBytes(2).toString('hex')}`;

export const publicUser = u => ({
  id: String(u.id),
  email: u.email,
  name: u.name || null,
  slug: u.slug || null,
  isAdmin: !isSuperAdminEmail(u.email),
  isSuperAdmin: isSuperAdminEmail(u.email),
  role: isSuperAdminEmail(u.email) ? 'superadmin' : 'admin',
  tags: u.tags || []
});

export async function register({ name, email, password = '', confirm, invite }) {
  email = (email || '').trim().toLowerCase();
  const mode = registrationMode();
  if (mode === 'closed') return { error: 'Registration is currently closed.' };
  if (mode === 'invite') {
    if (!invite) return { error: 'Registration is by invitation only. Please use the invite link provided by the administrator.' };
  }
  if (!EMAIL_RE.test(email)) return { error: 'Enter a valid email address.' };
  if (isSuperAdminEmail(email)) return { error: 'This email is reserved for a platform owner. Owner accounts must be provisioned by the platform operator.' };
  if (password.length < 8) return { error: 'Use at least 8 characters for your password.' };
  if (Buffer.byteLength(password) > 72) return { error: 'Your password is too long (72 characters max).' };
  if (password !== confirm) return { error: "The passwords don't match." };
  const db = raw();
  let inv = null;
  if (invite || mode === 'invite') {
    const c = await checkInvite(invite);
    if (c.error) return { error: c.error };
    inv = c.row;
  }
  if ((await run(db.from('users').select('id').eq('email', email))).length) return { error: 'An account with that email already exists. Sign in instead.' };
  let row;
  try {
    const values = { email, name: (name || '').trim() || null, slug: slugFor(email), password_hash: bcrypt.hashSync(password, 12) };
    if (inv) [row] = await run(db.rpc('register_with_invite', { p_code: inv.code, p_email: values.email, p_name: values.name, p_slug: values.slug, p_password_hash: values.password_hash }));
    else [row] = await run(db.from('users').insert(values).select());
  } catch { return { error: "Couldn't create the account. The invite may have expired or been used up. Try again or request a new link." }; }
  return { user: publicUser(row) };
}

const lockedLogin = timestamp => {
  const mins = Math.floor((parse(timestamp) - now()) / 60000) + 1;
  return { error: mins > 60 * 24 ? 'This account has been suspended by a Super Admin. Please contact support.' : `Too many attempts. Try again in ${Math.max(1, mins)} minutes.` };
};

export async function login({ email, password = '' }, db = raw()) {
  email = (email || '').trim().toLowerCase();
  const [u] = await run(db.from('users').select('*').eq('email', email));
  if (!u) { bcrypt.compareSync(password.slice(0, 72), DUMMY); return { error: 'Wrong email or password.' }; }
  const locked = parse(u.locked_until);
  if (locked && locked > now()) return lockedLogin(u.locked_until);
  const { data, error } = await db.rpc('finalize_login', {
    p_user: u.id, p_email: email, p_password_hash: u.password_hash,
    p_matched: bcrypt.compareSync(password.slice(0, 72), u.password_hash),
  });
  if (error || !data) return { error: 'Sign-in could not be completed. Check the security-hardening database setup and try again.' };
  if (data.status === 'locked') return lockedLogin(data.locked_until);
  if (data.status !== 'authenticated' || !data.user?.id) return { error: 'Wrong email or password.' };
  return { user: publicUser(data.user) };
}

// ---- session cookie ----
export async function startSession(res, user) {
  const jwt = await new SignJWT({ email: user.email, name: user.name, slug: user.slug })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(secretKey());
  const secure = process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${jwt}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`);
}
export const endSession = res => res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);

export async function sessionUser(req) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`));
  if (!m) return null;
  try {
    const { payload } = await jwtVerify(m[1], secretKey());
    const [u] = await run(raw().from('users').select('*').eq('id', payload.sub));   // re-read so deleted users lose access at once
    if (!u) return null;
    const locked = parse(u.locked_until);
    if (locked && locked > now()) return null;
    return publicUser(u);
  } catch { return null; }
}
