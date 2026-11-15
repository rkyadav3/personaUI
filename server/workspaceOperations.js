import { raw } from './supabase.js';
import { HttpError } from './http.js';
import { integrationQuery, uuidValid } from './integrations.js';
import { isSuperAdminEmail } from './auth.js';

const needOwner = user => { if (!user?.isSuperAdmin) throw new HttpError(403, 'Only Super Admin can manage platform operations.'); };
export function probeView(probe, now = Date.now()) {
  if (!probe || !Number.isFinite(Date.parse(probe.checked_at)) || now - Date.parse(probe.checked_at) > 15 * 60000) return { ...probe, status: 'unknown', detail: 'No check within the last 15 minutes.' };
  return probe;
}
export function createWorkspaceOperationsService({ database = raw, fetcher = fetch } = {}) {
  return {
    async list(user, input = {}) {
      needOwner(user);
      const page = Number(input.page || 1);
      if (!Number.isInteger(page) || page < 1 || page > 10000) throw new HttpError(400, 'Choose a valid directory page.');
      let query = database().from('workspaces').select('id,name,slug,type,status,created_at,owner:users!workspaces_owner_id_fkey(id,email,name),settings:workspace_api_settings(*)').order('created_at', { ascending: false });
      if (input.type) {
        if (!['individual', 'organization'].includes(input.type)) throw new HttpError(400, 'Choose Individual or Organization.');
        query = query.eq('type', input.type);
      }
      if (input.query) query = query.ilike('name', '%' + String(input.query).replace(/[%_]/g, '').slice(0, 80) + '%');
      const rows = await integrationQuery(query.range((page - 1) * 50, page * 50 - 1));
      return { workspaces: rows.filter(row => !isSuperAdminEmail(row.owner?.email)), page, hasNext: rows.length === 50 };
    },
    async change(user, input) {
      needOwner(user);
      if (!uuidValid(input?.workspaceId)) throw new HttpError(400, 'Choose a workspace.');
      const changes = {};
      if (input.status !== undefined) {
        if (!['active', 'suspended', 'archived'].includes(input.status)) throw new HttpError(400, 'Choose a workspace status.');
        changes.status = input.status;
      }
      for (const key of ['enabled', 'external_enabled']) if (input[key] !== undefined) {
        if (typeof input[key] !== 'boolean') throw new HttpError(400, 'Choose enable or disable.'); changes[key] = input[key];
      }
      for (const [key, max] of [['monthly_limit', 10000000], ['minute_limit', 10000], ['retention_days', 365]]) if (input[key] !== undefined) {
        if (!Number.isInteger(input[key]) || input[key] < (key === 'retention_days' ? 7 : 1) || input[key] > max) throw new HttpError(400, 'Choose a valid ' + key.replaceAll('_', ' ') + '.');
        changes[key] = input[key];
      }
      if (!Object.keys(changes).length) throw new HttpError(400, 'Choose a setting to change.');
      return integrationQuery(database().rpc('manage_workspace_operations', { p_actor: user.id, p_workspace: input.workspaceId, p_input: changes }));
    },
    async health(user) {
      needOwner(user);
      const [metrics, probes] = await Promise.all([
        integrationQuery(database().rpc('platform_persona_health')),
        integrationQuery(database().from('platform_health_checks').select('*')),
      ]);
      return { ...metrics, probes: ['generation', 'embedding'].map(component => ({ component, ...probeView(probes.find(item => item.component === component)) })) };
    },
    async check(user) {
      needOwner(user);
      const results = await Promise.all(['generation', 'embedding'].map(async component => {
        const model = component === 'generation' ? process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite' : process.env.EMBED_MODEL || 'gemini-embedding-001';
        let status = 'unknown', detail = 'Provider credentials are not configured.';
        if (process.env.GEMINI_API_KEY) {
          try {
            const response = await fetcher('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model), { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY }, signal: AbortSignal.timeout(5000) });
            status = response.ok ? 'ok' : 'failed'; detail = response.ok ? 'Provider model metadata responded. This does not measure answer quality.' : 'Provider metadata check returned HTTP ' + response.status + '.';
          } catch { status = 'failed'; detail = 'Provider metadata check timed out or could not connect.'; }
        }
        return { component, status, detail, checked_at: new Date().toISOString() };
      }));
      await integrationQuery(database().from('platform_health_checks').upsert(results));
      return { probes: results };
    },
    async audit(user, input = {}) {
      needOwner(user);
      let query = database().from('workspace_audit').select('id,workspace_id,actor_id,action,detail,created_at').order('created_at', { ascending: false }).limit(100);
      if (input.workspaceId) {
        if (!uuidValid(input.workspaceId)) throw new HttpError(400, 'Choose a workspace.'); query = query.eq('workspace_id', input.workspaceId);
      }
      return { rows: await integrationQuery(query) };
    },
  };
}

