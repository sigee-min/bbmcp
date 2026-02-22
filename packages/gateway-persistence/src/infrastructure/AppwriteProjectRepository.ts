import { createHash, randomUUID } from 'node:crypto';
import type {
  AccountRecord,
  PersistedProjectRecord,
  ProjectRepository,
  ProjectRepositoryScope,
  ServiceUsersSearchInput,
  ServiceUsersSearchResult,
  ServiceWorkspacesSearchInput,
  ServiceWorkspacesSearchResult,
  ServiceApiKeyRecord,
  ServiceSettingsRecord,
  WorkspaceApiKeyRecord,
  WorkspaceFolderAclRecord,
  WorkspaceMemberRecord,
  WorkspaceRecord,
  WorkspaceRepository,
  WorkspaceRoleStorageRecord
} from '@ashfox/backend-core';
import type { AppwriteDatabaseConfig } from '../config';
import { createAppwriteTransport } from './appwrite/transport';
import {
  cloneWorkspaceState,
  createDefaultWorkspaceState,
  dedupeByKey,
  isExpired,
  normalizeRequired,
  normalizeWorkspaceState,
  normalizeAclRoleIds,
  normalizeOptionalTimestamp,
  parseLockState,
  parseSystemRoles,
  parseState,
  resolvePositiveInt,
  sleep,
  toAclTemplateRuleId,
  WORKSPACE_STATE_SCOPE,
  type AppwriteProjectDocument,
  type ProjectDocumentData,
  type WorkspaceStateDocument
} from './appwrite/workspaceStateNormalization';
import { AppwriteWorkspaceStateStore, toWorkspaceStateRevision } from './appwrite/workspaceStateStore';
import {
  createDefaultServiceSettings,
  DEFAULT_WORKSPACE_CREATED_BY,
  ensureWorkspaceBuiltinRoles as ensureBuiltinWorkspaceRoles,
  ensureWorkspaceDefaultMemberRole,
  ensureWorkspaceDefaultFolderAcl as ensureDefaultWorkspaceFolderAcl,
  fromAclStorageFolderKey,
  normalizeDefaultMemberRoleId,
  normalizeServiceSettings,
  normalizeRequiredAccountId,
  normalizeServiceSearchCursorOffset,
  normalizeServiceSearchLimit,
  normalizeServiceSearchToken,
  normalizeTimestamp,
  parseWorkspaceAclEffect,
  parseWorkspaceBuiltinRole,
  toAclFolderKey,
  toAclStorageFolderKey,
  uniqueStrings
} from './workspace/common';

export interface AppwriteProjectRepositoryOptions {
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  lockTtlMs?: number;
  lockTimeoutMs?: number;
  lockRetryMs?: number;
  sleepImpl?: (delayMs: number) => Promise<void>;
}

type AppwriteListDocumentsResponse = {
  total?: unknown;
  documents?: unknown;
};

const DEFAULT_LOCK_TTL_MS = 15000;
const DEFAULT_LOCK_TIMEOUT_MS = 10000;
const DEFAULT_LOCK_RETRY_MS = 25;

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

export class AppwriteProjectRepository implements ProjectRepository, WorkspaceRepository {
  private readonly config: AppwriteDatabaseConfig;
  private readonly transport: ReturnType<typeof createAppwriteTransport<AppwriteDatabaseConfig>>;
  private readonly documentsPath: string;
  private readonly workspaceStateStore: AppwriteWorkspaceStateStore | null;
  private readonly workspaceStateShadowRead: boolean;
  private readonly workspaceStateDocumentsPath: string | null;
  private workspaceStateMismatchLogged = false;
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
    this.workspaceStateShadowRead = this.config.workspaceStateShadowRead === true;
    if (this.config.workspaceStateEnabled === true) {
      const workspaceCollectionId = String(this.config.workspaceStateCollectionId ?? '').trim() || 'ashfox_workspace_state';
      this.workspaceStateDocumentsPath = `/databases/${encodeURIComponent(this.config.databaseId)}/collections/${encodeURIComponent(workspaceCollectionId)}/documents`;
      this.workspaceStateStore = new AppwriteWorkspaceStateStore({
        readDocument: async (documentId) =>
          this.readDocumentFromCollection(this.workspaceStateDocumentsPath as string, documentId, 'read workspace-state'),
        upsertDocument: async (documentId, data) =>
          this.upsertDocumentInCollection(
            this.workspaceStateDocumentsPath as string,
            documentId,
            data,
            'create workspace-state',
            'update workspace-state'
          )
      });
    } else {
      this.workspaceStateDocumentsPath = null;
      this.workspaceStateStore = null;
    }
  }

  private toDocumentPath(documentId: string): string {
    return `${this.documentsPath}/${encodeURIComponent(documentId)}`;
  }

  private toDocumentPathForCollection(collectionPath: string, documentId: string): string {
    return `${collectionPath}/${encodeURIComponent(documentId)}`;
  }

  private async readDocumentFromCollection(
    collectionPath: string,
    documentId: string,
    action: string
  ): Promise<AppwriteProjectDocument | null> {
    const response = await this.request('GET', this.toDocumentPathForCollection(collectionPath, documentId));
    if (response.status === 404) return null;
    if (!response.ok) {
      throw await this.transport.toError(response, action);
    }
    return (await response.json()) as AppwriteProjectDocument;
  }

  private async readDocument(documentId: string, action: string): Promise<AppwriteProjectDocument | null> {
    return this.readDocumentFromCollection(this.documentsPath, documentId, action);
  }

  private async upsertDocumentInCollection(
    collectionPath: string,
    documentId: string,
    data: Record<string, unknown>,
    createAction: string,
    updateAction: string
  ): Promise<void> {
    const createResponse = await this.request('POST', collectionPath, {
      json: {
        documentId,
        data
      }
    });
    if (createResponse.ok) return;
    if (createResponse.status !== 409) {
      throw await this.transport.toError(createResponse, createAction);
    }
    const updateResponse = await this.request('PATCH', this.toDocumentPathForCollection(collectionPath, documentId), {
      json: {
        data
      }
    });
    if (!updateResponse.ok) {
      throw await this.transport.toError(updateResponse, updateAction);
    }
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
    if (this.workspaceStateStore) {
      const storeRecord = await this.workspaceStateStore.read();
      const normalizedStoreState = normalizeWorkspaceState(storeRecord?.state);
      if (normalizedStoreState) {
        if (this.workspaceStateShadowRead) {
          await this.shadowReadLegacyWorkspaceState(normalizedStoreState);
        }
        return {
          record: this.toWorkspaceStateRecord(normalizedStoreState, null),
          state: normalizedStoreState
        };
      }
    }

    const record = await this.find(WORKSPACE_STATE_SCOPE);
    const normalized = normalizeWorkspaceState(record?.state);
    if (normalized) {
      await this.writeWorkspaceState(normalized);
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
    await this.writeWorkspaceState(seeded);
    return { record: latestRecord ?? nextRecord, state: seeded };
  }

  private async writeWorkspaceState(state: WorkspaceStateDocument): Promise<void> {
    if (!this.workspaceStateStore) return;
    await this.workspaceStateStore.write(state);
  }

  private async shadowReadLegacyWorkspaceState(storeState: WorkspaceStateDocument): Promise<void> {
    if (!this.workspaceStateShadowRead || this.workspaceStateMismatchLogged) {
      return;
    }
    const legacyRecord = await this.find(WORKSPACE_STATE_SCOPE);
    const legacyState = normalizeWorkspaceState(legacyRecord?.state);
    if (!legacyState) return;
    const legacyRevision = toWorkspaceStateRevision(legacyState);
    const storeRevision = toWorkspaceStateRevision(storeState);
    if (legacyRevision !== storeRevision) {
      this.workspaceStateMismatchLogged = true;
      console.warn('ashfox appwrite workspace-state mismatch detected', {
        legacyRevision,
        storeRevision,
        legacyCollectionId: this.config.collectionId,
        workspaceStateCollectionPath: this.workspaceStateDocumentsPath
      });
    }
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
      nextState.folderAcl = dedupeByKey(
        nextState.folderAcl,
        (acl) => `${acl.workspaceId}::${acl.ruleId}`
      );
      nextState.apiKeys = dedupeByKey(nextState.apiKeys, (apiKey) => `${apiKey.workspaceId}::${apiKey.keyId}`);
      nextState.serviceApiKeys = dedupeByKey(nextState.serviceApiKeys, (apiKey) => `${apiKey.createdBy}::${apiKey.keyId}`);
      const nextRecord = this.toWorkspaceStateRecord(nextState, record);
      const saved = await this.saveIfRevision(nextRecord, record?.revision ?? null);
      if (saved) {
        await this.writeWorkspaceState(nextState);
        return nextState;
      }
    }
    throw new Error('Failed to persist workspace state after retrying optimistic updates.');
  }

  private ensureWorkspaceBuiltinRoles(state: WorkspaceStateDocument, workspaceId: string): void {
    ensureBuiltinWorkspaceRoles(state.roles, workspaceId);
    ensureDefaultWorkspaceFolderAcl(state.folderAcl, workspaceId);
    const workspace = state.workspaces.find((entry) => entry.workspaceId === workspaceId);
    if (workspace) {
      ensureWorkspaceDefaultMemberRole(workspace, state.roles);
    }
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

  async listByScopePrefix(scope: ProjectRepositoryScope): Promise<PersistedProjectRecord[]> {
    const normalizedScope = {
      tenantId: normalizeRequired(scope.tenantId, 'tenantId'),
      projectId: normalizeRequired(scope.projectId, 'projectId')
    };
    const records: PersistedProjectRecord[] = [];
    const pageSize = 100;
    let offset = 0;

    while (true) {
      const query = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset)
      }).toString();
      const response = await this.request('GET', `${this.documentsPath}?${query}`);
      if (!response.ok) {
        throw await this.transport.toError(response, 'list documents');
      }
      const payload = (await response.json()) as AppwriteListDocumentsResponse;
      const documents = Array.isArray(payload.documents) ? (payload.documents as AppwriteProjectDocument[]) : [];
      for (const document of documents) {
        if (document.tenantId !== normalizedScope.tenantId) {
          continue;
        }
        if (typeof document.projectId !== 'string' || !document.projectId.startsWith(normalizedScope.projectId)) {
          continue;
        }
        const revision = normalizeRequired(String(document.revision ?? ''), 'revision');
        records.push({
          scope: {
            tenantId: document.tenantId,
            projectId: document.projectId
          },
          revision,
          state: parseState(document.stateJson),
          createdAt: normalizeTimestamp(document.createdAt ?? document.$createdAt),
          updatedAt: normalizeTimestamp(document.updatedAt ?? document.$updatedAt)
        });
      }
      const total = typeof payload.total === 'number' && Number.isFinite(payload.total) ? payload.total : offset + documents.length;
      offset += documents.length;
      if (documents.length === 0 || offset >= total) {
        break;
      }
    }

    records.sort((left, right) => left.scope.projectId.localeCompare(right.scope.projectId));
    return records;
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

  async listAccounts(input?: {
    query?: string;
    limit?: number;
    excludeAccountIds?: readonly string[];
  }): Promise<AccountRecord[]> {
    const normalizedQuery = typeof input?.query === 'string' ? input.query.trim().toLowerCase() : '';
    const requestedLimit = typeof input?.limit === 'number' && Number.isFinite(input.limit) ? Math.trunc(input.limit) : 25;
    const limit = Math.min(Math.max(requestedLimit, 1), 100);
    const excludeAccountIds = new Set(
      (input?.excludeAccountIds ?? [])
        .map((accountId) => String(accountId ?? '').trim())
        .filter((accountId) => accountId.length > 0)
    );

    const { state } = await this.readWorkspaceStateContainer();
    const filtered = state.accounts.filter((account) => {
      if (excludeAccountIds.has(account.accountId)) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      const haystacks = [
        account.accountId,
        account.displayName,
        account.email,
        account.localLoginId ?? '',
        account.githubLogin ?? ''
      ]
        .join(' ')
        .toLowerCase();
      return haystacks.includes(normalizedQuery);
    });
    return filtered
      .sort((left, right) => left.displayName.localeCompare(right.displayName) || left.accountId.localeCompare(right.accountId))
      .slice(0, limit)
      .map((account) => ({
        ...account,
        systemRoles: [...account.systemRoles]
      }));
  }

  async searchServiceUsers(input?: ServiceUsersSearchInput): Promise<ServiceUsersSearchResult> {
    const normalizedQuery = normalizeServiceSearchToken(input?.q);
    const normalizedWorkspaceId = String(input?.workspaceId ?? '').trim();
    const field = input?.field ?? 'any';
    const match = input?.match ?? 'contains';
    const limit = normalizeServiceSearchLimit(input?.limit);
    const offset = normalizeServiceSearchCursorOffset(input?.cursor);
    const matchToken = (candidate: string): boolean => {
      if (!normalizedQuery) {
        return true;
      }
      const normalizedCandidate = candidate.toLowerCase();
      if (match === 'exact') {
        return normalizedCandidate === normalizedQuery;
      }
      if (match === 'prefix') {
        return normalizedCandidate.startsWith(normalizedQuery);
      }
      return normalizedCandidate.includes(normalizedQuery);
    };

    const { state } = await this.readWorkspaceStateContainer();
    const workspaceMemberIds =
      normalizedWorkspaceId.length > 0
        ? new Set(
            state.members.filter((member) => member.workspaceId === normalizedWorkspaceId).map((member) => member.accountId)
          )
        : null;

    const filtered = state.accounts.filter((account) => {
      if (workspaceMemberIds && !workspaceMemberIds.has(account.accountId)) {
        return false;
      }
      const candidates = {
        accountId: account.accountId,
        displayName: account.displayName,
        email: account.email,
        localLoginId: account.localLoginId ?? '',
        githubLogin: account.githubLogin ?? ''
      };
      if (!normalizedQuery) {
        return true;
      }
      if (field === 'any') {
        return Object.values(candidates).some((candidate) => matchToken(candidate));
      }
      return matchToken(candidates[field]);
    });
    const sorted = filtered.sort(
      (left, right) => left.displayName.localeCompare(right.displayName) || left.accountId.localeCompare(right.accountId)
    );
    const total = sorted.length;
    const window = sorted.slice(offset, offset + limit).map((account) => ({
      ...account,
      systemRoles: [...account.systemRoles]
    }));
    const nextOffset = offset + window.length;
    return {
      users: window,
      total,
      nextCursor: nextOffset < total ? String(nextOffset) : null
    };
  }

  async countAccountsBySystemRole(role: 'system_admin' | 'cs_admin'): Promise<number> {
    const { state } = await this.readWorkspaceStateContainer();
    return state.accounts.filter((account) => account.systemRoles.includes(role)).length;
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

  async updateAccountSystemRoles(
    accountId: string,
    systemRoles: Array<'system_admin' | 'cs_admin'>,
    updatedAt: string
  ): Promise<AccountRecord | null> {
    const normalizedAccountId = String(accountId ?? '').trim();
    if (!normalizedAccountId) {
      return null;
    }
    const normalizedSystemRoles = parseSystemRoles(systemRoles);
    const normalizedUpdatedAt = normalizeTimestamp(updatedAt);
    let updatedRecord: AccountRecord | null = null;
    await this.mutateWorkspaceState((state) => {
      const index = state.accounts.findIndex((account) => account.accountId === normalizedAccountId);
      if (index < 0) {
        updatedRecord = null;
        return;
      }
      const nextAccount: AccountRecord = {
        ...state.accounts[index],
        systemRoles: normalizedSystemRoles,
        updatedAt: normalizedUpdatedAt
      };
      state.accounts[index] = nextAccount;
      updatedRecord = {
        ...nextAccount,
        systemRoles: [...nextAccount.systemRoles]
      };
    });
    return updatedRecord;
  }

  async listAllWorkspaces(): Promise<WorkspaceRecord[]> {
    const { state } = await this.readWorkspaceStateContainer();
    return state.workspaces.map((workspace) => ({ ...workspace }));
  }

  async listAccountWorkspaces(accountId: string): Promise<WorkspaceRecord[]> {
    const normalizedAccountId = normalizeRequiredAccountId(accountId, 'listAccountWorkspaces.accountId');
    const { state } = await this.readWorkspaceStateContainer();
    const memberWorkspaceIds = new Set(
      state.members.filter((member) => member.accountId === normalizedAccountId).map((member) => member.workspaceId)
    );
    return state.workspaces
      .filter((workspace) => memberWorkspaceIds.has(workspace.workspaceId))
      .map((workspace) => ({ ...workspace }));
  }

  async searchServiceWorkspaces(input?: ServiceWorkspacesSearchInput): Promise<ServiceWorkspacesSearchResult> {
    const normalizedQuery = normalizeServiceSearchToken(input?.q);
    const normalizedMemberAccountId = String(input?.memberAccountId ?? '').trim().toLowerCase();
    const field = input?.field ?? 'any';
    const match = input?.match ?? 'contains';
    const limit = normalizeServiceSearchLimit(input?.limit);
    const offset = normalizeServiceSearchCursorOffset(input?.cursor);
    const matchToken = (candidate: string): boolean => {
      if (!normalizedQuery) {
        return true;
      }
      const normalizedCandidate = candidate.toLowerCase();
      if (match === 'exact') {
        return normalizedCandidate === normalizedQuery;
      }
      if (match === 'prefix') {
        return normalizedCandidate.startsWith(normalizedQuery);
      }
      return normalizedCandidate.includes(normalizedQuery);
    };

    const { state } = await this.readWorkspaceStateContainer();
    const memberMap = new Map<string, string[]>();
    for (const member of state.members) {
      const existing = memberMap.get(member.workspaceId);
      if (existing) {
        existing.push(member.accountId);
      } else {
        memberMap.set(member.workspaceId, [member.accountId]);
      }
    }

    const filtered = state.workspaces.filter((workspace) => {
      const memberAccountIds = memberMap.get(workspace.workspaceId) ?? [];
      if (normalizedMemberAccountId.length > 0 && !memberAccountIds.some((accountId) => accountId.toLowerCase() === normalizedMemberAccountId)) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      const candidates = {
        workspaceId: workspace.workspaceId,
        name: workspace.name,
        createdBy: workspace.createdBy
      };
      if (field === 'memberAccountId') {
        return memberAccountIds.some((accountId) => matchToken(accountId));
      }
      if (field === 'any') {
        return (
          Object.values(candidates).some((candidate) => matchToken(candidate)) ||
          memberAccountIds.some((accountId) => matchToken(accountId))
        );
      }
      return matchToken(candidates[field]);
    });

    const sorted = filtered.sort(
      (left, right) => normalizeTimestamp(left.createdAt).localeCompare(normalizeTimestamp(right.createdAt)) || left.workspaceId.localeCompare(right.workspaceId)
    );
    const total = sorted.length;
    const window = sorted.slice(offset, offset + limit).map((workspace) => ({ ...workspace }));
    const nextOffset = offset + window.length;
    return {
      workspaces: window,
      total,
      nextCursor: nextOffset < total ? String(nextOffset) : null
    };
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
        defaultMemberRoleId: normalizeDefaultMemberRoleId(record.defaultMemberRoleId),
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
      state.apiKeys = state.apiKeys.filter((apiKey) => apiKey.workspaceId !== workspaceId);
    });
  }

  async listWorkspaceRoles(workspaceId: string): Promise<WorkspaceRoleStorageRecord[]> {
    const { state } = await this.readWorkspaceStateContainer();
    return state.roles.filter((role) => role.workspaceId === workspaceId).map((role) => ({ ...role }));
  }

  async upsertWorkspaceRole(record: WorkspaceRoleStorageRecord): Promise<void> {
    await this.mutateWorkspaceState((state) => {
      const normalized: WorkspaceRoleStorageRecord = {
        workspaceId: normalizeRequired(record.workspaceId, 'workspaceId'),
        roleId: normalizeRequired(record.roleId, 'roleId'),
        name: record.name.trim() || 'Role',
        builtin: parseWorkspaceBuiltinRole(record.builtin),
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
      state.folderAcl = state.folderAcl
        .map((acl) => {
          if (acl.workspaceId !== workspaceId) {
            return acl;
          }
          return {
            ...acl,
            roleIds: acl.roleIds.filter((existingRoleId) => existingRoleId !== roleId)
          };
        })
        .filter((acl) => acl.roleIds.length > 0);
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
      const storageKey = toAclStorageFolderKey(record.scope, record.folderId);
      const parsedKey = fromAclStorageFolderKey(storageKey);
      const read = parseWorkspaceAclEffect(record.read);
      const write = parseWorkspaceAclEffect(record.write);
      const locked = record.locked === true;
      const roleIds = normalizeAclRoleIds(record.roleIds);
      if (roleIds.length === 0) {
        return;
      }
      const normalized: WorkspaceFolderAclRecord = {
        workspaceId: normalizeRequired(record.workspaceId, 'workspaceId'),
        ruleId:
          typeof record.ruleId === 'string' && record.ruleId.trim().length > 0
            ? record.ruleId.trim()
            : toAclTemplateRuleId(parsedKey.scope, storageKey, read, write, locked),
        scope: parsedKey.scope,
        folderId: parsedKey.folderId,
        roleIds,
        read,
        write,
        locked,
        updatedAt: normalizeTimestamp(record.updatedAt)
      };
      const index = state.folderAcl.findIndex(
        (acl) => acl.workspaceId === normalized.workspaceId && acl.ruleId === normalized.ruleId
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
      state.folderAcl = state.folderAcl
        .map((acl) => {
          if (!(acl.workspaceId === workspaceId && toAclStorageFolderKey(acl.scope, acl.folderId) === folderKey)) {
            return acl;
          }
          return {
            ...acl,
            roleIds: acl.roleIds.filter((existingRoleId) => existingRoleId !== roleId)
          };
        })
        .filter((acl) => acl.roleIds.length > 0);
    });
  }

  async listWorkspaceApiKeys(workspaceId: string): Promise<WorkspaceApiKeyRecord[]> {
    const { state } = await this.readWorkspaceStateContainer();
    return state.apiKeys
      .filter((apiKey) => apiKey.workspaceId === workspaceId)
      .map((apiKey) => ({ ...apiKey }));
  }

  async findWorkspaceApiKeyByHash(keyHash: string): Promise<WorkspaceApiKeyRecord | null> {
    const normalizedKeyHash = keyHash.trim();
    if (!normalizedKeyHash) {
      return null;
    }
    const { state } = await this.readWorkspaceStateContainer();
    const found = state.apiKeys.find((apiKey) => apiKey.keyHash === normalizedKeyHash);
    return found ? { ...found } : null;
  }

  async createWorkspaceApiKey(record: WorkspaceApiKeyRecord): Promise<void> {
    await this.mutateWorkspaceState((state) => {
      const now = new Date().toISOString();
      const normalized: WorkspaceApiKeyRecord = {
        workspaceId: normalizeRequired(record.workspaceId, 'workspaceId'),
        keyId: normalizeRequired(record.keyId, 'keyId'),
        name: record.name.trim() || 'API key',
        keyPrefix: normalizeRequired(record.keyPrefix, 'keyPrefix'),
        keyHash: normalizeRequired(record.keyHash, 'keyHash'),
        createdBy: normalizeRequired(record.createdBy, 'createdBy'),
        createdAt: normalizeTimestamp(record.createdAt),
        updatedAt: normalizeTimestamp(record.updatedAt || now),
        lastUsedAt: normalizeOptionalTimestamp(record.lastUsedAt),
        expiresAt: normalizeOptionalTimestamp(record.expiresAt),
        revokedAt: normalizeOptionalTimestamp(record.revokedAt)
      };
      const index = state.apiKeys.findIndex(
        (apiKey) => apiKey.workspaceId === normalized.workspaceId && apiKey.keyId === normalized.keyId
      );
      if (index >= 0) {
        state.apiKeys[index] = normalized;
      } else {
        state.apiKeys.push(normalized);
      }
    });
  }

  async revokeWorkspaceApiKey(workspaceId: string, keyId: string, revokedAt: string): Promise<void> {
    await this.mutateWorkspaceState((state) => {
      const normalizedRevokedAt = normalizeTimestamp(revokedAt);
      state.apiKeys = state.apiKeys.map((apiKey) => {
        if (apiKey.workspaceId !== workspaceId || apiKey.keyId !== keyId) {
          return apiKey;
        }
        return {
          ...apiKey,
          revokedAt: normalizedRevokedAt,
          updatedAt: normalizedRevokedAt
        };
      });
    });
  }

  async updateWorkspaceApiKeyLastUsed(workspaceId: string, keyId: string, lastUsedAt: string): Promise<void> {
    await this.mutateWorkspaceState((state) => {
      const normalizedLastUsedAt = normalizeTimestamp(lastUsedAt);
      state.apiKeys = state.apiKeys.map((apiKey) => {
        if (apiKey.workspaceId !== workspaceId || apiKey.keyId !== keyId) {
          return apiKey;
        }
        return {
          ...apiKey,
          lastUsedAt: normalizedLastUsedAt,
          updatedAt: normalizedLastUsedAt
        };
      });
    });
  }

  async listServiceApiKeys(accountId: string): Promise<ServiceApiKeyRecord[]> {
    const normalizedAccountId = accountId.trim();
    if (!normalizedAccountId) {
      return [];
    }
    const { state } = await this.readWorkspaceStateContainer();
    return state.serviceApiKeys
      .filter((apiKey) => apiKey.createdBy === normalizedAccountId)
      .map((apiKey) => ({ ...apiKey }));
  }

  async findServiceApiKeyByHash(keyHash: string): Promise<ServiceApiKeyRecord | null> {
    const normalizedKeyHash = keyHash.trim();
    if (!normalizedKeyHash) {
      return null;
    }
    const { state } = await this.readWorkspaceStateContainer();
    const found = state.serviceApiKeys.find((apiKey) => apiKey.keyHash === normalizedKeyHash);
    return found ? { ...found } : null;
  }

  async createServiceApiKey(record: ServiceApiKeyRecord): Promise<void> {
    await this.mutateWorkspaceState((state) => {
      const now = new Date().toISOString();
      const normalized: ServiceApiKeyRecord = {
        keyId: normalizeRequired(record.keyId, 'keyId'),
        name: record.name.trim() || 'API key',
        keyPrefix: normalizeRequired(record.keyPrefix, 'keyPrefix'),
        keyHash: normalizeRequired(record.keyHash, 'keyHash'),
        createdBy: normalizeRequired(record.createdBy, 'createdBy'),
        createdAt: normalizeTimestamp(record.createdAt),
        updatedAt: normalizeTimestamp(record.updatedAt || now),
        lastUsedAt: normalizeOptionalTimestamp(record.lastUsedAt),
        expiresAt: normalizeOptionalTimestamp(record.expiresAt),
        revokedAt: normalizeOptionalTimestamp(record.revokedAt)
      };
      const index = state.serviceApiKeys.findIndex(
        (apiKey) => apiKey.createdBy === normalized.createdBy && apiKey.keyId === normalized.keyId
      );
      if (index >= 0) {
        state.serviceApiKeys[index] = normalized;
      } else {
        state.serviceApiKeys.push(normalized);
      }
    });
  }

  async revokeServiceApiKey(accountId: string, keyId: string, revokedAt: string): Promise<void> {
    const normalizedAccountId = accountId.trim();
    if (!normalizedAccountId) {
      return;
    }
    await this.mutateWorkspaceState((state) => {
      const normalizedRevokedAt = normalizeTimestamp(revokedAt);
      state.serviceApiKeys = state.serviceApiKeys.map((apiKey) => {
        if (apiKey.createdBy !== normalizedAccountId || apiKey.keyId !== keyId) {
          return apiKey;
        }
        return {
          ...apiKey,
          revokedAt: normalizedRevokedAt,
          updatedAt: normalizedRevokedAt
        };
      });
    });
  }

  async updateServiceApiKeyLastUsed(accountId: string, keyId: string, lastUsedAt: string): Promise<void> {
    const normalizedAccountId = accountId.trim();
    if (!normalizedAccountId) {
      return;
    }
    await this.mutateWorkspaceState((state) => {
      const normalizedLastUsedAt = normalizeTimestamp(lastUsedAt);
      state.serviceApiKeys = state.serviceApiKeys.map((apiKey) => {
        if (apiKey.createdBy !== normalizedAccountId || apiKey.keyId !== keyId) {
          return apiKey;
        }
        return {
          ...apiKey,
          lastUsedAt: normalizedLastUsedAt,
          updatedAt: normalizedLastUsedAt
        };
      });
    });
  }

  async getServiceSettings(): Promise<ServiceSettingsRecord | null> {
    const { state } = await this.readWorkspaceStateContainer();
    return normalizeServiceSettings(state.serviceSettings, createDefaultServiceSettings());
  }

  async upsertServiceSettings(record: ServiceSettingsRecord): Promise<void> {
    await this.mutateWorkspaceState((state) => {
      state.serviceSettings = normalizeServiceSettings(record, state.serviceSettings ?? createDefaultServiceSettings());
    });
  }
}
