// Global tables (users, invite_codes): admin only. The route layer checks isAdmin before calling these.
import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { BUCKET } from './config.js';
import { isSuperAdminEmail, normCode } from './auth.js';
import { raw, run, paged } from './supabase.js';
import { HttpError } from './http.js';
import { createTagService } from './tags.js';
import { normalizeTags } from '../shared/governance.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O/1/I
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function makeCode(db) {
  for (;;) {
    const c = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    if (!(await run(db.from('invite_codes').select('id').eq('code', c))).length) return c;
  }
}

export async function createInvite(uid, { label, maxUses = 1, days = 14 } = {}, db) {
  if (!Number.isInteger(Number(maxUses)) || Number(maxUses) < 1 || Number(maxUses) > 1000 || !Number.isInteger(Number(days)) || Number(days) < 0 || Number(days) > 365) throw new HttpError(400, 'Use 1–1000 invite uses and an expiry of 0–365 days.');
  db ||= raw();
  const [creator] = await run(db.from('users').select('id,name,email').eq('id', uid).limit(1));
  if (!creator) throw new HttpError(404, 'Creator account not found.');
  const code = await makeCode(db);
  const expires = days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null;
  await run(db.from('invite_codes').insert({ code, label: String(label || '').trim().slice(0, 200) || null, max_uses: Number(maxUses), expires_at: expires, created_by: uid, creator_name: creator.name || null, creator_email: creator.email }));
  return code;
}

export const listInvites = () => paged(raw(), 'invite_codes', '*', q => q.order('created_at', { ascending: false }).order('id', { ascending: false }));
export async function listInviteHistory(user, db = raw()) {
  const codes = await paged(db, 'invite_codes', '*', q => (user.isSuperAdmin ? q : q.eq('created_by', user.id)).order('created_at', { ascending: false }).order('id', { ascending: false }));
  const redemptions = await paged(db, 'invite_redemptions', '*', q => (user.isSuperAdmin ? q : q.eq('created_by', user.id)).order('joined_at', { ascending: false }).order('id', { ascending: false }));
  const creatorIds = [...new Set(codes.map(code => code.created_by).filter(Boolean))];
  const creators = creatorIds.length ? await run(db.from('users').select('id,name,email').in('id', creatorIds)) : [];
  return { codes: codes.map(code => ({ ...code, creator: code.creator_email ? { name: code.creator_name, email: code.creator_email } : creators.find(creator => creator.id === code.created_by) || null })), redemptions };
}
export async function revokeInvite(id, user, db = raw()) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) throw new HttpError(400, 'Invalid invite.');
  let query = db.from('invite_codes').update({ revoked: true }).eq('id', id);
  if (!user.isSuperAdmin) query = query.eq('created_by', user.id);
  if (!(await run(query.select('id'))).length) throw new HttpError(404, 'Invite not found or it belongs to another user.');
}
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
    paged(db, 'users', 'id,email,name,slug,tags,profile_private,created_at,invite_code_id,failed_attempts,locked_until', q => q.order('created_at', { ascending: false }).order('id', { ascending: false })),
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
      isAdmin: !isSuperAdminEmail(u.email),
      isSuperAdmin: isSuperAdminEmail(u.email),
      tags: u.tags || [], profile_private: u.profile_private
    };
  });
}

export async function updateUser(targetUserId, { name, email, slug, tags }) {
  const db = raw();
  const [user] = await run(db.from('users').select('*').eq('id', targetUserId));
  if (!user) throw new Error('User not found.');

  const updates = {};
  if (tags !== undefined) {
    const definitions = await createTagService(() => db).list();
    try { updates.tags = normalizeTags(tags, definitions); } catch (error) { throw new HttpError(400, error.message); }
  }
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
