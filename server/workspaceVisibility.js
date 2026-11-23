export const workspaceEnabled = () => process.env.WORKSPACES_ENABLED === 'true';
export const accountColumns = columns => [columns, ...['approval_status', 'profile_type', 'job_seeker', ...(workspaceEnabled() ? ['workspace_status', 'workspace_type'] : [])].filter(key => !columns.split(',').includes(key))].join(',');
export async function canViewWorkspaceProfile(account, viewer, database) {
  const { canViewProfile } = await import('../shared/governance.js');
  if (canViewProfile(account, viewer)) return true;
  if (!viewer?.workspaceEnabled || !account?.id || !canViewProfile(account, { id: account.id })) return false;
  const { createWorkspaceService } = await import('./workspaces.js');
  try { const access=await createWorkspaceService(database ? { database } : {}).current(viewer, account.id); return access.role!=='contributor'; }
  catch (error) { if (error.status === 403) return false; throw error; }
}
