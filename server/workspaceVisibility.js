export const workspaceEnabled = () => process.env.WORKSPACES_ENABLED === 'true';
export const accountColumns = columns => workspaceEnabled() ? `${columns},approval_status,workspace_status,workspace_type` : `${columns},approval_status`;
export async function canViewWorkspaceProfile(account, viewer, database) {
  const { canViewProfile } = await import('../shared/governance.js');
  if (canViewProfile(account, viewer)) return true;
  if (!viewer?.workspaceEnabled || !account?.id || !canViewProfile(account, { id: account.id })) return false;
  const { createWorkspaceService } = await import('./workspaces.js');
  try { const access=await createWorkspaceService(database ? { database } : {}).current(viewer, account.id); return access.role!=='contributor'; }
  catch (error) { if (error.status === 403) return false; throw error; }
}
