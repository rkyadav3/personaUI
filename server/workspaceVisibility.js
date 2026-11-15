export const workspaceEnabled = () => process.env.WORKSPACES_ENABLED === 'true';
export const accountColumns = columns => workspaceEnabled() ? `${columns},workspace_status,workspace_type` : columns;
