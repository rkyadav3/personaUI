export const workspaceEnabled = () => process.env.WORKSPACES_ENABLED === 'true';
export const accountColumns = columns => workspaceEnabled() ? `${columns},workspace_status,workspace_type` : columns;
export async function canViewWorkspaceProfile(account, viewer, database) {
  const { canViewProfile } = await import('../shared/governance.js');
  if (canViewProfile(account, viewer)) return true;
  if (!viewer?.workspaceEnabled || !account?.id || !canViewProfile(account, { id: account.id })) return false;
  const { createWorkspaceService } = await import('./workspaces.js');
  try { await createWorkspaceService(database ? { database } : {}).current(viewer, account.id); return true; }
  catch (error) { if (error.status === 403) return false; throw error; }
}
