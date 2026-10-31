// Tenant isolation: every query on a tenant table is limited to the signed-in user's rows and every
// insert is stamped with their owner_id. Fails closed: no uid, no client.
import { raw } from './supabase.js';

export const TENANT_TABLES = new Set(['files', 'folders', 'topics', 'posts', 'templates', 'chunks', 'chat_log', 'profiles', 'contributions', 'offerings', 'profile_submissions', 'site_settings']);
export const TENANT_RPCS = new Set(['hybrid_search', 'chunk_sources']);   // these get p_owner

export function scoped(uid) {
  if (!uid) throw new Error('Not signed in.');
  const r = raw();
  const stamp = rows => Array.isArray(rows) ? rows.map(x => ({ ...x, owner_id: uid })) : { ...rows, owner_id: uid };
  const noOwner = v => { const { owner_id, ...rest } = v; return rest; };   // ownership can never be changed
  return {
    uid,
    from(name) {
      const t = r.from(name);
      if (!TENANT_TABLES.has(name)) return t;
      return {
        select: (cols, opts) => t.select(cols, opts).eq('owner_id', uid),
        insert: (rows, opts) => t.insert(stamp(rows), opts),
        update: values => t.update(noOwner(values)).eq('owner_id', uid),
        delete: () => t.delete().eq('owner_id', uid),
      };
    },
    rpc: (fn, params = {}) => r.rpc(fn, TENANT_RPCS.has(fn) ? { ...params, p_owner: uid } : params),
    storage: r.storage,
  };
}
