import { createClient } from '@supabase/supabase-js';

let client;
/** The UNscoped service-role client. Only auth code and the tenant wrapper may use it directly. */
export function raw() {
  if (!client) {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY.');
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

/** Await a query and throw on error. Returns data (or {data,count} when withCount). */
export async function run(q, withCount = false) {
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return withCount ? { data, count } : data;
}

/** Fetch every row (PostgREST returns at most 1000 per request). */
export async function paged(db, table, select = '*', apply, page = 1000) {
  const out = [];
  for (let start = 0; ; start += page) {
    let q = db.from(table).select(select);
    if (apply) q = apply(q);
    const rows = await run(q.range(start, start + page - 1));
    out.push(...rows);
    if (rows.length < page) return out;
  }
}
