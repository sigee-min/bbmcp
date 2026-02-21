export {
  evaluateWorkspaceFolderPermission,
  type BackendAvailability,
  type BackendHealth,
  type BackendKind,
  type BackendPort,
  type BackendSessionRef,
  type BackendToolContext,
  hasSystemRole,
  isSystemManager,
  normalizeSystemRoles,
  normalizeWorkspaceRoleName,
  SYSTEM_ROLES,
  type SystemRole,
  WORKSPACE_ADMIN_ROLE_NAME,
  WORKSPACE_MEMBER_ROLE_NAME,
  type WorkspaceAclEffect,
  type WorkspaceBuiltinRole,
  type WorkspacePermission
} from './types';
export * from './errors';
export * from './locks';
export * from './registry';
export * from './persistence';
export * from './queue';
export {
  isAutoProvisionedWorkspaceId,
  toAutoProvisionedWorkspaceId,
  toAutoProvisionedWorkspaceName
} from './workspaceProvisioning';
