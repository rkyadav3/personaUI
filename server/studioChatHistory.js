import { HttpError } from './http.js';

const columns = 'id,question,answer,review_id,created_at';
const view = row => ({ id: String(row.id), question: row.question, answer: row.answer, reviewId: row.review_id || null, createdAt: row.created_at });
const identity = ctx => {
  if (!ctx?.user?.id || ctx.db?.uid !== ctx.user.id) throw new HttpError(401, 'Not signed in.');
  return ctx.user.id;
};
async function result(query) {
  const { data, error } = await query;
  if (error) {
    if (['42P01', 'PGRST205'].includes(error.code)) throw new HttpError(503, 'Admin chat history needs the database migration. Apply supabase/studio-chat.sql.');
    throw new HttpError(503, 'Admin chat history could not be saved or loaded. Please try again.');
  }
  return data || [];
}

/** Only the authenticated command service writes replies; owners can read their own exchanges. */
export function createStudioChatRepository() {
  return {
    async record(ctx, { question, answer, reviewId = null }) {
      const ownerId = identity(ctx);
      const rows = await result(ctx.db.from('studio_chat').insert({ owner_id: ownerId, question, answer, review_id: reviewId }).select(columns));
      if (!rows[0]) throw new HttpError(503, 'Admin chat history could not be saved.');
      return view(rows[0]);
    },
    async list(ctx, args = {}) {
      const ownerId = identity(ctx);
      if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => key !== 'before')) throw new HttpError(400, 'Choose a valid history page.');
      const before = args.before;
      if (before !== undefined && !((typeof before === 'string' && /^[1-9][0-9]{0,18}$/.test(before) && BigInt(before) <= 9223372036854775807n) || (Number.isSafeInteger(before) && before > 0))) throw new HttpError(400, 'Choose a valid history page.');
      let query = ctx.db.from('studio_chat').select(columns).eq('owner_id', ownerId).order('id', { ascending: false }).limit(26);
      if (before !== undefined) query = query.lt('id', String(before));
      const rows = await result(query), page = rows.slice(0, 25).map(view);
      return { rows: page, nextBefore: rows.length > 25 ? page.at(-1).id : null };
    },
  };
}

export const listStudioHistory = (ctx, args) => createStudioChatRepository().list(ctx, args);
