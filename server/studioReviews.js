import { HttpError } from './http.js';

const columns = 'id,owner_id,command,plan,status,results,expires_at,error';
const rowView = row => row ? ({ id: row.id, ownerId: row.owner_id, command: row.command, plan: row.plan, status: row.status, results: row.results || [], expiresAt: row.expires_at, error: row.error || '' }) : null;
const identity = ctx => {
  if (!ctx?.user?.id || ctx.db?.uid !== ctx.user.id) throw new HttpError(401, 'Not signed in.');
  return ctx.user.id;
};
async function result(query) {
  const { data, count, error } = await query;
  if (error) {
    if (['42P01', 'PGRST205'].includes(error.code) || /studio_reviews.*(?:does not exist|schema cache)|relation.*studio_reviews/i.test(error.message || '')) throw new HttpError(503, 'Run supabase/studio-assistant.sql in the Supabase SQL Editor to enable saved command reviews.');
    throw new HttpError(503, 'The command review could not be saved or loaded. Please try again.');
  }
  return { data: data || [], count: count || 0 };
}

/** Every read and conditional write includes the actor, even with a tenant-scoped client. */
export function createStudioReviewRepository() {
  const bound = (ctx, query, id) => query.eq('owner_id', identity(ctx)).eq('id', id);
  return {
    async recent(ctx, sinceIso) {
      return (await result(ctx.db.from('studio_reviews').select('id', { count: 'exact', head: true }).eq('owner_id', identity(ctx)).gte('created_at', sinceIso))).count;
    },
    async create(ctx, row) {
      const ownerId = identity(ctx);
      const saved = await result(ctx.db.from('studio_reviews').insert({ id: row.id, owner_id: ownerId, command: row.command, plan: row.plan, status: 'pending', results: [], expires_at: row.expiresAt, ...(row.createdAt ? { created_at: row.createdAt } : {}) }).select(columns));
      if (!saved.data[0]) throw new HttpError(503, 'The command review could not be saved. Nothing has been applied.');
      return rowView(saved.data[0]);
    },
    async get(ctx, id) { return rowView((await result(bound(ctx, ctx.db.from('studio_reviews').select(columns), id).limit(1))).data[0]); },
    async claim(ctx, id, nowIso) {
      const query = bound(ctx, ctx.db.from('studio_reviews').update({ status: 'running', started_at: nowIso, updated_at: nowIso }), id).eq('status', 'pending').gt('expires_at', nowIso).select(columns);
      return rowView((await result(query)).data[0]);
    },
    async progress(ctx, id, results) {
      const saved = await result(bound(ctx, ctx.db.from('studio_reviews').update({ results, updated_at: new Date().toISOString() }), id).eq('status', 'running').select('id'));
      if (!saved.data.length) throw new HttpError(409, 'This review is no longer running.');
    },
    async finish(ctx, id, status, results, error = '') {
      if (!['applied', 'partial', 'failed'].includes(status)) throw new HttpError(400, 'Invalid review result status.');
      const stamp = new Date().toISOString();
      const saved = await result(bound(ctx, ctx.db.from('studio_reviews').update({ status, results, error: String(error).slice(0, 1000), finished_at: stamp, updated_at: stamp }), id).eq('status', 'running').select('id'));
      if (!saved.data.length) throw new HttpError(409, 'This review is no longer running.');
    },
    async cancel(ctx, id) {
      return (await result(bound(ctx, ctx.db.from('studio_reviews').update({ status: 'cancelled', updated_at: new Date().toISOString() }), id).eq('status', 'pending').select('id'))).data.length > 0;
    },
  };
}
