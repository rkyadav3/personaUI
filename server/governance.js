import { raw, run, paged } from './supabase.js';
import { HttpError } from './http.js';
import { SUGGESTION_KINDS, SUGGESTION_STATUSES } from '../shared/governance.js';

export const needSuperAdmin = ({ user }) => { if (!user?.isSuperAdmin) throw new HttpError(403, 'Only the SuperAdmin can manage the platform.'); };
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export function createSuggestionService(database = raw) {
  return {
    async list(user) {
      return paged(database(), 'platform_suggestions', '*', q => {
        if (!user.isSuperAdmin) q = q.eq('owner_id', user.id);
        return q.order('created_at', { ascending: false }).order('id', { ascending: false });
      });
    },
    async create(user, input) {
      if (!user?.isAdmin || user.isSuperAdmin) throw new HttpError(403, 'Only admin accounts can send platform suggestions.');
      const title = text(input.title, 160), body = text(input.body, 5000);
      if (!title || !body || !Object.hasOwn(SUGGESTION_KINDS, input.kind)) throw new HttpError(400, 'Choose Add, Remove or Update and enter a title and description.');
      const [row] = await run(database().from('platform_suggestions').insert({ owner_id: user.id, author_name: user.name || null, author_email: user.email, kind: input.kind, title, body, status: 'new' }).select('id'));
      return row;
    },
    async update(user, input) {
      needSuperAdmin({ user });
      if (!Number.isSafeInteger(Number(input.id)) || Number(input.id) < 1 || !SUGGESTION_STATUSES.includes(input.status)) throw new HttpError(400, 'Choose a valid suggestion and status.');
      const rows = await run(database().from('platform_suggestions').update({ status: input.status, owner_reply: text(input.reply, 3000), updated_at: new Date().toISOString() }).eq('id', input.id).select('id'));
      if (!rows.length) throw new HttpError(404, 'Suggestion not found.');
      return { ok: true };
    },
  };
}
