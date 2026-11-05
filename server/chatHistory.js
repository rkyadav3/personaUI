import { HttpError } from './http.js';

// Only called with the authenticated admin handler's tenant-scoped database.
export async function listQuestions(db, input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Choose a valid history page.');
  if (input.page !== undefined && !['number', 'string'].includes(typeof input.page)) throw new HttpError(400, 'Choose a valid history page.');
  const page = Number(input.page ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new HttpError(400, 'Choose a valid history page.');
  const pageSize = 50;
  const { data, count, error } = await db.from('chat_log')
    .select('id,question,answer,sources,answered,top_similarity,created_at', { count: 'exact' })
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) {
    if (['42703', '42P01', 'PGRST204', 'PGRST205'].includes(error.code)) throw new HttpError(503, 'Profile Q&A needs the database migration. Apply supabase/profile-questions.sql before using this page.');
    throw new HttpError(500, 'Could not load visitor questions. Please try again.');
  }
  return { rows: data || [], total: count || 0, page, pageSize };
}
