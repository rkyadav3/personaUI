// Global tables (users, invite_codes): admin only. The route layer checks isAdmin before calling these.
import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { BUCKET } from './config.js';
import { isAdminEmail, normCode } from './auth.js';
import { raw, run } from './supabase.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O/1/I
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function makeCode() {
  for (;;) {
    const c = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    if (!(await run(raw().from('invite_codes').select('id').eq('code', c))).length) return c;
  }
}

export async function createInvite(uid, { label, maxUses = 1, days = 14 }) {
  const code = await makeCode();
  const expires = days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null;
  await run(raw().from('invite_codes').insert({ code, label: (label || '').trim() || null, max_uses: Math.max(1, Math.min(1000, +maxUses || 1)), expires_at: expires, created_by: uid }));
  return code;
}

export const listInvites = () => run(raw().from('invite_codes').select('*').order('created_at', { ascending: false }));
export const revokeInvite = id => run(raw().from('invite_codes').update({ revoked: true }).eq('id', id));
export const listUsers = () => run(raw().from('users').select('email,name,slug,created_at,invite_code_id').order('created_at', { ascending: false }));

export async function validateInvite(code) {
  const c = normCode(code);
  if (!c) return { ok: false, error: 'No invite code provided.' };
  const [r] = await run(raw().from('invite_codes').select('id,code,label,max_uses,uses,expires_at,revoked').eq('code', c));
  if (!r) return { ok: false, error: "Invalid invite code or link." };
  if (r.revoked) return { ok: false, error: "This invite link has been revoked." };
  const exp = r.expires_at ? new Date(r.expires_at) : null;
  if (exp && exp < new Date()) return { ok: false, error: "This invite link has expired." };
  if ((r.uses || 0) >= (r.max_uses || 1)) return { ok: false, error: "This invite link has already been used up." };
  return {
    ok: true,
    code: r.code,
    label: r.label,
    expires_at: r.expires_at,
    max_uses: r.max_uses,
    uses: r.uses,
  };
}

export async function listUsersDetailed() {
  const db = raw();
  const [users, codes, profiles] = await Promise.all([
    run(db.from('users').select('id,email,name,slug,created_at,invite_code_id,failed_attempts,locked_until').order('created_at', { ascending: false })),
    run(db.from('invite_codes').select('id,code,label')),
    run(db.from('profiles').select('owner_id,status,name,designation')).catch(() => []),
  ]);
  const inviteMap = new Map((codes || []).map(c => [c.id, c]));
  const profileMap = new Map((profiles || []).map(p => [p.owner_id, p]));
  const now = new Date();

  return (users || []).map(u => {
    const inv = u.invite_code_id ? inviteMap.get(u.invite_code_id) : null;
    const p = profileMap.get(u.id);
    const lockedUntil = u.locked_until ? new Date(u.locked_until) : null;
    const isLocked = Boolean(lockedUntil && lockedUntil > now);
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      slug: u.slug,
      created_at: u.created_at,
      failed_attempts: u.failed_attempts || 0,
      locked_until: u.locked_until,
      isLocked,
      invite_code: inv?.code || null,
      invite_label: inv?.label || null,
      profile_status: p?.status || 'none',
      designation: p?.designation || null,
      isAdmin: isAdminEmail(u.email)
    };
  });
}

export async function updateUser(targetUserId, { name, email, slug }) {
  const db = raw();
  const [user] = await run(db.from('users').select('*').eq('id', targetUserId));
  if (!user) throw new Error('User not found.');

  const updates = {};
  if (name !== undefined) updates.name = (name || '').trim() || null;
  if (email !== undefined) {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) throw new Error('Invalid email address.');
    if (cleanEmail !== user.email) {
      const existing = await run(db.from('users').select('id').eq('email', cleanEmail));
      if (existing.length) throw new Error('An account with that email already exists.');
      updates.email = cleanEmail;
    }
  }
  if (slug !== undefined) {
    const cleanSlug = (slug || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!cleanSlug) throw new Error('Slug cannot be empty.');
    if (cleanSlug !== user.slug) {
      const existing = await run(db.from('users').select('id').eq('slug', cleanSlug));
      if (existing.length) throw new Error('A user with that slug already exists.');
      updates.slug = cleanSlug;
    }
  }

  if (Object.keys(updates).length > 0) {
    await run(db.from('users').update(updates).eq('id', targetUserId));
  }
  return { ok: true };
}

export async function setUserLock(targetUserId, locked, currentAdminId) {
  if (targetUserId === currentAdminId) {
    throw new Error('You cannot lock or suspend your own account.');
  }
  const db = raw();
  const locked_until = locked ? new Date(Date.now() + 365 * 86400000).toISOString() : null;
  await run(db.from('users').update({
    locked_until,
    failed_attempts: locked ? 5 : 0
  }).eq('id', targetUserId));
  return { ok: true };
}

export async function resetUserPassword(targetUserId, newPassword) {
  if (!newPassword || newPassword.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }
  if (Buffer.byteLength(newPassword) > 72) {
    throw new Error('Password is too long (maximum 72 characters).');
  }
  const hash = bcrypt.hashSync(newPassword, 12);
  const db = raw();
  await run(db.from('users').update({
    password_hash: hash,
    failed_attempts: 0,
    locked_until: null
  }).eq('id', targetUserId));
  return { ok: true };
}

export async function deleteUser(targetUserId, currentAdminId) {
  if (targetUserId === currentAdminId) {
    throw new Error('You cannot delete your own account.');
  }
  const db = raw();
  const [user] = await run(db.from('users').select('*').eq('id', targetUserId));
  if (!user) throw new Error('User not found.');

  // Clean up storage files if any
  try {
    const files = await run(db.from('files').select('storage_path').eq('owner_id', targetUserId));
    const paths = (files || []).map(f => f.storage_path).filter(Boolean);
    if (paths.length) {
      await db.storage.from(BUCKET).remove(paths);
    }
  } catch (e) {
    console.error('Storage cleanup note:', e.message);
  }

  // Delete from users (PostgreSQL foreign keys on delete cascade will remove child records)
  await run(db.from('users').delete().eq('id', targetUserId));
  return { ok: true };
}

export { normCode };
