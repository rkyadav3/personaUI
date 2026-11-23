// Tenant isolation: every query on a tenant table is limited to the signed-in user's rows and every
// insert is stamped with their owner_id. Fails closed: no uid, no client.
import { raw } from './supabase.js';

export const TENANT_TABLES = new Set(['files', 'folders', 'topics', 'posts', 'templates', 'chunks', 'chat_log', 'profiles', 'contributions', 'offerings', 'profile_submissions', 'site_settings', 'updates', 'enquiries', 'event_responses', 'purchases', 'payment_accounts', 'public_actions', 'studio_reviews', 'studio_chat', 'admin_presence']);
export const TENANT_RPCS = new Set(['hybrid_search', 'set_embeddings', 'chunk_sources', 'save_event_response', 'event_rsvp_summary', 'complete_purchase', 'record_purchase_refund', 'claim_public_action', 'purchase_summary', 'resume_admin_activity', 'touch_admin_activity', 'admin_analytics']);   // these get p_owner

TENANT_TABLES.add('assets');
TENANT_TABLES.add('jobs');
TENANT_TABLES.add('job_resumes');
TENANT_TABLES.add('file_uploads');
TENANT_TABLES.add('jobs_profiles');
TENANT_RPCS.add('save_jobs_profile');
TENANT_RPCS.add('save_store_currency');

export function scoped(uid, database = raw, workspace) {
  if (!uid) throw new Error('Not signed in.');
  const r = database();
  const stampRow = row => ({ ...row, owner_id: uid, ...(workspace ? { workspace_id: workspace.workspaceId, created_by: workspace.actorId, updated_by: workspace.actorId } : {}) });
  const stamp = rows => Array.isArray(rows) ? rows.map(stampRow) : stampRow(rows);
  const noOwner = v => { const { owner_id, workspace_id, created_by, updated_by, ...rest } = v; return { ...rest, ...(workspace ? { updated_by: workspace.actorId } : {}) }; };
  const filter = query => workspace ? query.eq('owner_id', uid).eq('workspace_id', workspace.workspaceId) : query.eq('owner_id', uid);
  return {
    uid,
    ...(workspace ? { workspaceId: workspace.workspaceId, actorId: workspace.actorId } : {}),
    from(name) {
      if (!TENANT_TABLES.has(name)) throw new Error('Table is not available in this account.');
      const t = r.from(name);
      return {
        select: (cols, opts) => filter(t.select(cols, opts)),
        insert: (rows, opts) => t.insert(stamp(rows), opts),
        update: values => filter(t.update(noOwner(values))),
        delete: () => filter(t.delete()),
      };
    },
    rpc: (fn, params = {}) => {
      if (!TENANT_RPCS.has(fn)) throw new Error('Operation is not available in this account.');
      return r.rpc(fn, { ...params, p_owner: uid });
    },
    storage: r.storage,
  };
}
