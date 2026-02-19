import { createHash, randomUUID } from 'node:crypto';
import type {
  AccountRecord,
  PersistedProjectRecord,
  ProjectRepository,
  ProjectRepositoryScope,
  WorkspaceFolderAclRecord,
  WorkspaceMemberRecord,
  WorkspaceRecord,
  WorkspaceRepository,
  WorkspaceRoleStorageRecord
} from '@ashfox/backend-core';
import type { AppwriteDatabaseConfig } from '../config';
import { createAppwriteTransport } from './appwrite/transport';
import {
  DEFAULT_WORKSPACE_CREATED_BY,
  ensureWorkspaceBuiltinRoles as ensureBuiltinWorkspaceRoles,
  fromAclFolderKey,
  normalizeTimestamp,
  parseJsonStringArray,
  parseWorkspaceAclEffect,
  parseWorkspaceBuiltinRole,
  parseWorkspaceMode,
  parseWorkspacePermissionArray,
  toAclFolderKey,
  uniqueStrings,
  createWorkspaceSeedTemplate
} from './workspace/common';

export interface AppwriteProjectRepositoryOptions {
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  lockTtlMs?: number;
  lockTimeoutMs?: number;
  lockRetryMs?: number;
  sleepImpl?: (delayMs: number) => Promise<void>;
}

type ProjectDocumentData = {
  tenantId: string;
  projectId: string;
  revision: string;
  stateJson: string;
  createdAt: string;
  updatedAt: string;
};

type AppwriteProjectDocument = Partial<ProjectDocumentData> & {
  $id?: string;
  $createdAt?: string;
  $updatedAt?: string;
};

type AppwriteProjectLockState = {
  owner: string;
  expiresAt: string;
};

type WorkspaceStateDocument = {
  version: 1;
  workspaces: WorkspaceRecord[];
  accounts: AccountRecord[];
  members: WorkspaceMemberRecord[];
  roles: WorkspaceRoleStorageRecord[];
  folderAcl: WorkspaceFolderAclRecord[];
};

const DEFAULT_LOCK_TTL_MS = 15000;
const DEFAULT_LOCK_TIMEOUT_MS = 10000;
const DEFAULT_LOCK_RETRY_MS = 25;
const WORKSPACE_STATE_SCOPE: ProjectRepositoryScope = {
  tenantId: '__workspace_meta__',
  projectId: 'workspace-state-v1'
};

const normalizeRequired = (value: string, field: string): string => {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return normalized;
};

const toDocumentId = (scope: ProjectRepositoryScope): string => {
  const key = `${scope.tenantId}::${scope.projectId}`;
  const digest = createHash('sha256').update(key).digest('hex');
  return `p${digest.slice(0, 35)}`;
};

const toLockDocumentId = (scope: ProjectRepositoryScope): string => {
  const key = `${scope.tenantId}::${scope.projectId}`;
  const digest = createHash('sha256').update(key).digest('hex');
  return `l${digest.slice(0, 35)}`;
};

const resolvePositiveInt = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const next = Math.trunc(value);
  return next > 0 ? next : fallback;
};

const parseLockState = (document: AppwriteProjectDocument | null): AppwriteProjectLockState | null => {
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

const isExpired = (expiresAt: string): boolean => {
  const parsed = Date.parse(expiresAt);
  if (!Number.isFinite(parsed)) return true;
  return parsed <= Date.now();
};

const sleep = async (delayMs: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
};

const parseState = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const createDefaultWorkspaceState = (): WorkspaceStateDocument => {
  const seed = createWorkspaceSeedTemplate();
  return {
    version: 1,
    workspaces: [seed.workspace],
    accounts: [seed.systemAccount],
    members: [seed.member],
    roles: [...seed.roles],
    folderAcl: []
  };
};

const parseSystemRoles = (value: unknown): Array<'system_admin' | 'cs_admin'> =>
  parseJsonStringArray(value).filter((role): role is 'system_admin' | 'cs_admin' => role === 'system_admin' || role === 'cs_admin');

const normalizeWorkspaceState = (value: unknown): WorkspaceStateDocument | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const workspacesRaw = Array.isArray(record.workspaces) ? record.workspaces : [];
  const accountsRaw = Array.isArray(record.accounts) ? record.accounts : [];
  const membersRaw = Array.isArray(record.members) ? record.members : [];
  const rolesRaw = Array.isArray(record.roles) ? record.roles : [];
  const folderAclRaw = Array.isArray(record.folderAcl) ? record.folderAcl : [];

  const workspaces = workspacesRaw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => ({
      workspaceId: normalizeRequired(String(entry.workspaceId ?? ''), 'workspaceId'),
      tenantId: normalizeRequired(String(entry.tenantId ?? ''), 'tenantId'),
      name: String(entry.name ?? '').trim() || 'Workspace',
      mode: parseWorkspaceMode(entry.mode),
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
      passwordHash:
        typeof entry.passwordHash === 'string' && entry.passwordHash.trim().length > 0 ? entry.passwordHash.trim() : null,
      githubUserId:
        typeof entry.githubUserId === 'string' && entry.githubUserId.trim().length > 0 ? entry.githubUserId.trim() : null,
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
      permissions: parseWorkspacePermissionArray(entry.permissions),
      createdAt: normalizeTimestamp(entry.createdAt),
      updatedAt: normalizeTimestamp(entry.updatedAt)
    }));

  const folderAcl = folderAclRaw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => ({
      workspaceId: normalizeRequired(String(entry.workspaceId ?? ''), 'workspaceId'),
      folderId: fromAclFolderKey(toAclFolderKey(typeof entry.folderId === 'string' ? entry.folderId : null)),
      roleId: normalizeRequired(String(entry.roleId ?? ''), 'roleId'),
      read: parseWorkspaceAclEffect(entry.read),
      write: parseWorkspaceAclEffect(entry.write),
      updatedAt: normalizeTimestamp(entry.updatedAt)
    }));

  const workspaceKeys = new Set(workspaces.map((workspace) => workspace.workspaceId));
  return {
    version: 1,
    workspaces,
    accounts,
    members: members.filter((member) => workspaceKeys.has(member.workspaceId)),
    roles: roles.filter((role) => workspaceKeys.has(role.workspaceId)),
    folderAcl: folderAcl.filter((acl) => workspaceKeys.has(acl.workspaceId))
  };
};

const dedupeByKey = <T>(entries: readonly T[], keyOf: (entry: T) => string): T[] => {
  const deduped = new Map<string, T>();
  for (const entry of entries) {
    deduped.set(keyOf(entry), entry);
  }
  return Array.from(deduped.values());
};

const cloneWorkspaceState = (state: WorkspaceStateDocument): WorkspaceStateDocument =>
  JSON.parse(JSON.stringify(state)) as WorkspaceStateDocument;

export class AppwriteProjectRepository implements ProjectRepository, WorkspaceRepository {
  private readonly config: AppwriteDatabaseConfig;
  private readonly transport: ReturnType<typeof createAppwriteTransport<AppwriteDatabaseConfig>>;
  private readonly documentsPath: string;
  private readonly lockTtlMs: number;
  private readonly lockTimeoutMs: number;
  private readonly lockRetryMs: number;
  private readonly sleepImpl: (delayMs: number) => Promise<void>;

  constructor(config: AppwriteDatabaseConfig, options: AppwriteProjectRepositoryOptions = {}) {
    this.transport = createAppwriteTransport(config, { fetchImpl: options.fetchImpl });
    this.config = this.transport.config;
    this.lockTtlMs = resolvePositiveInt(options.lockTtlMs, DEFAULT_LOCK_TTL_MS);
    this.lockTimeoutMs = resolvePositiveInt(options.lockTimeoutMs, DEFAULT_LOCK_TIMEOUT_MS);
    this.lockRetryMs = resolvePositiveInt(options.lockRetryMs, DEFAULT_LOCK_RETRY_MS);
    this.sleepImpl = options.sleepImpl ?? sleep;
    this.documentsPath = `/databases/${encodeURIComponent(this.config.databaseId)}/collections/${encodeURIComponent(this.config.collectionId)}/documents`;
  }

  private toDocumentPath(documentId: string): string {
    return `${this.documentsPath}/${encodeURIComponent(documentId)}`;
  }

  private async readDocument(documentId: string, action: string): Promise<AppwriteProjectDocument | null> {
    const response = await this.request('GET', this.toDocumentPath(documentId));
    if (response.status === 404) return null;
    if (!response.ok) {
      throw await this.transport.toError(response, action);
    }
    return (await response.json()) as AppwriteProjectDocument;
  }

  private async deleteDocument(documentId: string, action: string): Promise<void> {
    const response = await this.request('DELETE', this.toDocumentPath(documentId));
    if (response.status === 404) return;
    if (!response.ok) {
      throw await this.transport.toError(response, action);
    }
  }

  private async acquireScopeLock(scope: ProjectRepositoryScope): Promise<{ lockDocumentId: string; owner: string }> {
    const lockDocumentId = toLockDocumentId(scope);
    const owner = `${process.pid}-${randomUUID()}`;
    const lockTenantId = `__lock__:${scope.tenantId}`;
    const deadline = Date.now() + this.lockTimeoutMs;

    while (Date.now() <= deadline) {
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + this.lockTtlMs).toISOString();
      const createResponse = await this.request('POST', this.documentsPath, {
        json: {
          documentId: lockDocumentId,
          data: {
            tenantId: lockTenantId,
            projectId: scope.projectId,
            revision: owner,
            stateJson: JSON.stringify({ owner, expiresAt }),
            createdAt: now,
            updatedAt: now
          }
        }
      });

      if (createResponse.ok) {
        return { lockDocumentId, owner };
      }

      if (createResponse.status !== 409) {
        throw await this.transport.toError(createResponse, 'acquire lock');
      }

      const existingLockDocument = await this.readDocument(lockDocumentId, 'read lock');
      const lockState = parseLockState(existingLockDocument);
      if (!lockState || isExpired(lockState.expiresAt)) {
        await this.deleteDocument(lockDocumentId, 'delete stale lock');
      }
      await this.sleepImpl(this.lockRetryMs);
    }

    throw new Error(`Appwrite lock acquisition timed out after ${this.lockTimeoutMs}ms.`);
  }

  private async releaseScopeLock(scope: ProjectRepositoryScope, owner: string): Promise<void> {
    const lockDocumentId = toLockDocumentId(scope);
    const existingLockDocument = await this.readDocument(lockDocumentId, 'read lock before release');
    const lockState = parseLockState(existingLockDocument);
    if (!lockState || lockState.owner !== owner) {
      return;
    }
    await this.deleteDocument(lockDocumentId, 'release lock');
  }

  private async request(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    options: { json?: unknown } = {}
  ): Promise<Response> {
    return this.transport.request(method, path, options);
  }

  private toWorkspaceStateRecord(state: WorkspaceStateDocument, existing: PersistedProjectRecord | null): PersistedProjectRecord {
    const serialized = JSON.stringify(state);
    const revision = createHash('sha256').update(serialized).digest('hex');
    const now = new Date().toISOString();
    return {
      scope: WORKSPACE_STATE_SCOPE,
      revision,
      state,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
  }

  private async readWorkspaceStateContainer(): Promise<{
    record: PersistedProjectRecord | null;
    state: WorkspaceStateDocument;
  }> {
    const record = await this.find(WORKSPACE_STATE_SCOPE);
    const normalized = normalizeWorkspaceState(record?.state);
    if (normalized) {
      return { record, state: normalized };
    }
    const seeded = createDefaultWorkspaceState();
    const nextRecord = this.toWorkspaceStateRecord(seeded, record);
    if (record) {
      await this.save(nextRecord);
    } else {
      await this.saveIfRevision(nextRecord, null);
    }
    const latestRecord = await this.find(WORKSPACE_STATE_SCOPE);
    return { record: latestRecord ?? nextRecord, state: seeded };
  }

  private async mutateWorkspaceState(mutator: (state: WorkspaceStateDocument) => void): Promise<WorkspaceStateDocument> {
    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const { record, state } = await this.readWorkspaceStateContainer();
      const nextState = cloneWorkspaceState(state);
      mutator(nextState);
      nextState.workspaces = dedupeByKey(nextState.workspaces, (workspace) => workspace.workspaceId);
      nextState.accounts = dedupeByKey(nextState.accounts, (account) => account.accountId);
      nextState.members = dedupeByKey(nextState.members, (member) => `${member.workspaceId}::${member.accountId}`);
      nextState.roles = dedupeByKey(nextState.roles, (role) => `${role.workspaceId}::${role.roleId}`);
      nextState.folderAcl = dedupeByKey(nextState.folderAcl, (acl) => `${acl.workspaceId}::${toAclFolderKey(acl.folderId)}::${acl.roleId}`);
      const nextRecord = this.toWorkspaceStateRecord(nextState, record);
      const saved = await this.saveIfRevision(nextRecord, record?.revision ?? null);
      if (saved) {
        return nextState;
      }
    }
    throw new Error('Failed to persist workspace state after retrying optimistic updates.');
  }

  private ensureWorkspaceBuiltinRoles(state: WorkspaceStateDocument, workspaceId: string): void {
    ensureBuiltinWorkspaceRoles(state.roles, workspaceId);
  }

  async find(scope: ProjectRepositoryScope): Promise<PersistedProjectRecord | null> {
    const normalizedScope = {
      tenantId: normalizeRequired(scope.tenantId, 'tenantId'),
      projectId: normalizeRequired(scope.projectId, 'projectId')
    };
    const documentId = toDocumentId(normalizedScope);
    const document = await this.readDocument(documentId, 'find document');
    if (!document) return null;
    if (document.tenantId !== normalizedScope.tenantId || document.projectId !== normalizedScope.projectId) {
      throw new Error(
        `Appwrite document scope mismatch for tenant="${normalizedScope.tenantId}" project="${normalizedScope.projectId}".`
      );
    }
    return {
      scope: normalizedScope,
      revision: normalizeRequired(String(document.revision ?? ''), 'revision'),
      state: parseState(document.stateJson),
      createdAt: normalizeTimestamp(document.createdAt ?? document.$createdAt),
      updatedAt: normalizeTimestamp(document.updatedAt ?? document.$updatedAt)
    };
  }

  async save(record: PersistedProjectRecord): Promise<void> {
    const normalizedScope = {
      tenantId: normalizeRequired(record.scope.tenantId, 'tenantId'),
      projectId: normalizeRequired(record.scope.projectId, 'projectId')
    };
    const normalizedRecord: PersistedProjectRecord = {
      ...record,
      scope: normalizedScope,
      revision: normalizeRequired(record.revision, 'revision'),
      createdAt: normalizeTimestamp(record.createdAt),
      updatedAt: normalizeTimestamp(record.updatedAt)
    };
    const documentId = toDocumentId(normalizedRecord.scope);
    const baseData: ProjectDocumentData = {
      tenantId: normalizedRecord.scope.tenantId,
      projectId: normalizedRecord.scope.projectId,
      revision: normalizedRecord.revision,
      stateJson: JSON.stringify(normalizedRecord.state),
      createdAt: normalizedRecord.createdAt,
      updatedAt: normalizedRecord.updatedAt
    };

    const createResponse = await this.request('POST', this.documentsPath, {
      json: {
        documentId,
        data: baseData
      }
    });
    if (createResponse.ok) return;

    if (createResponse.status !== 409) {
      throw await this.transport.toError(createResponse, 'create document');
    }

    const updateResponse = await this.request('PATCH', this.toDocumentPath(documentId), {
      json: {
        data: {
          revision: baseData.revision,
          stateJson: baseData.stateJson,
          updatedAt: baseData.updatedAt
        }
      }
    });
    if (!updateResponse.ok) {
      throw await this.transport.toError(updateResponse, 'update document');
    }
  }

  async saveIfRevision(record: PersistedProjectRecord, expectedRevision: string | null): Promise<boolean> {
    const normalizedScope = {
      tenantId: normalizeRequired(record.scope.tenantId, 'tenantId'),
      projectId: normalizeRequired(record.scope.projectId, 'projectId')
    };
    const lock = await this.acquireScopeLock(normalizedScope);
    try {
      const existing = await this.find(normalizedScope);
      if (expectedRevision === null) {
        if (existing) return false;
      } else if (!existing || existing.revision !== expectedRevision) {
        return false;
      }
      await this.save({
        ...record,
        scope: normalizedScope
      });
      return true;
    } finally {
      await this.releaseScopeLock(normalizedScope, lock.owner).catch(() => undefined);
    }
  }

  async remove(scope: ProjectRepositoryScope): Promise<void> {
    const normalizedScope = {
      tenantId: normalizeRequired(scope.tenantId, 'tenantId'),
      projectId: normalizeRequired(scope.projectId, 'projectId')
    };
    const documentId = toDocumentId(normalizedScope);
    await this.deleteDocument(documentId, 'delete document');
  }

  async getAccount(accountId: string): Promise<AccountRecord | null> {
    const normalizedAccountId = String(accountId ?? '').trim();
    if (!normalizedAccountId) {
      return null;
    }
    const { state } = await this.readWorkspaceStateContainer();
    const found = state.accounts.find((account) => account.accountId === normalizedAccountId);
    return found ? { ...found, systemRoles: [...found.systemRoles] } : null;
  }

  async getAccountByLocalLoginId(localLoginId: string): Promise<AccountRecord | null> {
    const normalizedLocalLoginId = String(localLoginId ?? '').trim().toLowerCase();
    if (!normalizedLocalLoginId) {
      return null;
    }
    const { state } = await this.readWorkspaceStateContainer();
    const found = state.accounts.find((account) => (account.localLoginId ?? '').toLowerCase() === normalizedLocalLoginId);
    return found ? { ...found, systemRoles: [...found.systemRoles] } : null;
  }

  async getAccountByGithubUserId(githubUserId: string): Promise<AccountRecord | null> {
    const normalizedGithubUserId = String(githubUserId ?? '').trim();
    if (!normalizedGithubUserId) {
      return null;
    }
    const { state } = await this.readWorkspaceStateContainer();
    const found = state.accounts.find((account) => account.githubUserId === normalizedGithubUserId);
    return found ? { ...found, systemRoles: [...found.systemRoles] } : null;
  }

  async upsertAccount(record: AccountRecord): Promise<void> {
    await this.mutateWorkspaceState((state) => {
      const now = new Date().toISOString();
      const normalized: AccountRecord = {
        accountId: normalizeRequired(record.accountId, 'accountId'),
        email: record.email.trim() || 'unknown@ashfox.local',
        displayName: record.displayName.trim() || 'User',
        systemRoles: parseSystemRoles(record.systemRoles),
        localLoginId:
          typeof record.localLoginId === 'string' && record.localLoginId.trim().length > 0
            ? record.localLoginId.trim().toLowerCase()
            : null,
        passwordHash:
          typeof record.passwordHash === 'string' && record.passwordHash.trim().length > 0 ? record.passwordHash.trim() : null,
        githubUserId:
          typeof record.githubUserId === 'string' && record.githubUserId.trim().length > 0 ? record.githubUserId.trim() : null,
        githubLogin:
          typeof record.githubLogin === 'string' && record.githubLogin.trim().length > 0 ? record.githubLogin.trim() : null,
        createdAt: normalizeTimestamp(record.createdAt),
        updatedAt: normalizeTimestamp(record.updatedAt || now)
      };

      const localLoginConflict = state.accounts.find(
        (account) =>
          account.accountId !== normalized.accountId &&
          normalized.localLoginId &&
          account.localLoginId &&
          account.localLoginId.toLowerCase() === normalized.localLoginId.toLowerCase()
      );
      if (localLoginConflict) {
        throw new Error(`Account local login id already exists: ${normalized.localLoginId}`);
      }
      const githubUserConflict = state.accounts.find(
        (account) =>
          account.accountId !== normalized.accountId &&
          normalized.githubUserId &&
          account.githubUserId === normalized.githubUserId
      );
      if (githubUserConflict) {
        throw new Error(`Account github user id already exists: ${normalized.githubUserId}`);
      }

      const index = state.accounts.findIndex((account) => account.accountId === normalized.accountId);
      if (index >= 0) {
        state.accounts[index] = {
          ...state.accounts[index],
          ...normalized,
          createdAt: state.accounts[index].createdAt
        };
      } else {
        state.accounts.push(normalized);
      }
    });
  }

  async listWorkspaces(accountId: string): Promise<WorkspaceRecord[]> {
    const normalizedAccountId = String(accountId ?? '').trim();
    const { state } = await this.readWorkspaceStateContainer();
    if (!normalizedAccountId) {
      return state.workspaces.map((workspace) => ({ ...workspace }));
    }
    const memberWorkspaceIds = new Set(
      state.members.filter((member) => member.accountId === normalizedAccountId).map((member) => member.workspaceId)
    );
    return state.workspaces
      .filter((workspace) => memberWorkspaceIds.has(workspace.workspaceId))
      .map((workspace) => ({ ...workspace }));
  }

  async getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null> {
    const { state } = await this.readWorkspaceStateContainer();
    const found = state.workspaces.find((workspace) => workspace.workspaceId === workspaceId);
    return found ? { ...found } : null;
  }

  async upsertWorkspace(record: WorkspaceRecord): Promise<void> {
    await this.mutateWorkspaceState((state) => {
      const now = new Date().toISOString();
      const normalized: WorkspaceRecord = {
        workspaceId: normalizeRequired(record.workspaceId, 'workspaceId'),
        tenantId: normalizeRequired(record.tenantId, 'tenantId'),
        name: record.name.trim() || 'Workspace',
        mode: parseWorkspaceMode(record.mode),
        createdBy: record.createdBy.trim() || DEFAULT_WORKSPACE_CREATED_BY,
        createdAt: normalizeTimestamp(record.createdAt),
        updatedAt: normalizeTimestamp(record.updatedAt)
      };
      const index = state.workspaces.findIndex((workspace) => workspace.workspaceId === normalized.workspaceId);
      if (index >= 0) {
        state.workspaces[index] = {
          ...state.workspaces[index],
          ...normalized,
          updatedAt: normalized.updatedAt
        };
      } else {
        state.workspaces.push({
          ...normalized,
          createdAt: normalized.createdAt || now,
          updatedAt: normalized.updatedAt || now
        });
      }
      this.ensureWorkspaceBuiltinRoles(state, normalized.workspaceId);
    });
  }

  async removeWorkspace(workspaceId: string): Promise<void> {
    await this.mutateWorkspaceState((state) => {
      state.workspaces = state.workspaces.filter((workspace) => workspace.workspaceId !== workspaceId);
      state.roles = state.roles.filter((role) => role.workspaceId !== workspaceId);
      state.members = state.members.filter((member) => member.workspaceId !== workspaceId);
      state.folderAcl = state.folderAcl.filter((acl) => acl.workspaceId !== workspaceId);
    });
  }

  async listWorkspaceRoles(workspaceId: string): Promise<WorkspaceRoleStorageRecord[]> {
    const { state } = await this.readWorkspaceStateContainer();
    return state.roles
      .filter((role) => role.workspaceId === workspaceId)
      .map((role) => ({
        ...role,
        permissions: [...role.permissions]
      }));
  }

  async upsertWorkspaceRole(record: WorkspaceRoleStorageRecord): Promise<void> {
    await this.mutateWorkspaceState((state) => {
      const normalized: WorkspaceRoleStorageRecord = {
        workspaceId: normalizeRequired(record.workspaceId, 'workspaceId'),
        roleId: normalizeRequired(record.roleId, 'roleId'),
        name: record.name.trim() || 'Role',
        builtin: parseWorkspaceBuiltinRole(record.builtin),
        permissions: parseWorkspacePermissionArray(record.permissions),
        createdAt: normalizeTimestamp(record.createdAt),
        updatedAt: normalizeTimestamp(record.updatedAt)
      };
      const index = state.roles.findIndex(
        (role) => role.workspaceId === normalized.workspaceId && role.roleId === normalized.roleId
      );
      if (index >= 0) {
        state.roles[index] = {
          ...state.roles[index],
          ...normalized,
          updatedAt: normalized.updatedAt
        };
      } else {
        state.roles.push(normalized);
      }
    });
  }

  async removeWorkspaceRole(workspaceId: string, roleId: string): Promise<void> {
    await this.mutateWorkspaceState((state) => {
      state.roles = state.roles.filter((role) => !(role.workspaceId === workspaceId && role.roleId === roleId));
      state.members = state.members.map((member) => {
        if (member.workspaceId !== workspaceId) return member;
        return {
          ...member,
          roleIds: member.roleIds.filter((existingRoleId) => existingRoleId !== roleId)
        };
      });
      state.folderAcl = state.folderAcl.filter((acl) => !(acl.workspaceId === workspaceId && acl.roleId === roleId));
    });
  }

  async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberRecord[]> {
    const { state } = await this.readWorkspaceStateContainer();
    return state.members
      .filter((member) => member.workspaceId === workspaceId)
      .map((member) => ({
        ...member,
        roleIds: [...member.roleIds]
      }));
  }

  async upsertWorkspaceMember(record: WorkspaceMemberRecord): Promise<void> {
    await this.mutateWorkspaceState((state) => {
      const normalized: WorkspaceMemberRecord = {
        workspaceId: normalizeRequired(record.workspaceId, 'workspaceId'),
        accountId: normalizeRequired(record.accountId, 'accountId'),
        roleIds: uniqueStrings(record.roleIds),
        joinedAt: normalizeTimestamp(record.joinedAt)
      };
      const index = state.members.findIndex(
        (member) => member.workspaceId === normalized.workspaceId && member.accountId === normalized.accountId
      );
      if (index >= 0) {
        state.members[index] = normalized;
      } else {
        state.members.push(normalized);
      }
    });
  }

  async removeWorkspaceMember(workspaceId: string, accountId: string): Promise<void> {
    await this.mutateWorkspaceState((state) => {
      state.members = state.members.filter(
        (member) => !(member.workspaceId === workspaceId && member.accountId === accountId)
      );
    });
  }

  async listWorkspaceFolderAcl(workspaceId: string): Promise<WorkspaceFolderAclRecord[]> {
    const { state } = await this.readWorkspaceStateContainer();
    return state.folderAcl
      .filter((acl) => acl.workspaceId === workspaceId)
      .map((acl) => ({ ...acl }));
  }

  async upsertWorkspaceFolderAcl(record: WorkspaceFolderAclRecord): Promise<void> {
    await this.mutateWorkspaceState((state) => {
      const normalized: WorkspaceFolderAclRecord = {
        workspaceId: normalizeRequired(record.workspaceId, 'workspaceId'),
        folderId: fromAclFolderKey(toAclFolderKey(record.folderId)),
        roleId: normalizeRequired(record.roleId, 'roleId'),
        read: parseWorkspaceAclEffect(record.read),
        write: parseWorkspaceAclEffect(record.write),
        updatedAt: normalizeTimestamp(record.updatedAt)
      };
      const folderKey = toAclFolderKey(normalized.folderId);
      const index = state.folderAcl.findIndex(
        (acl) => acl.workspaceId === normalized.workspaceId && toAclFolderKey(acl.folderId) === folderKey && acl.roleId === normalized.roleId
      );
      if (index >= 0) {
        state.folderAcl[index] = normalized;
      } else {
        state.folderAcl.push(normalized);
      }
    });
  }

  async removeWorkspaceFolderAcl(workspaceId: string, folderId: string | null, roleId: string): Promise<void> {
    await this.mutateWorkspaceState((state) => {
      const folderKey = toAclFolderKey(folderId);
      state.folderAcl = state.folderAcl.filter(
        (acl) => !(acl.workspaceId === workspaceId && toAclFolderKey(acl.folderId) === folderKey && acl.roleId === roleId)
      );
    });
  }
}
