import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { raw } from './supabase.js';
import { HttpError } from './http.js';
import { createPublicRepository } from './publicRepository.js';

export const credentialHash = secret => createHash('sha256').update(secret).digest('hex');
export function issueCredential() {
  const secret = 'ps_' + randomBytes(36).toString('base64url');
  return { secret, hash: credentialHash(secret), prefix: secret.slice(0, 11) };
}
export function bearerCredential(req) {
  const match = /^Bearer (ps_[A-Za-z0-9_-]{8,100})$/.exec(req.headers?.authorization || '');
  if (!match) throw new HttpError(401, 'A server API credential is required.');
  return match[1];
}
export const uuidValid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export async function integrationQuery(query) {
  const { data, error } = await query;
  if (!error) return data;
  if (error.code === 'P0001') throw new HttpError(/Too many|limit reached/.test(error.message) ? 429 : /different message/.test(error.message) ? 409 : 403, error.message);
  if (['42P01', '42703', 'PGRST202', 'PGRST205'].includes(error.code)) throw new HttpError(503, 'Website integration setup is not installed yet.');
  throw new HttpError(503, 'Persona storage is unavailable. Please try again.');
}
const adminAccess = access => {
  if (!access?.workspace?.id || !['owner', 'admin'].includes(access.role)) throw new HttpError(403, 'A workspace administrator is required.');
};
const originFor = value => {
  try { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password) throw new Error(); return url.origin; }
  catch { throw new HttpError(400, 'Enter an HTTPS website URL.'); }
};
export function createIntegrationService({ database = raw, publicRepository = createPublicRepository(), answer = async identity => (await import('../api/chat.js')).answerPersona(identity) } = {}) {
  async function authenticate(req) {
    const secret = bearerCredential(req);
    const rows = await integrationQuery(database().from('persona_api_keys').select('id,scope,expires_at,revoked_at,integration:website_integrations(id,workspace_id,enabled,workspace:workspaces(id,owner_id,slug,status))').eq('key_hash', credentialHash(secret)).limit(1));
    const key = rows[0], site = key?.integration, workspace = site?.workspace;
    if (!key || key.scope !== 'persona:chat' || key.revoked_at || Date.parse(key.expires_at) <= Date.now() || !site.enabled || workspace?.status !== 'active') throw new HttpError(401, 'This API credential is expired, revoked or unavailable.');
    return { workspaceId: workspace.id, ownerId: workspace.owner_id, slug: workspace.slug, integrationId: site.id, keyId: key.id };
  }
  async function perform(access, input, source) {
    if (typeof input.message !== 'string' || !input.message.trim() || input.message.length > 500) throw new HttpError(400, 'Write a question of 1 to 500 characters.');
    const requestId = input.requestId || randomUUID(), message = input.message.trim();
    if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(requestId)) throw new HttpError(400, 'Use a request ID containing letters, numbers, hyphens or underscores.');
    if (input.sessionId && !uuidValid(input.sessionId)) throw new HttpError(400, 'This session ID is invalid.');
    const owner = await publicRepository.owner(access.slug, source === 'own_platform' ? access.viewer : null);
    if (!owner || owner.id !== access.ownerId) throw new HttpError(404, 'This persona is not available.');
    const reservation = await integrationQuery(database().rpc('reserve_persona_request', {
      p_workspace: access.workspaceId, p_key: access.keyId || null, p_source: source, p_request: requestId,
      p_hash: credentialHash(message), p_session: input.sessionId || null,
    }));
    if (reservation.state === 'pending') throw new HttpError(409, 'This request is still processing. Retry the same request ID shortly.');
    if (reservation.state !== 'reserved') {
      if (reservation.state === 'obsolete') throw new HttpError(409, 'Persona knowledge has changed. Send this question with a new request ID.', { retry: 'new_request' });
      if (reservation.status >= 400) throw new HttpError(reservation.status, reservation.response?.error || reservation.response?.reply || 'The previous request failed. Use a new request ID.', { retry: 'new_request' });
      return { ...reservation.response, requestId, replayed: true };
    }
    let result;
    try { result = await answer({ owner: access.ownerId, profile: owner.profile, message, workspaceId: access.workspaceId }); }
    catch { result = { status: 502, body: { error: 'The persona could not answer right now. Try again.' } }; }
    const body = { ...result.body, source, requestId };
    const saved = await integrationQuery(database().rpc('finish_persona_request', {
      p_id: reservation.id, p_lease: reservation.lease, p_status: result.status, p_response: body,
      p_input: result.usage?.inputTokens ?? null, p_output: result.usage?.outputTokens ?? null,
    }));
    if (!saved) throw new HttpError(503, 'The response could not be saved. Retry with the same request ID.');
    if (result.status >= 400) throw new HttpError(result.status, body.error || body.reply, { retry: 'new_request' });
    return body;
  }
  return {
    authenticate,
    chat: (access, input) => perform(access, input, 'external_api'),
    platformChat: (access, input) => perform(access, input, 'own_platform'),
    session: access => integrationQuery(database().rpc('create_persona_session', { p_key: access.keyId })),
    async list(access) {
      adminAccess(access);
      const sites = await integrationQuery(database().from('website_integrations').select('id,name,site_origin,enabled,created_at,keys:persona_api_keys(id,prefix,scope,expires_at,revoked_at,created_at)').eq('workspace_id', access.workspace.id).order('created_at', { ascending: false }));
      const settings = await integrationQuery(database().from('workspace_api_settings').select('*').eq('workspace_id', access.workspace.id).limit(1));
      const usage = await integrationQuery(database().rpc('persona_usage', { p_workspace: access.workspace.id }));
      return { integrations: sites, settings: settings[0] || { monthly_limit: 1000, minute_limit: 30, enabled: true, external_enabled: true }, usage };
    },
    async change(access, input) {
      adminAccess(access);
      if (!['create', 'rotate', 'revoke', 'toggle'].includes(input.action)) throw new HttpError(400, 'Choose a supported integration action.');
      const payload = { ...input };
      if (input.action === 'create') {
        payload.name = typeof input.name === 'string' ? input.name.trim().slice(0, 80) : '';
        if (!payload.name) throw new HttpError(400, 'Name this website connection.');
        payload.origin = originFor(input.origin);
      } else if (!uuidValid(input.id)) throw new HttpError(400, 'Choose a website connection.');
      if (input.action === 'toggle' && typeof input.enabled !== 'boolean') throw new HttpError(400, 'Choose enable or disable.');
      const key = ['create', 'rotate'].includes(input.action) ? issueCredential() : null;
      if (key) Object.assign(payload, { hash: key.hash, prefix: key.prefix });
      const result = await integrationQuery(database().rpc('manage_persona_integration', { p_actor: access.actorId, p_workspace: access.workspace.id, p_action: input.action, p_input: payload }));
      return { ...result, ...(key ? { secret: key.secret } : {}) };
    },
  };
}

