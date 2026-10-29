// Global tables (users, invite_codes): admin only. The route layer checks isAdmin before calling these.
import { randomInt } from 'node:crypto';
import { normCode } from './auth.js';
import { raw, run } from './supabase.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O/1/I

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
export { normCode };
