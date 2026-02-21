import {
  toAutoProvisionedWorkspaceId,
  toAutoProvisionedWorkspaceName,
  WORKSPACE_ADMIN_ROLE_NAME,
  WORKSPACE_MEMBER_ROLE_NAME,
  type AccountRecord,
  type ServiceSettingsRecord,
  type WorkspaceFolderAclRecord,
  type WorkspaceAclEffect,
  type WorkspaceBuiltinRole,
  type WorkspaceMemberRecord,
  type WorkspaceRecord,
  type WorkspaceRoleStorageRecord
} from '@ashfox/backend-core';

export const DEFAULT_WORKSPACE_TENANT_ID = 'default-tenant';
export const DEFAULT_WORKSPACE_CREATED_BY = 'admin';
export const DEFAULT_SYSTEM_ACCOUNT_ID = 'admin';
export const DEFAULT_WORKSPACE_ID = toAutoProvisionedWorkspaceId(DEFAULT_SYSTEM_ACCOUNT_ID);
export const DEFAULT_WORKSPACE_NAME = toAutoProvisionedWorkspaceName('Administrator');

export const BUILTIN_WORKSPACE_ADMIN_ROLE_ID = 'role_workspace_admin';
export const BUILTIN_USER_ROLE_ID = 'role_user';
export const ROOT_FOLDER_KEY = '__root__';
export const WORKSPACE_SCOPE_KEY = '__workspace__';
export const DEFAULT_MEMBER_ROLE_ID = BUILTIN_USER_ROLE_ID;
export const DEFAULT_SERVICE_GITHUB_SCOPES = 'read:user user:email';

export type WorkspaceSeedTemplate = {
  workspace: WorkspaceRecord;
  systemAccount: AccountRecord;
  roles: [WorkspaceRoleStorageRecord, WorkspaceRoleStorageRecord];
  member: WorkspaceMemberRecord;
  folderAcl: [WorkspaceFolderAclRecord];
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

export const DEFAULT_SERVICE_SEARCH_LIMIT = 25;
export const MAX_SERVICE_SEARCH_LIMIT = 100;

export const normalizeServiceSearchLimit = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_SERVICE_SEARCH_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(value), 1), MAX_SERVICE_SEARCH_LIMIT);
};

export const normalizeServiceSearchCursorOffset = (value: unknown): number => {
  if (typeof value !== 'string') {
    return 0;
  }
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
};

export const normalizeServiceSearchToken = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

export const escapeSqlLikePattern = (value: string): string => value.replace(/[\\%_]/g, '\\$&');

export const normalizeRequiredAccountId = (value: unknown, context = 'accountId'): string => {
  const normalized = String(value ?? '').trim();
  if (normalized.length === 0) {
    throw new Error(`${context} must be a non-empty string.`);
  }
  return normalized;
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

export const parseWorkspaceBuiltinRole = (value: unknown): WorkspaceBuiltinRole | null => {
  if (value === 'workspace_admin') {
    return value;
  }
  return null;
};

export const normalizeDefaultMemberRoleId = (value: unknown): string => {
  if (typeof value !== 'string') {
    return DEFAULT_MEMBER_ROLE_ID;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : DEFAULT_MEMBER_ROLE_ID;
};

const canAssignWorkspaceDefaultMemberRole = (
  role: Pick<WorkspaceRoleStorageRecord, 'builtin'>
): boolean => role.builtin !== 'workspace_admin';

const resolveWorkspaceDefaultMemberRoleId = (
  workspaceId: string,
  roles: readonly WorkspaceRoleStorageRecord[],
  preferredRoleId?: string | null
): string => {
  const scopedRoles = roles.filter((role) => role.workspaceId === workspaceId);
  const roleMap = new Map(scopedRoles.map((role) => [role.roleId, role]));

  const normalizedPreferredRoleId = typeof preferredRoleId === 'string' ? preferredRoleId.trim() : '';
  if (normalizedPreferredRoleId.length > 0) {
    const preferredRole = roleMap.get(normalizedPreferredRoleId);
    if (preferredRole && canAssignWorkspaceDefaultMemberRole(preferredRole)) {
      return preferredRole.roleId;
    }
  }

  const defaultUserRole = roleMap.get(DEFAULT_MEMBER_ROLE_ID);
  if (defaultUserRole && canAssignWorkspaceDefaultMemberRole(defaultUserRole)) {
    return defaultUserRole.roleId;
  }

  const firstAssignableRole = scopedRoles.find((role) => canAssignWorkspaceDefaultMemberRole(role));
  if (firstAssignableRole) {
    return firstAssignableRole.roleId;
  }

  return DEFAULT_MEMBER_ROLE_ID;
};

export const ensureWorkspaceDefaultMemberRole = (
  workspace: WorkspaceRecord,
  roles: readonly WorkspaceRoleStorageRecord[]
): void => {
  workspace.defaultMemberRoleId = resolveWorkspaceDefaultMemberRoleId(
    workspace.workspaceId,
    roles,
    workspace.defaultMemberRoleId
  );
};

export const parseWorkspaceAclEffect = (value: unknown): WorkspaceAclEffect => {
  if (value === 'allow' || value === 'deny' || value === 'inherit') {
    return value;
  }
  return 'inherit';
};

export const toAclFolderKey = (folderId: string | null): string => {
  const normalized = typeof folderId === 'string' ? folderId.trim() : '';
  return normalized.length > 0 ? normalized : ROOT_FOLDER_KEY;
};

export const fromAclFolderKey = (folderKey: string): string | null => (folderKey === ROOT_FOLDER_KEY ? null : folderKey);

export const toAclStorageFolderKey = (scope: 'workspace' | 'folder' | undefined, folderId: string | null): string => {
  if (scope === 'workspace') {
    return WORKSPACE_SCOPE_KEY;
  }
  return toAclFolderKey(folderId);
};

export const fromAclStorageFolderKey = (
  folderKey: string
): { scope: 'workspace' | 'folder'; folderId: string | null } => {
  if (folderKey === WORKSPACE_SCOPE_KEY) {
    return {
      scope: 'workspace',
      folderId: null
    };
  }
  return {
    scope: 'folder',
    folderId: fromAclFolderKey(folderKey)
  };
};

export const createDefaultUserRootAcl = (
  workspaceId: string,
  now: string = new Date().toISOString()
): WorkspaceFolderAclRecord => ({
  workspaceId,
  ruleId: 'acl_folder_user_write',
  scope: 'folder',
  folderId: null,
  roleIds: [BUILTIN_USER_ROLE_ID],
  read: 'allow',
  write: 'allow',
  locked: false,
  updatedAt: now
});

export const ensureWorkspaceDefaultFolderAcl = (
  folderAcl: WorkspaceFolderAclRecord[],
  workspaceId: string,
  now: string = new Date().toISOString()
): void => {
  const hasUserRootAcl = folderAcl.some(
    (acl) =>
      acl.workspaceId === workspaceId &&
      (acl.scope ?? 'folder') === 'folder' &&
      acl.roleIds.includes(BUILTIN_USER_ROLE_ID) &&
      (acl.folderId === null || acl.folderId.trim().length === 0)
  );
  if (!hasUserRootAcl) {
    folderAcl.push(createDefaultUserRootAcl(workspaceId, now));
  }
};

export const createWorkspaceSeedTemplate = (now: string = new Date().toISOString()): WorkspaceSeedTemplate => {
  const workspace: WorkspaceRecord = {
    workspaceId: DEFAULT_WORKSPACE_ID,
    tenantId: DEFAULT_WORKSPACE_TENANT_ID,
    name: DEFAULT_WORKSPACE_NAME,
    defaultMemberRoleId: DEFAULT_MEMBER_ROLE_ID,
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
      name: WORKSPACE_ADMIN_ROLE_NAME,
      builtin: 'workspace_admin',
      createdAt: now,
      updatedAt: now
    },
    {
      workspaceId: DEFAULT_WORKSPACE_ID,
      roleId: BUILTIN_USER_ROLE_ID,
      name: WORKSPACE_MEMBER_ROLE_NAME,
      builtin: null,
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
  const folderAcl: [WorkspaceFolderAclRecord] = [createDefaultUserRootAcl(DEFAULT_WORKSPACE_ID, now)];

  return {
    workspace,
    systemAccount,
    roles,
    member,
    folderAcl
  };
};

const toStringOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const toIntegerOrNull = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : null;
};

export const createDefaultServiceSettings = (
  now: string = new Date().toISOString(),
  updatedBy: string = DEFAULT_SYSTEM_ACCOUNT_ID
): ServiceSettingsRecord => {
  const normalizedNow = normalizeTimestamp(now);
  const normalizedUpdatedBy = String(updatedBy ?? '').trim() || DEFAULT_SYSTEM_ACCOUNT_ID;
  return {
    smtp: {
      enabled: false,
      host: null,
      port: null,
      secure: false,
      username: null,
      passwordEncrypted: null,
      fromEmail: null,
      fromName: null,
      updatedBy: normalizedUpdatedBy,
      updatedAt: normalizedNow
    },
    githubAuth: {
      enabled: false,
      clientId: null,
      clientSecretEncrypted: null,
      callbackUrl: null,
      scopes: DEFAULT_SERVICE_GITHUB_SCOPES,
      updatedBy: normalizedUpdatedBy,
      updatedAt: normalizedNow
    },
    createdAt: normalizedNow,
    updatedAt: normalizedNow
  };
};

export const normalizeServiceSettings = (
  value: unknown,
  fallback: ServiceSettingsRecord = createDefaultServiceSettings()
): ServiceSettingsRecord => {
  const base = createDefaultServiceSettings(fallback.updatedAt, fallback.smtp.updatedBy);
  const record =
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const smtp =
    record.smtp && typeof record.smtp === 'object' && !Array.isArray(record.smtp)
      ? (record.smtp as Record<string, unknown>)
      : {};
  const githubAuth =
    record.githubAuth && typeof record.githubAuth === 'object' && !Array.isArray(record.githubAuth)
      ? (record.githubAuth as Record<string, unknown>)
      : {};

  const smtpUpdatedBy = toStringOrNull(smtp.updatedBy) ?? fallback.smtp.updatedBy ?? base.smtp.updatedBy;
  const githubUpdatedBy = toStringOrNull(githubAuth.updatedBy) ?? fallback.githubAuth.updatedBy ?? base.githubAuth.updatedBy;
  const createdAt = normalizeTimestamp(record.createdAt ?? fallback.createdAt ?? base.createdAt);
  const updatedAt = normalizeTimestamp(record.updatedAt ?? fallback.updatedAt ?? base.updatedAt);

  return {
    smtp: {
      enabled: smtp.enabled === true,
      host: toStringOrNull(smtp.host) ?? fallback.smtp.host ?? null,
      port: toIntegerOrNull(smtp.port) ?? fallback.smtp.port ?? null,
      secure: smtp.secure === true,
      username: toStringOrNull(smtp.username) ?? fallback.smtp.username ?? null,
      passwordEncrypted: toStringOrNull(smtp.passwordEncrypted) ?? fallback.smtp.passwordEncrypted ?? null,
      fromEmail: toStringOrNull(smtp.fromEmail) ?? fallback.smtp.fromEmail ?? null,
      fromName: toStringOrNull(smtp.fromName) ?? fallback.smtp.fromName ?? null,
      updatedBy: smtpUpdatedBy,
      updatedAt: normalizeTimestamp(smtp.updatedAt ?? fallback.smtp.updatedAt ?? updatedAt)
    },
    githubAuth: {
      enabled: githubAuth.enabled === true,
      clientId: toStringOrNull(githubAuth.clientId) ?? fallback.githubAuth.clientId ?? null,
      clientSecretEncrypted:
        toStringOrNull(githubAuth.clientSecretEncrypted) ?? fallback.githubAuth.clientSecretEncrypted ?? null,
      callbackUrl: toStringOrNull(githubAuth.callbackUrl) ?? fallback.githubAuth.callbackUrl ?? null,
      scopes: toStringOrNull(githubAuth.scopes) ?? fallback.githubAuth.scopes ?? DEFAULT_SERVICE_GITHUB_SCOPES,
      updatedBy: githubUpdatedBy,
      updatedAt: normalizeTimestamp(githubAuth.updatedAt ?? fallback.githubAuth.updatedAt ?? updatedAt)
    },
    createdAt,
    updatedAt
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
      name: WORKSPACE_ADMIN_ROLE_NAME,
      builtin: 'workspace_admin',
      createdAt: now,
      updatedAt: now
    });
  }

  const hasDefaultMemberRole = roles.some((role) => role.workspaceId === workspaceId && role.roleId === DEFAULT_MEMBER_ROLE_ID);
  if (!hasDefaultMemberRole) {
    roles.push({
      workspaceId,
      roleId: DEFAULT_MEMBER_ROLE_ID,
      name: WORKSPACE_MEMBER_ROLE_NAME,
      builtin: null,
      createdAt: now,
      updatedAt: now
    });
  }
};
