import { raw, run, paged } from './supabase.js';
import { HttpError } from './http.js';
import { SUPPORT_CATEGORIES, SUPPORT_STATUSES } from '../shared/platformSupport.js';

const ticketFields = 'id,owner_id,author_name,author_email,title,body,category,status,created_at,updated_at';
const messageFields = 'id,ticket_id,author_name,author_email,is_superadmin,body,status,created_at';
function account(user) {
  if (!user?.id || (!user.isAdmin && !user.isSuperAdmin)) throw new HttpError(403, 'Sign in with an admin account to use Support.');
}
function ticketId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, 'Choose a valid support request.');
  return id;
}
function text(value, max, required = true) {
  const result = typeof value === 'string' ? value.trim() : '';
  if ((required && !result) || result.length > max) throw new HttpError(400, `Enter text between ${required ? 1 : 0} and ${max} characters.`);
  return result;
}

// Platform support crosses customer tenants. Every read explicitly scopes the requester;
// the service-only reply transaction checks ownership again while holding the ticket lock.
export function createSupportService(database = raw) {
  return {
    async list(user) {
      account(user);
      return paged(database(), 'support_tickets', ticketFields, query => {
        if (!user.isSuperAdmin) query = query.eq('owner_id', user.id);
        return query.order('updated_at', { ascending: false }).order('id', { ascending: false });
      });
    },
    async create(user, input = {}) {
      account(user);
      if (user.isSuperAdmin) throw new HttpError(403, 'The SuperAdmin replies to customer requests.');
      if (!input || !Object.hasOwn(SUPPORT_CATEGORIES, input.category)) throw new HttpError(400, 'Choose a support category.');
      const title = text(input.title, 160), body = text(input.body, 5000);
      const [row] = await run(database().from('support_tickets').insert({ owner_id: user.id, author_name: user.name || null, author_email: user.email, title, body, category: input.category, status: 'open' }).select('id'));
      return row;
    },
    async get(user, input = {}) {
      account(user);
      const id = ticketId(input?.id), db = database();
      let query = db.from('support_tickets').select(ticketFields).eq('id', id);
      if (!user.isSuperAdmin) query = query.eq('owner_id', user.id);
      const [ticket] = await run(query);
      if (!ticket) throw new HttpError(404, 'Support request not found.');
      const messages = await paged(db, 'support_messages', messageFields, q => q.eq('ticket_id', id).order('created_at', { ascending: true }).order('id', { ascending: true }));
      return { ticket, messages };
    },
    async reply(user, input = {}) {
      account(user);
      const id = ticketId(input?.id), status = input?.status ?? null;
      if (status !== null && !user.isSuperAdmin) throw new HttpError(403, 'Only the SuperAdmin can change request status.');
      if (status !== null && !Object.hasOwn(SUPPORT_STATUSES, status)) throw new HttpError(400, 'Choose Open, In progress or Resolved.');
      const body = text(input?.body, 5000, !user.isSuperAdmin || status === null);
      const result = await run(database().rpc('reply_support_ticket', { p_ticket: id, p_actor: user.id, p_superadmin: user.isSuperAdmin === true, p_body: body, p_status: status }));
      if (!result?.ok) throw new HttpError(404, 'Support request not found.');
      return result;
    },
  };
}
