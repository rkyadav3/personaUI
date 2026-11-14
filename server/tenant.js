// Tenant isolation: every query on a tenant table is limited to the signed-in user's rows and every
// insert is stamped with their owner_id. Fails closed: no uid, no client.
import { raw } from './supabase.js';

export const TENANT_TABLES = new Set(['files', 'folders', 'topics', 'posts', 'templates', 'chunks', 'chat_log', 'profiles', 'contributions', 'offerings', 'profile_submissions', 'site_settings', 'updates', 'enquiries', 'event_responses', 'purchases', 'payment_accounts', 'public_actions', 'studio_reviews', 'studio_chat', 'admin_presence']);
export const TENANT_RPCS = new Set(['hybrid_search', 'set_embeddings', 'chunk_sources', 'save_event_response', 'event_rsvp_summary', 'complete_purchase', 'record_purchase_refund', 'claim_public_action', 'purchase_summary', 'resume_admin_activity', 'touch_admin_activity', 'admin_analytics']);   // these get p_owner

TENANT_TABLES.add('assets');
TENANT_RPCS.add('save_store_currency');

export function scoped(uid, database = raw) {
  if (!uid) throw new Error('Not signed in.');
  const r = database();
  const stamp = rows => Array.isArray(rows) ? rows.map(x => ({ ...x, owner_id: uid })) : { ...rows, owner_id: uid };
  const noOwner = v => { const { owner_id, ...rest } = v; return rest; };   // ownership can never be changed
  return {
    uid,
    from(name) {
      if (!TENANT_TABLES.has(name)) throw new Error('Table is not available in this account.');
      const t = r.from(name);
      return {
        select: (cols, opts) => t.select(cols, opts).eq('owner_id', uid),
        insert: (rows, opts) => t.insert(stamp(rows), opts),
        update: values => t.update(noOwner(values)).eq('owner_id', uid),
        delete: () => t.delete().eq('owner_id', uid),
      };
    },
    rpc: (fn, params = {}) => {
      if (!TENANT_RPCS.has(fn)) throw new Error('Operation is not available in this account.');
      return r.rpc(fn, { ...params, p_owner: uid });
    },
    storage: r.storage,
  };
}
