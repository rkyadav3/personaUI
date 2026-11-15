import { raw, run } from './supabase.js';
import { scoped } from './tenant.js';
import { HttpError } from './http.js';

export const WORKSPACE_ROLES = ['owner', 'admin', 'contributor', 'viewer'];
export const WORKSPACE_TYPES = ['individual', 'organization'];
const columns = 'user_id,role,status,workspace:workspaces(id,owner_id,name,slug,type,status,created_at,updated_at)';

export function workspaceAccess(user, membership) {
  const workspace = membership?.workspace;
  if (!user?.id || user.isSuperAdmin || membership?.status !== 'active' ||
      membership.user_id !== user.id ||
      !WORKSPACE_ROLES.includes(membership?.role) || !workspace?.id ||
      !workspace.owner_id || workspace.status !== 'active') {
    throw new HttpError(403, 'This workspace is not available to your account.');
  }
  if (membership.role === 'owner' && workspace.owner_id !== user.id) {
    throw new HttpError(403, 'This workspace is not available to your account.');
  }
  return { workspace, role: membership.role, ownerId: workspace.owner_id, actorId: user.id };
}

/** Legacy owner_id remains a compatibility reference; callers authorize the workspace first. */
export function scopedWorkspace(access, database = raw) {
  if (!access?.workspace?.id || !access.actorId || !access.ownerId) throw new HttpError(403, 'Workspace access is required.');
  return Object.assign(scoped(access.ownerId, database, { workspaceId: access.workspace.id, actorId: access.actorId }), { workspaceType: access.workspace.type });
}

export function createWorkspaceService({ database = raw } = {}) {
  async function memberships(user) {
    if (!user?.id || user.isSuperAdmin) throw new HttpError(403, 'Sign in as a profile administrator to open a workspace.');
    return run(database().from('workspace_members').select(columns).eq('user_id', user.id).eq('status', 'active').order('created_at'));
  }
  async function current(user, workspaceId = user?.activeWorkspaceId) {
    const rows = await memberships(user);
    const available = rows.filter(item => item.workspace?.status === 'active' && WORKSPACE_ROLES.includes(item.role));
    const row = workspaceId ? rows.find(item => item.workspace?.id === workspaceId) :
      available.find(item => item.workspace?.owner_id === user.id) || available[0];
    return workspaceAccess(user, row);
  }
  return {
    current,
    async list(user) {
      const rows = await memberships(user);
      return rows.filter(item => item.workspace?.status === 'active' && WORKSPACE_ROLES.includes(item.role))
        .map(item => ({ ...item.workspace, role: item.role }));
    },
    async setup(user, input) {
      if (!WORKSPACE_TYPES.includes(input?.type)) throw new HttpError(400, 'Choose Individual or Organization.');
      const access = await current(user, input.workspaceId);
      if (!['owner', 'admin'].includes(access.role)) throw new HttpError(403, 'Only a workspace administrator can complete setup.');
      return run(database().rpc('setup_workspace_type', {
        p_user: user.id, p_workspace: access.workspace.id, p_type: input.type,
      }));
    },
  };
}
