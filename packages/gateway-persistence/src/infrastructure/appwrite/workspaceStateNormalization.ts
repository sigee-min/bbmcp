import type {
  AccountRecord,
  ProjectRepositoryScope,
  ServiceSettingsRecord,
  WorkspaceApiKeyRecord,
  WorkspaceFolderAclRecord,
  WorkspaceMemberRecord,
  WorkspaceRecord,
  WorkspaceRoleStorageRecord
} from '@ashfox/backend-core';
import {
  createDefaultServiceSettings,
  createWorkspaceSeedTemplate,
  DEFAULT_WORKSPACE_CREATED_BY,
  ensureWorkspaceBuiltinRoles,
  ensureWorkspaceDefaultFolderAcl,
  ensureWorkspaceDefaultMemberRole,
  fromAclStorageFolderKey,
  normalizeDefaultMemberRoleId,
  normalizeServiceSettings,
  normalizeTimestamp,
  parseJsonStringArray,
  parseWorkspaceAclEffect,
  parseWorkspaceBuiltinRole,
  toAclStorageFolderKey,
  uniqueStrings
} from '../workspace/common';

export type ProjectDocumentData = {
  tenantId: string;
  projectId: string;
  revision: string;
  stateJson: string;
  createdAt: string;
  updatedAt: string;
};

export type AppwriteProjectDocument = Partial<ProjectDocumentData> & {
  $id?: string;
  $createdAt?: string;
  $updatedAt?: string;
};

export type AppwriteProjectLockState = {
  owner: string;
  expiresAt: string;
};

export type WorkspaceStateDocument = {
  workspaces: WorkspaceRecord[];
  accounts: AccountRecord[];
  members: WorkspaceMemberRecord[];
  roles: WorkspaceRoleStorageRecord[];
  folderAcl: WorkspaceFolderAclRecord[];
  apiKeys: WorkspaceApiKeyRecord[];
  serviceSettings: ServiceSettingsRecord;
};

export const normalizeRequired = (value: string, field: string): string => {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return normalized;
};

export const resolvePositiveInt = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const next = Math.trunc(value);
  return next > 0 ? next : fallback;
};

export const parseState = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

export const parseLockState = (document: AppwriteProjectDocument | null): AppwriteProjectLockState | null => {
  if (!document) return null;
  const state = parseState(document.stateJson);
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  const owner = (state as { owner?: unknown }).owner;
  const expiresAt = (state as { expiresAt?: unknown }).expiresAt;
  if (typeof owner !== 'string' || typeof expiresAt !== 'string') return null;
  return {
    owner,
    expiresAt
  };
};

export const isExpired = (expiresAt: string): boolean => {
  const parsed = Date.parse(expiresAt);
  if (!Number.isFinite(parsed)) return true;
  return parsed <= Date.now();
};

export const sleep = async (delayMs: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
};

export const createDefaultWorkspaceState = (): WorkspaceStateDocument => {
  const seed = createWorkspaceSeedTemplate();
  const now = new Date().toISOString();
  return {
    workspaces: [seed.workspace],
    accounts: [seed.systemAccount],
    members: [seed.member],
    roles: [...seed.roles],
    folderAcl: [...seed.folderAcl],
    apiKeys: [],
    serviceSettings: createDefaultServiceSettings(now, seed.systemAccount.accountId)
  };
};

export const parseSystemRoles = (value: unknown): Array<'system_admin' | 'cs_admin'> =>
  parseJsonStringArray(value).filter((role): role is 'system_admin' | 'cs_admin' => role === 'system_admin' || role === 'cs_admin');

export const normalizeOptionalTimestamp = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }
  return normalizeTimestamp(normalized);
};

export const normalizeAclRoleIds = (value: unknown, fallbackRoleId?: string): string[] => {
  const roleIds = uniqueStrings(parseJsonStringArray(value));
  if (roleIds.length > 0) {
    return roleIds;
  }
  if (typeof fallbackRoleId === 'string' && fallbackRoleId.trim().length > 0) {
    return [fallbackRoleId.trim()];
  }
  return [];
};

export const toAclTemplateRuleId = (
  scope: 'workspace' | 'folder',
  storageFolderKey: string,
  read: WorkspaceFolderAclRecord['read'],
  write: WorkspaceFolderAclRecord['write'],
  locked: boolean
): string =>
  `acl_${Buffer.from([scope, storageFolderKey, read, write, locked ? '1' : '0'].join('::'), 'utf8').toString('base64url')}`;

export const normalizeWorkspaceState = (value: unknown): WorkspaceStateDocument | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const workspacesRaw = Array.isArray(record.workspaces) ? record.workspaces : [];
  const accountsRaw = Array.isArray(record.accounts) ? record.accounts : [];
  const membersRaw = Array.isArray(record.members) ? record.members : [];
  const rolesRaw = Array.isArray(record.roles) ? record.roles : [];
  const folderAclRaw = Array.isArray(record.folderAcl) ? record.folderAcl : [];
  const apiKeysRaw = Array.isArray(record.apiKeys) ? record.apiKeys : [];

  const workspaces = workspacesRaw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => ({
      workspaceId: normalizeRequired(String(entry.workspaceId ?? ''), 'workspaceId'),
      tenantId: normalizeRequired(String(entry.tenantId ?? ''), 'tenantId'),
      name: String(entry.name ?? '').trim() || 'Workspace',
      defaultMemberRoleId: normalizeDefaultMemberRoleId(entry.defaultMemberRoleId),
      createdBy: String(entry.createdBy ?? '').trim() || DEFAULT_WORKSPACE_CREATED_BY,
      createdAt: normalizeTimestamp(entry.createdAt),
      updatedAt: normalizeTimestamp(entry.updatedAt)
    }));
  if (workspaces.length === 0) return null;

  const accounts = accountsRaw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => ({
      accountId: normalizeRequired(String(entry.accountId ?? ''), 'accountId'),
      email: String(entry.email ?? '').trim() || 'unknown@ashfox.local',
      displayName: String(entry.displayName ?? '').trim() || 'User',
      systemRoles: parseSystemRoles(entry.systemRoles),
      localLoginId:
        typeof entry.localLoginId === 'string' && entry.localLoginId.trim().length > 0 ? entry.localLoginId.trim().toLowerCase() : null,
      passwordHash: typeof entry.passwordHash === 'string' && entry.passwordHash.trim().length > 0 ? entry.passwordHash.trim() : null,
      githubUserId: typeof entry.githubUserId === 'string' && entry.githubUserId.trim().length > 0 ? entry.githubUserId.trim() : null,
      githubLogin: typeof entry.githubLogin === 'string' && entry.githubLogin.trim().length > 0 ? entry.githubLogin.trim() : null,
      createdAt: normalizeTimestamp(entry.createdAt),
      updatedAt: normalizeTimestamp(entry.updatedAt)
    }));

  const members = membersRaw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => ({
      workspaceId: normalizeRequired(String(entry.workspaceId ?? ''), 'workspaceId'),
      accountId: normalizeRequired(String(entry.accountId ?? ''), 'accountId'),
      roleIds: uniqueStrings(parseJsonStringArray(entry.roleIds)),
      joinedAt: normalizeTimestamp(entry.joinedAt)
    }));

  const roles = rolesRaw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => ({
      workspaceId: normalizeRequired(String(entry.workspaceId ?? ''), 'workspaceId'),
      roleId: normalizeRequired(String(entry.roleId ?? ''), 'roleId'),
      name: String(entry.name ?? '').trim() || 'Role',
      builtin: parseWorkspaceBuiltinRole(entry.builtin),
      createdAt: normalizeTimestamp(entry.createdAt),
      updatedAt: normalizeTimestamp(entry.updatedAt)
    }));

  const folderAcl = folderAclRaw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry): WorkspaceFolderAclRecord | null => {
      const storageKey = toAclStorageFolderKey(
        entry.scope === 'workspace' ? 'workspace' : 'folder',
        typeof entry.folderId === 'string' ? entry.folderId : null
      );
      const parsedKey = fromAclStorageFolderKey(storageKey);
      const read = parseWorkspaceAclEffect(entry.read);
      const write = parseWorkspaceAclEffect(entry.write);
      const locked = entry.locked === true;
      const roleIds = normalizeAclRoleIds(entry.roleIds, typeof entry.roleId === 'string' ? entry.roleId : undefined);
      if (roleIds.length === 0) {
        return null;
      }
      return {
        workspaceId: normalizeRequired(String(entry.workspaceId ?? ''), 'workspaceId'),
        ruleId:
          typeof entry.ruleId === 'string' && entry.ruleId.trim().length > 0
            ? entry.ruleId.trim()
            : toAclTemplateRuleId(parsedKey.scope, storageKey, read, write, locked),
        scope: parsedKey.scope,
        folderId: parsedKey.folderId,
        roleIds,
        read,
        write,
        locked,
        updatedAt: normalizeTimestamp(entry.updatedAt)
      };
    })
    .filter((entry): entry is WorkspaceFolderAclRecord => entry !== null);

  const apiKeys = apiKeysRaw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => ({
      workspaceId: normalizeRequired(String(entry.workspaceId ?? ''), 'workspaceId'),
      keyId: normalizeRequired(String(entry.keyId ?? ''), 'keyId'),
      name: String(entry.name ?? '').trim() || 'API key',
      keyPrefix: normalizeRequired(String(entry.keyPrefix ?? ''), 'keyPrefix'),
      keyHash: normalizeRequired(String(entry.keyHash ?? ''), 'keyHash'),
      createdBy: normalizeRequired(String(entry.createdBy ?? ''), 'createdBy'),
      createdAt: normalizeTimestamp(entry.createdAt),
      updatedAt: normalizeTimestamp(entry.updatedAt),
      lastUsedAt: normalizeOptionalTimestamp(entry.lastUsedAt),
      expiresAt: normalizeOptionalTimestamp(entry.expiresAt),
      revokedAt: normalizeOptionalTimestamp(entry.revokedAt)
    }));

  const workspaceKeys = new Set(workspaces.map((workspace) => workspace.workspaceId));
  const normalizedRoles = roles.filter((role) => workspaceKeys.has(role.workspaceId));
  const normalizedFolderAcl = folderAcl.filter((acl) => workspaceKeys.has(acl.workspaceId));
  for (const workspace of workspaces) {
    ensureWorkspaceBuiltinRoles(normalizedRoles, workspace.workspaceId);
    ensureWorkspaceDefaultFolderAcl(normalizedFolderAcl, workspace.workspaceId);
    ensureWorkspaceDefaultMemberRole(workspace, normalizedRoles);
  }
  const serviceSettings = normalizeServiceSettings(record.serviceSettings, createDefaultServiceSettings());
  return {
    workspaces,
    accounts,
    members: members.filter((member) => workspaceKeys.has(member.workspaceId)),
    roles: normalizedRoles,
    folderAcl: normalizedFolderAcl,
    apiKeys: apiKeys.filter((apiKey) => workspaceKeys.has(apiKey.workspaceId)),
    serviceSettings
  };
};

export const dedupeByKey = <T>(entries: readonly T[], keyOf: (entry: T) => string): T[] => {
  const deduped = new Map<string, T>();
  for (const entry of entries) {
    deduped.set(keyOf(entry), entry);
  }
  return Array.from(deduped.values());
};

export const cloneWorkspaceState = (state: WorkspaceStateDocument): WorkspaceStateDocument =>
  JSON.parse(JSON.stringify(state)) as WorkspaceStateDocument;

export const WORKSPACE_STATE_SCOPE: ProjectRepositoryScope = {
  tenantId: '__workspace_meta__',
  projectId: 'workspace-state'
};
