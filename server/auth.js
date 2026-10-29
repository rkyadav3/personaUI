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
const MAX_FAILS = 5, LOCK_MIN = 10;
const DUMMY = bcrypt.hashSync('dummy-password', 12);   // equalises timing for unknown emails

const secretKey = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('Set SESSION_SECRET (16+ random characters).');
  return new TextEncoder().encode(s);
};
const now = () => new Date();
const parse = ts => (ts ? new Date(ts) : null);

/** open = anyone, invite = needs a code, closed = no sign-ups. */
export function registrationMode() {
  if (['0', 'false', 'no', 'off'].includes(String(env('ALLOW_REGISTRATION', 'true')).trim().toLowerCase())) return 'closed';
  const m = String(env('REGISTRATION_MODE', 'open')).trim().toLowerCase();
  return ['open', 'invite', 'closed'].includes(m) ? m : 'open';
}
export const isAdminEmail = email =>
  String(env('ADMIN_EMAILS', '')).split(',').map(e => e.trim().toLowerCase()).filter(Boolean).includes((email || '').toLowerCase());

export const normCode = code => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function checkInvite(code) {
  code = normCode(code);
  if (!code) return { error: 'Enter your invite code.' };
  const [r] = await run(raw().from('invite_codes').select('*').eq('code', code));
  const bad = "That invite code isn't valid.";
  if (!r) return { error: bad };
  const exp = parse(r.expires_at);
  if (r.revoked || (exp && exp < now()) || (r.uses || 0) >= (r.max_uses || 1)) return { error: bad };
  return { row: r };
}

/** Only succeeds if `uses` is still what we read, so two people can't both take the last use. */
async function consumeInvite(r) {
  const rows = await run(raw().from('invite_codes').update({ uses: (r.uses || 0) + 1 }).eq('id', r.id).eq('uses', r.uses || 0).select());
  return rows.length > 0;
}

const slugFor = email =>
  `${(email.split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'user')}-${randomBytes(2).toString('hex')}`;

const publicUser = u => ({ id: String(u.id), email: u.email, name: u.name || null, slug: u.slug || null, isAdmin: isAdminEmail(u.email) });

export async function register({ name, email, password = '', confirm, invite }) {
  email = (email || '').trim().toLowerCase();
  const mode = registrationMode();
  if (mode === 'closed') return { error: 'Registration is closed.' };
  if (!EMAIL_RE.test(email)) return { error: 'Enter a valid email address.' };
  if (password.length < 8) return { error: 'Use at least 8 characters for your password.' };
  if (Buffer.byteLength(password) > 72) return { error: 'Your password is too long (72 characters max).' };
  if (password !== confirm) return { error: "The passwords don't match." };
  const db = raw();
  let inv = null;
  if (mode === 'invite') { const c = await checkInvite(invite); if (c.error) return { error: c.error }; inv = c.row; }
  if ((await run(db.from('users').select('id').eq('email', email))).length) return { error: 'An account with that email already exists. Sign in instead.' };
  let row;
  try {
    [row] = await run(db.from('users').insert({ email, name: (name || '').trim() || null, slug: slugFor(email), password_hash: bcrypt.hashSync(password, 12) }).select());
  } catch { return { error: "Couldn't create the account. Try again." }; }
  if (inv) {
    if (!(await consumeInvite(inv))) {                       // someone used the last slot a moment ago
      await run(db.from('users').delete().eq('id', row.id));
      return { error: 'That invite code was just used up. Ask for a new one.' };
    }
    await run(db.from('users').update({ invite_code_id: inv.id }).eq('id', row.id));
  }
  return { user: publicUser(row) };
}

export async function login({ email, password = '' }) {
  email = (email || '').trim().toLowerCase();
  const db = raw();
  const [u] = await run(db.from('users').select('*').eq('email', email));
  if (!u) { bcrypt.compareSync(password.slice(0, 72), DUMMY); return { error: 'Wrong email or password.' }; }
  const locked = parse(u.locked_until);
  if (locked && locked > now()) return { error: `Too many attempts. Try again in ${Math.floor((locked - now()) / 60000) + 1} minutes.` };
  if (!bcrypt.compareSync(password.slice(0, 72), u.password_hash)) {
    const fails = (u.failed_attempts || 0) + 1;
    const upd = fails >= MAX_FAILS
      ? { failed_attempts: 0, locked_until: new Date(Date.now() + LOCK_MIN * 60000).toISOString() }
      : { failed_attempts: fails };
    await run(db.from('users').update(upd).eq('id', u.id));
    return { error: 'Wrong email or password.' };
  }
  await run(db.from('users').update({ failed_attempts: 0, locked_until: null }).eq('id', u.id));
  return { user: publicUser(u) };
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
    return u ? publicUser(u) : null;
  } catch { return null; }
}
