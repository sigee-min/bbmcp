import type {
  AccountRecord,
  WorkspaceAclEffect,
  WorkspaceBuiltinRole,
  WorkspaceMemberRecord,
  WorkspaceMode,
  WorkspacePermission,
  WorkspaceRecord,
  WorkspaceRoleStorageRecord
} from '@ashfox/backend-core';

export const DEFAULT_WORKSPACE_ID = 'ws_default';
export const DEFAULT_WORKSPACE_TENANT_ID = 'default-tenant';
export const DEFAULT_WORKSPACE_NAME = 'Current Workspace';
export const DEFAULT_WORKSPACE_CREATED_BY = 'admin';
export const DEFAULT_SYSTEM_ACCOUNT_ID = 'admin';

export const BUILTIN_WORKSPACE_ADMIN_ROLE_ID = 'role_workspace_admin';
export const BUILTIN_USER_ROLE_ID = 'role_user';
export const ROOT_FOLDER_KEY = '__root__';

export const VALID_WORKSPACE_PERMISSIONS = new Set<WorkspacePermission>([
  'workspace.read',
  'workspace.settings.manage',
  'workspace.members.manage',
  'workspace.roles.manage',
  'folder.read',
  'folder.write',
  'project.read',
  'project.write'
]);

export const isWorkspacePermission = (value: string): value is WorkspacePermission =>
  VALID_WORKSPACE_PERMISSIONS.has(value as WorkspacePermission);

export const WORKSPACE_ADMIN_DEFAULT_PERMISSIONS: WorkspacePermission[] = [
  'workspace.read',
  'workspace.settings.manage',
  'workspace.members.manage',
  'workspace.roles.manage',
  'folder.read',
  'folder.write',
  'project.read',
  'project.write'
];

export const USER_DEFAULT_PERMISSIONS: WorkspacePermission[] = [
  'workspace.read',
  'folder.read',
  'folder.write',
  'project.read',
  'project.write'
];

export type WorkspaceSeedTemplate = {
  workspace: WorkspaceRecord;
  systemAccount: AccountRecord;
  roles: [WorkspaceRoleStorageRecord, WorkspaceRoleStorageRecord];
  member: WorkspaceMemberRecord;
};

export const normalizeTimestamp = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
};

export const parseJsonStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  if (typeof value !== 'string') {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [];
  }
};

export const uniqueStrings = (values: readonly string[]): string[] => {
  const deduped = new Set<string>();
  for (const value of values) {
    const normalized = String(value).trim();
    if (!normalized) continue;
    deduped.add(normalized);
  }
  return Array.from(deduped.values());
};

export const parseWorkspaceMode = (value: unknown): WorkspaceMode => (value === 'rbac' ? 'rbac' : 'all_open');

export const parseWorkspaceBuiltinRole = (value: unknown): WorkspaceBuiltinRole | null => {
  if (value === 'workspace_admin' || value === 'user') {
    return value;
  }
  return null;
};

export const parseWorkspaceAclEffect = (value: unknown): WorkspaceAclEffect => {
  if (value === 'allow' || value === 'deny' || value === 'inherit') {
    return value;
  }
  return 'inherit';
};

export const parseWorkspacePermissionArray = (value: unknown): WorkspacePermission[] => {
  const permissions = parseJsonStringArray(value);
  const result: WorkspacePermission[] = [];
  for (const permission of permissions) {
    if (VALID_WORKSPACE_PERMISSIONS.has(permission as WorkspacePermission)) {
      result.push(permission as WorkspacePermission);
    }
  }
  return uniqueStrings(result) as WorkspacePermission[];
};

export const toAclFolderKey = (folderId: string | null): string => {
  const normalized = typeof folderId === 'string' ? folderId.trim() : '';
  return normalized.length > 0 ? normalized : ROOT_FOLDER_KEY;
};

export const fromAclFolderKey = (folderKey: string): string | null => (folderKey === ROOT_FOLDER_KEY ? null : folderKey);

export const createWorkspaceSeedTemplate = (now: string = new Date().toISOString()): WorkspaceSeedTemplate => {
  const workspace: WorkspaceRecord = {
    workspaceId: DEFAULT_WORKSPACE_ID,
    tenantId: DEFAULT_WORKSPACE_TENANT_ID,
    name: DEFAULT_WORKSPACE_NAME,
    mode: 'all_open',
    createdBy: DEFAULT_WORKSPACE_CREATED_BY,
    createdAt: now,
    updatedAt: now
  };

  const systemAccount: AccountRecord = {
    accountId: DEFAULT_SYSTEM_ACCOUNT_ID,
    email: 'admin@ashfox.local',
    displayName: 'Administrator',
    systemRoles: ['system_admin'],
    localLoginId: null,
    passwordHash: null,
    githubUserId: null,
    githubLogin: null,
    createdAt: now,
    updatedAt: now
  };

  const roles: [WorkspaceRoleStorageRecord, WorkspaceRoleStorageRecord] = [
    {
      workspaceId: DEFAULT_WORKSPACE_ID,
      roleId: BUILTIN_WORKSPACE_ADMIN_ROLE_ID,
      name: 'Workspace Admin',
      builtin: 'workspace_admin',
      permissions: WORKSPACE_ADMIN_DEFAULT_PERMISSIONS,
      createdAt: now,
      updatedAt: now
    },
    {
      workspaceId: DEFAULT_WORKSPACE_ID,
      roleId: BUILTIN_USER_ROLE_ID,
      name: 'User',
      builtin: 'user',
      permissions: USER_DEFAULT_PERMISSIONS,
      createdAt: now,
      updatedAt: now
    }
  ];

  const member: WorkspaceMemberRecord = {
    workspaceId: DEFAULT_WORKSPACE_ID,
    accountId: DEFAULT_SYSTEM_ACCOUNT_ID,
    roleIds: [BUILTIN_WORKSPACE_ADMIN_ROLE_ID],
    joinedAt: now
  };

  return {
    workspace,
    systemAccount,
    roles,
    member
  };
};

export const ensureWorkspaceBuiltinRoles = (
  roles: WorkspaceRoleStorageRecord[],
  workspaceId: string,
  now: string = new Date().toISOString()
): void => {
  const hasAdmin = roles.some((role) => role.workspaceId === workspaceId && role.builtin === 'workspace_admin');
  if (!hasAdmin) {
    roles.push({
      workspaceId,
      roleId: BUILTIN_WORKSPACE_ADMIN_ROLE_ID,
      name: 'Workspace Admin',
      builtin: 'workspace_admin',
      permissions: WORKSPACE_ADMIN_DEFAULT_PERMISSIONS,
      createdAt: now,
      updatedAt: now
    });
  }

  const hasUser = roles.some((role) => role.workspaceId === workspaceId && role.builtin === 'user');
  if (!hasUser) {
    roles.push({
      workspaceId,
      roleId: BUILTIN_USER_ROLE_ID,
      name: 'User',
      builtin: 'user',
      permissions: USER_DEFAULT_PERMISSIONS,
      createdAt: now,
      updatedAt: now
    });
  }
};
