import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createEngineBackend } from '@ashfox/backend-engine';
import {
  type AccountRecord,
  BackendRegistry,
  type BlobPointer,
  type BlobReadResult,
  type BlobStore,
  type BlobWriteInput,
  type PersistedProjectRecord,
  type PersistencePorts,
  type ProjectRepository,
  type ProjectRepositoryScope,
  type ServiceApiKeyRecord,
  type ServiceSettingsRecord,
  type WorkspaceApiKeyRecord,
  type WorkspaceFolderAclRecord,
  type WorkspaceMemberRecord,
  type WorkspaceRecord,
  type WorkspaceRepository,
  type WorkspaceRoleStorageRecord,
  toAutoProvisionedWorkspaceId,
  WORKSPACE_ADMIN_ROLE_NAME,
  WORKSPACE_MEMBER_ROLE_NAME
} from '@ashfox/backend-core';
import type { NativeJobResult } from '@ashfox/native-pipeline/types';
import { NativePipelineStore } from '@ashfox/native-pipeline/testing';
import type { ToolName, ToolPayloadMap, ToolResponse, ToolResultMap } from '@ashfox/contracts/types/internal';
import { processOneNativeJob } from '../../worker/src/nativeJobProcessor';
import { GatewayDispatcher } from '../src/core/gateway-dispatcher';
import { WorkspacePolicyService } from '../src/security/workspace-policy.service';
import { WorkspaceAdminService } from '../src/services/workspace-admin.service';
import { ProjectTreeCommandService } from '../src/services/project-tree-command.service';
import type { GatewayRuntimeService } from '../src/services/gateway-runtime.service';
import { registerAsync } from './helpers';
import { createNoopLogger, isRecord, parseJsonPlanBody, toRequest } from './helpers/nativePipelineHarness';

type SessionState = {
  textures?: Array<{ id?: string; name: string; width?: number; height?: number }>;
} & Record<string, unknown>;

const EXPORT_BUCKET = 'exports';
const DEFAULT_TENANT = 'default-tenant';
const DEFAULT_WORKSPACE_ID = toAutoProvisionedWorkspaceId('admin');
const PNG_1X1_TRANSPARENT =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5+r5kAAAAASUVORK5CYII=';

class InMemoryProjectRepository implements ProjectRepository {
  private readonly records = new Map<string, PersistedProjectRecord>();

  async find(scope: ProjectRepositoryScope): Promise<PersistedProjectRecord | null> {
    return this.records.get(this.toKey(scope)) ?? null;
  }

  async save(record: PersistedProjectRecord): Promise<void> {
    this.records.set(this.toKey(record.scope), {
      ...record,
      scope: { ...record.scope }
    });
  }

  async listByScopePrefix(scope: ProjectRepositoryScope): Promise<PersistedProjectRecord[]> {
    const scoped = Array.from(this.records.values()).filter(
      (record) => record.scope.tenantId === scope.tenantId && record.scope.projectId.startsWith(scope.projectId)
    );
    scoped.sort((left, right) => left.scope.projectId.localeCompare(right.scope.projectId));
    return scoped.map((record) => ({
      ...record,
      scope: { ...record.scope }
    }));
  }

  async remove(scope: ProjectRepositoryScope): Promise<void> {
    this.records.delete(this.toKey(scope));
  }

  private toKey(scope: ProjectRepositoryScope): string {
    return `${scope.tenantId}:${scope.projectId}`;
  }
}

class InMemoryBlobStore implements BlobStore {
  private readonly blobs = new Map<string, BlobReadResult>();

  async put(input: BlobWriteInput): Promise<BlobPointer> {
    const result: BlobReadResult = {
      bucket: input.bucket,
      key: input.key,
      bytes: new Uint8Array(input.bytes),
      contentType: input.contentType,
      ...(input.cacheControl ? { cacheControl: input.cacheControl } : {}),
      ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
      updatedAt: new Date().toISOString()
    };
    this.blobs.set(this.toKey(result), result);
    return { bucket: input.bucket, key: input.key };
  }

  async get(pointer: BlobPointer): Promise<BlobReadResult | null> {
    const found = this.blobs.get(this.toKey(pointer));
    if (!found) return null;
    return {
      ...found,
      bytes: new Uint8Array(found.bytes),
      ...(found.metadata ? { metadata: { ...found.metadata } } : {})
    };
  }

  async delete(pointer: BlobPointer): Promise<void> {
    this.blobs.delete(this.toKey(pointer));
  }

  async readUtf8(pointer: BlobPointer): Promise<string | null> {
    const found = await this.get(pointer);
    if (!found) return null;
    return Buffer.from(found.bytes).toString('utf8');
  }

  private toKey(pointer: BlobPointer): string {
    return `${pointer.bucket}:${pointer.key}`;
  }
}

class InMemoryWorkspaceRepository implements WorkspaceRepository {
  private readonly accounts = new Map<string, AccountRecord>();
  private readonly workspaces = new Map<string, WorkspaceRecord>();
  private readonly roles = new Map<string, WorkspaceRoleStorageRecord>();
  private readonly members = new Map<string, WorkspaceMemberRecord>();
  private readonly folderAcl = new Map<string, WorkspaceFolderAclRecord>();
  private readonly apiKeys = new Map<string, WorkspaceApiKeyRecord>();
  private readonly serviceApiKeys = new Map<string, ServiceApiKeyRecord>();
  private serviceSettings: ServiceSettingsRecord | null = null;

  constructor() {
    const now = new Date().toISOString();
    const workspace: WorkspaceRecord = {
      workspaceId: DEFAULT_WORKSPACE_ID,
      tenantId: 'default-tenant',
      name: 'Administrator Workspace',
      defaultMemberRoleId: 'role_user',
      createdBy: 'system',
      createdAt: now,
      updatedAt: now
    };
    this.workspaces.set(workspace.workspaceId, workspace);
    this.accounts.set('admin', {
      accountId: 'admin',
      email: 'admin@ashfox.local',
      displayName: 'Administrator',
      systemRoles: ['system_admin'],
      localLoginId: 'admin',
      passwordHash: null,
      githubUserId: null,
      githubLogin: null,
      createdAt: now,
      updatedAt: now
    });
    const userRole: WorkspaceRoleStorageRecord = {
      workspaceId: workspace.workspaceId,
      roleId: 'role_user',
      name: 'User',
      builtin: null,
      permissions: ['folder.read', 'folder.write'],
      createdAt: now,
      updatedAt: now
    };
    this.roles.set(this.toRoleKey(userRole.workspaceId, userRole.roleId), userRole);
    const adminRole: WorkspaceRoleStorageRecord = {
      workspaceId: workspace.workspaceId,
      roleId: 'role_workspace_admin',
      name: 'Workspace Admin',
      builtin: 'workspace_admin',
      permissions: [
        'workspace.settings.manage',
        'workspace.members.manage',
        'workspace.roles.manage',
        'folder.read',
        'folder.write'
      ],
      createdAt: now,
      updatedAt: now
    };
    this.roles.set(this.toRoleKey(adminRole.workspaceId, adminRole.roleId), adminRole);
    this.members.set(this.toMemberKey(workspace.workspaceId, 'admin'), {
      workspaceId: workspace.workspaceId,
      accountId: 'admin',
      roleIds: [adminRole.roleId],
      joinedAt: now
    });
    this.folderAcl.set(this.toAclKey(workspace.workspaceId, null, userRole.roleId), {
      workspaceId: workspace.workspaceId,
      ruleId: 'acl_folder_user_write',
      scope: 'folder',
      folderId: null,
      roleIds: [userRole.roleId],
      read: 'allow',
      write: 'allow',
      updatedAt: now
    });
  }

  async listAllWorkspaces(): Promise<WorkspaceRecord[]> {
    return Array.from(this.workspaces.values()).map((workspace) => ({ ...workspace }));
  }

  async listAccountWorkspaces(accountId: string): Promise<WorkspaceRecord[]> {
    const normalizedAccountId = accountId.trim();
    if (!normalizedAccountId) {
      return [];
    }
    const memberWorkspaceIds = new Set(
      Array.from(this.members.values())
        .filter((member) => member.accountId === normalizedAccountId)
        .map((member) => member.workspaceId)
    );
    return Array.from(this.workspaces.values())
      .filter((workspace) => memberWorkspaceIds.has(workspace.workspaceId))
      .map((workspace) => ({ ...workspace }));
  }

  async getAccount(accountId: string): Promise<AccountRecord | null> {
    const found = this.accounts.get(accountId);
    return found ? { ...found, systemRoles: [...found.systemRoles] } : null;
  }

  async getAccountByLocalLoginId(localLoginId: string): Promise<AccountRecord | null> {
    const normalized = localLoginId.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    const found = Array.from(this.accounts.values()).find((account) => (account.localLoginId ?? '').toLowerCase() === normalized);
    return found ? { ...found, systemRoles: [...found.systemRoles] } : null;
  }

  async getAccountByGithubUserId(githubUserId: string): Promise<AccountRecord | null> {
    const normalized = githubUserId.trim();
    if (!normalized) {
      return null;
    }
    const found = Array.from(this.accounts.values()).find((account) => account.githubUserId === normalized);
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
    const excluded = new Set(
      (input?.excludeAccountIds ?? [])
        .map((accountId) => String(accountId ?? '').trim())
        .filter((accountId) => accountId.length > 0)
    );
    return Array.from(this.accounts.values())
      .filter((account) => {
        if (excluded.has(account.accountId)) {
          return false;
        }
        if (!normalizedQuery) {
          return true;
        }
        const haystack = [
          account.accountId,
          account.displayName,
          account.email,
          account.localLoginId ?? '',
          account.githubLogin ?? ''
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .sort((left, right) => left.displayName.localeCompare(right.displayName) || left.accountId.localeCompare(right.accountId))
      .slice(0, limit)
      .map((account) => ({
        ...account,
        systemRoles: [...account.systemRoles]
      }));
  }

  async searchServiceUsers(input?: {
    q?: string;
    field?: 'any' | 'accountId' | 'displayName' | 'email' | 'localLoginId' | 'githubLogin';
    match?: 'exact' | 'prefix' | 'contains';
    workspaceId?: string;
    limit?: number;
    cursor?: string | null;
  }): Promise<{ users: AccountRecord[]; total: number; nextCursor: string | null }> {
    const q = typeof input?.q === 'string' ? input.q.trim().toLowerCase() : '';
    const field = input?.field ?? 'any';
    const match = input?.match ?? 'contains';
    const limit = Math.min(Math.max(Number.isFinite(input?.limit) ? Math.trunc(input?.limit as number) : 25, 1), 100);
    const offset = Math.max(Number.parseInt(String(input?.cursor ?? '0'), 10) || 0, 0);
    const normalizedWorkspaceId = String(input?.workspaceId ?? '').trim();
    const workspaceMembers = normalizedWorkspaceId
      ? new Set(
          Array.from(this.members.values())
            .filter((member) => member.workspaceId === normalizedWorkspaceId)
            .map((member) => member.accountId)
        )
      : null;
    const matches = (candidate: string): boolean => {
      if (!q) return true;
      const normalized = candidate.toLowerCase();
      if (match === 'exact') return normalized === q;
      if (match === 'prefix') return normalized.startsWith(q);
      return normalized.includes(q);
    };
    const filtered = Array.from(this.accounts.values())
      .filter((account) => {
        if (workspaceMembers && !workspaceMembers.has(account.accountId)) {
          return false;
        }
        if (!q) {
          return true;
        }
        const fields = {
          accountId: account.accountId,
          displayName: account.displayName,
          email: account.email,
          localLoginId: account.localLoginId ?? '',
          githubLogin: account.githubLogin ?? ''
        };
        if (field === 'any') {
          return Object.values(fields).some((value) => matches(value));
        }
        return matches(fields[field]);
      })
      .sort((left, right) => left.displayName.localeCompare(right.displayName) || left.accountId.localeCompare(right.accountId));
    const total = filtered.length;
    const users = filtered.slice(offset, offset + limit).map((account) => ({ ...account, systemRoles: [...account.systemRoles] }));
    return {
      users,
      total,
      nextCursor: offset + users.length < total ? String(offset + users.length) : null
    };
  }

  async searchServiceWorkspaces(input?: {
    q?: string;
    field?: 'any' | 'workspaceId' | 'name' | 'createdBy' | 'memberAccountId';
    match?: 'exact' | 'prefix' | 'contains';
    memberAccountId?: string;
    limit?: number;
    cursor?: string | null;
  }): Promise<{ workspaces: WorkspaceRecord[]; total: number; nextCursor: string | null }> {
    const q = typeof input?.q === 'string' ? input.q.trim().toLowerCase() : '';
    const field = input?.field ?? 'any';
    const match = input?.match ?? 'contains';
    const limit = Math.min(Math.max(Number.isFinite(input?.limit) ? Math.trunc(input?.limit as number) : 25, 1), 100);
    const offset = Math.max(Number.parseInt(String(input?.cursor ?? '0'), 10) || 0, 0);
    const normalizedMemberAccountId = String(input?.memberAccountId ?? '').trim();
    const candidateWorkspaceIds = normalizedMemberAccountId
      ? new Set(
          Array.from(this.members.values())
            .filter((member) => member.accountId === normalizedMemberAccountId)
            .map((member) => member.workspaceId)
        )
      : null;
    const matches = (candidate: string): boolean => {
      if (!q) return true;
      const normalized = candidate.toLowerCase();
      if (match === 'exact') return normalized === q;
      if (match === 'prefix') return normalized.startsWith(q);
      return normalized.includes(q);
    };
    const filtered = Array.from(this.workspaces.values())
      .filter((workspace) => {
        if (candidateWorkspaceIds && !candidateWorkspaceIds.has(workspace.workspaceId)) {
          return false;
        }
        if (!q) {
          return true;
        }
        const fields = {
          workspaceId: workspace.workspaceId,
          name: workspace.name,
          createdBy: workspace.createdBy,
          memberAccountId: Array.from(this.members.values())
            .filter((member) => member.workspaceId === workspace.workspaceId)
            .map((member) => member.accountId)
            .join(' ')
        };
        if (field === 'any') {
          return Object.values(fields).some((value) => matches(value));
        }
        return matches(fields[field]);
      })
      .sort((left, right) => left.name.localeCompare(right.name) || left.workspaceId.localeCompare(right.workspaceId));
    const total = filtered.length;
    const workspaces = filtered.slice(offset, offset + limit).map((workspace) => ({ ...workspace }));
    return {
      workspaces,
      total,
      nextCursor: offset + workspaces.length < total ? String(offset + workspaces.length) : null
    };
  }

  async upsertAccount(record: AccountRecord): Promise<void> {
    this.accounts.set(record.accountId, {
      ...record,
      systemRoles: [...record.systemRoles]
    });
  }

  async countAccountsBySystemRole(role: 'system_admin' | 'cs_admin'): Promise<number> {
    return Array.from(this.accounts.values()).filter((account) => account.systemRoles.includes(role)).length;
  }

  async updateAccountSystemRoles(
    accountId: string,
    systemRoles: Array<'system_admin' | 'cs_admin'>,
    updatedAt: string
  ): Promise<AccountRecord | null> {
    const existing = this.accounts.get(accountId);
    if (!existing) {
      return null;
    }
    const next: AccountRecord = {
      ...existing,
      systemRoles: [...new Set(systemRoles)],
      updatedAt
    };
    this.accounts.set(accountId, next);
    return {
      ...next,
      systemRoles: [...next.systemRoles]
    };
  }

  async getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null> {
    const found = this.workspaces.get(workspaceId);
    return found ? { ...found } : null;
  }

  async upsertWorkspace(record: WorkspaceRecord): Promise<void> {
    this.workspaces.set(record.workspaceId, { ...record });
  }

  async removeWorkspace(workspaceId: string): Promise<void> {
    this.workspaces.delete(workspaceId);
    for (const key of Array.from(this.roles.keys())) {
      if (key.startsWith(`${workspaceId}:`)) {
        this.roles.delete(key);
      }
    }
    for (const key of Array.from(this.members.keys())) {
      if (key.startsWith(`${workspaceId}:`)) {
        this.members.delete(key);
      }
    }
    for (const key of Array.from(this.folderAcl.keys())) {
      if (key.startsWith(`${workspaceId}:`)) {
        this.folderAcl.delete(key);
      }
    }
    for (const key of Array.from(this.apiKeys.keys())) {
      if (key.startsWith(`${workspaceId}:`)) {
        this.apiKeys.delete(key);
      }
    }
  }

  async listWorkspaceRoles(workspaceId: string): Promise<WorkspaceRoleStorageRecord[]> {
    return Array.from(this.roles.values())
      .filter((role) => role.workspaceId === workspaceId)
      .map((role) => ({ ...role }));
  }

  async upsertWorkspaceRole(record: WorkspaceRoleStorageRecord): Promise<void> {
    this.roles.set(this.toRoleKey(record.workspaceId, record.roleId), {
      ...record
    });
  }

  async removeWorkspaceRole(workspaceId: string, roleId: string): Promise<void> {
    this.roles.delete(this.toRoleKey(workspaceId, roleId));
  }

  async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberRecord[]> {
    return Array.from(this.members.values())
      .filter((member) => member.workspaceId === workspaceId)
      .map((member) => ({ ...member, roleIds: [...member.roleIds] }));
  }

  async upsertWorkspaceMember(record: WorkspaceMemberRecord): Promise<void> {
    this.members.set(this.toMemberKey(record.workspaceId, record.accountId), {
      ...record,
      roleIds: [...record.roleIds]
    });
  }

  async removeWorkspaceMember(workspaceId: string, accountId: string): Promise<void> {
    this.members.delete(this.toMemberKey(workspaceId, accountId));
  }

  async listWorkspaceFolderAcl(workspaceId: string): Promise<WorkspaceFolderAclRecord[]> {
    return Array.from(this.folderAcl.values())
      .filter((rule) => rule.workspaceId === workspaceId)
      .map((rule) => ({ ...rule, roleIds: [...rule.roleIds] }));
  }

  async upsertWorkspaceFolderAcl(record: WorkspaceFolderAclRecord): Promise<void> {
    const normalizedFolderId = record.folderId;
    const normalizedRoleIds = Array.from(
      new Set([
        ...(Array.isArray(record.roleIds) ? record.roleIds : []).map((roleId) => roleId.trim())
      ].filter((roleId) => roleId.length > 0))
    );
    const ruleId =
      typeof record.ruleId === 'string' && record.ruleId.trim().length > 0
        ? record.ruleId.trim()
        : `acl_${Buffer.from(
            ['folder', normalizedFolderId ?? '__root__', record.read, record.write, record.locked === true ? '1' : '0'].join('::'),
            'utf8'
          ).toString('base64url')}`;
    for (const roleId of normalizedRoleIds) {
      this.folderAcl.set(this.toAclKey(record.workspaceId, normalizedFolderId, roleId), {
        ...record,
        ruleId,
        scope: 'folder',
        folderId: normalizedFolderId,
        roleIds: [roleId]
      });
    }
  }

  async removeWorkspaceFolderAcl(workspaceId: string, folderId: string | null, roleId: string): Promise<void> {
    this.folderAcl.delete(this.toAclKey(workspaceId, folderId, roleId));
  }

  async listWorkspaceApiKeys(workspaceId: string): Promise<WorkspaceApiKeyRecord[]> {
    return Array.from(this.apiKeys.values())
      .filter((apiKey) => apiKey.workspaceId === workspaceId)
      .map((apiKey) => ({ ...apiKey }));
  }

  async findWorkspaceApiKeyByHash(keyHash: string): Promise<WorkspaceApiKeyRecord | null> {
    const normalizedKeyHash = keyHash.trim();
    if (!normalizedKeyHash) {
      return null;
    }
    const found = Array.from(this.apiKeys.values()).find((apiKey) => apiKey.keyHash === normalizedKeyHash);
    return found ? { ...found } : null;
  }

  async createWorkspaceApiKey(record: WorkspaceApiKeyRecord): Promise<void> {
    this.apiKeys.set(this.toApiKeyKey(record.workspaceId, record.keyId), { ...record });
  }

  async revokeWorkspaceApiKey(workspaceId: string, keyId: string, revokedAt: string): Promise<void> {
    const key = this.toApiKeyKey(workspaceId, keyId);
    const found = this.apiKeys.get(key);
    if (!found) return;
    this.apiKeys.set(key, {
      ...found,
      revokedAt,
      updatedAt: revokedAt
    });
  }

  async updateWorkspaceApiKeyLastUsed(workspaceId: string, keyId: string, lastUsedAt: string): Promise<void> {
    const key = this.toApiKeyKey(workspaceId, keyId);
    const found = this.apiKeys.get(key);
    if (!found) return;
    this.apiKeys.set(key, {
      ...found,
      lastUsedAt,
      updatedAt: lastUsedAt
    });
  }

  async listServiceApiKeys(accountId: string): Promise<ServiceApiKeyRecord[]> {
    return Array.from(this.serviceApiKeys.values())
      .filter((apiKey) => apiKey.createdBy === accountId)
      .map((apiKey) => ({ ...apiKey }));
  }

  async findServiceApiKeyByHash(keyHash: string): Promise<ServiceApiKeyRecord | null> {
    const normalizedKeyHash = keyHash.trim();
    if (!normalizedKeyHash) {
      return null;
    }
    const found = Array.from(this.serviceApiKeys.values()).find((apiKey) => apiKey.keyHash === normalizedKeyHash);
    return found ? { ...found } : null;
  }

  async createServiceApiKey(record: ServiceApiKeyRecord): Promise<void> {
    this.serviceApiKeys.set(this.toServiceApiKeyKey(record.createdBy, record.keyId), { ...record });
  }

  async revokeServiceApiKey(accountId: string, keyId: string, revokedAt: string): Promise<void> {
    const key = this.toServiceApiKeyKey(accountId, keyId);
    const found = this.serviceApiKeys.get(key);
    if (!found) return;
    this.serviceApiKeys.set(key, {
      ...found,
      revokedAt,
      updatedAt: revokedAt
    });
  }

  async updateServiceApiKeyLastUsed(accountId: string, keyId: string, lastUsedAt: string): Promise<void> {
    const key = this.toServiceApiKeyKey(accountId, keyId);
    const found = this.serviceApiKeys.get(key);
    if (!found) return;
    this.serviceApiKeys.set(key, {
      ...found,
      lastUsedAt,
      updatedAt: lastUsedAt
    });
  }

  async getServiceSettings(): Promise<ServiceSettingsRecord | null> {
    if (!this.serviceSettings) {
      return null;
    }
    return JSON.parse(JSON.stringify(this.serviceSettings)) as ServiceSettingsRecord;
  }

  async upsertServiceSettings(record: ServiceSettingsRecord): Promise<void> {
    this.serviceSettings = JSON.parse(JSON.stringify(record)) as ServiceSettingsRecord;
  }

  private toRoleKey(workspaceId: string, roleId: string): string {
    return `${workspaceId}:${roleId}`;
  }

  private toMemberKey(workspaceId: string, accountId: string): string {
    return `${workspaceId}:${accountId}`;
  }

  private toAclKey(
    workspaceId: string,
    folderId: string | null,
    roleId: string
  ): string {
    const scopeKey = folderId ?? '__root__';
    return `${workspaceId}:folder:${scopeKey}:${roleId}`;
  }

  private toApiKeyKey(workspaceId: string, keyId: string): string {
    return `${workspaceId}:${keyId}`;
  }

  private toServiceApiKeyKey(accountId: string, keyId: string): string {
    return `${accountId}:${keyId}`;
  }
}

const createInMemoryPersistence = (): PersistencePorts & {
  projectRepository: InMemoryProjectRepository;
  workspaceRepository: InMemoryWorkspaceRepository;
  blobStore: InMemoryBlobStore;
} => {
  const projectRepository = new InMemoryProjectRepository();
  const workspaceRepository = new InMemoryWorkspaceRepository();
  const blobStore = new InMemoryBlobStore();
  return {
    projectRepository,
    workspaceRepository,
    blobStore,
    health: {
      selection: {
        preset: 'local',
        databaseProvider: 'sqlite',
        storageProvider: 'db'
      },
      database: {
        provider: 'memory_repository',
        ready: true
      },
      storage: {
        provider: 'memory_blob_store',
        ready: true
      }
    }
  };
};

const buildDispatcher = (
  persistence: PersistencePorts,
  lockStore: NativePipelineStore = new NativePipelineStore(),
  lockTtlMs?: number
): GatewayDispatcher => {
  const registry = new BackendRegistry();
  registry.register(
    createEngineBackend({
      version: 'test-native',
      details: { mode: 'native-e2e-test' },
      persistence
    })
  );
  return new GatewayDispatcher({
    registry,
    defaultBackend: 'engine',
    lockStore,
    workspaceRepository: persistence.workspaceRepository,
    ...(typeof lockTtlMs === 'number' ? { lockTtlMs } : {})
  });
};

const callTool = async <TName extends ToolName>(
  dispatcher: GatewayDispatcher,
  name: TName,
  payload: ToolPayloadMap[TName] & { projectId?: string }
): Promise<ToolResponse<ToolResultMap[TName]>> =>
  dispatcher.handle(name, payload, {
    mcpSessionId: 'session-admin-default',
    mcpAccountId: 'admin',
    mcpWorkspaceId: DEFAULT_WORKSPACE_ID
  });

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const oracleFixturesRoot = path.join(repoRoot, 'packages', 'runtime', 'tests', 'oracle', 'fixtures');

const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;

const extractSessionState = (state: unknown): SessionState => {
  if (isRecord(state) && isRecord(state.session)) {
    return state.session as SessionState;
  }
  return state as SessionState;
};

const injectTextureIntoRecord = (
  state: unknown,
  texture: { id?: string; name: string; width?: number; height?: number }
): unknown => {
  const session = extractSessionState(state);
  const nextSession: SessionState = {
    ...session,
    textures: [...(session.textures ?? []), texture]
  };
  if (isRecord(state) && isRecord(state.session)) {
    return {
      ...state,
      session: nextSession
    };
  }
  return nextSession;
};

const injectTextureAssetIntoRecord = (
  state: unknown,
  asset: { id?: string; name: string; dataUri?: string; width?: number; height?: number }
): unknown => {
  if (isRecord(state) && isRecord(state.session)) {
    const rawAssets = (state as { textureAssets?: unknown }).textureAssets;
    const textureAssets = Array.isArray(rawAssets) ? [...rawAssets] : [];
    return {
      ...state,
      textureAssets: [...textureAssets, asset]
    };
  }
  return state;
};

const toExportPointer = (projectId: string, filePath: string): BlobPointer => ({
  bucket: EXPORT_BUCKET,
  key: `${DEFAULT_TENANT}/${projectId}/${filePath}`
});

const sanitizeGltfUris = (value: unknown): unknown => {
  const cloned = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  if (!isRecord(cloned)) return cloned;
  if (Array.isArray(cloned.buffers)) {
    for (const buffer of cloned.buffers) {
      if (isRecord(buffer) && 'uri' in buffer) {
        buffer.uri = '__IGNORED_DATA_URI__';
      }
    }
  }
  if (Array.isArray(cloned.images)) {
    for (const image of cloned.images) {
      if (isRecord(image) && 'uri' in image) {
        image.uri = '__IGNORED_DATA_URI__';
      }
    }
  }
  return cloned;
};

const decodeDataUriBytes = (uri: string): Uint8Array => {
  const match = /^data:([^;]+);base64,(.*)$/i.exec(uri);
  assert.ok(match, `invalid data URI: ${uri.slice(0, 48)}`);
  return Buffer.from(match![2], 'base64');
};

const sha256Bytes = (bytes: Uint8Array): string =>
  createHash('sha256')
    .update(bytes)
    .digest('hex');

registerAsync(
  (async () => {
    const persistence = createInMemoryPersistence();
    const dispatcher = buildDispatcher(persistence);
    const engine = createEngineBackend({ persistence, version: 'test-native' });
    const workspacePolicy = new WorkspacePolicyService(persistence.workspaceRepository, { cacheTtlMs: 0 });
    const workspaceAdmin = new WorkspaceAdminService(
      { persistence } as unknown as GatewayRuntimeService,
      workspacePolicy
    );

    const now = new Date().toISOString();
    await persistence.workspaceRepository.upsertAccount({
      accountId: 'member-existing',
      email: 'member-existing@ashfox.local',
      displayName: 'Existing Member',
      systemRoles: [],
      localLoginId: 'member-existing',
      passwordHash: null,
      githubUserId: null,
      githubLogin: null,
      createdAt: now,
      updatedAt: now
    });
    await persistence.workspaceRepository.upsertAccount({
      accountId: 'candidate-alpha',
      email: 'candidate-alpha@ashfox.local',
      displayName: 'Candidate Alpha',
      systemRoles: [],
      localLoginId: 'candidate-alpha',
      passwordHash: 'should-not-be-exposed',
      githubUserId: null,
      githubLogin: null,
      createdAt: now,
      updatedAt: now
    });
    await persistence.workspaceRepository.upsertAccount({
      accountId: 'candidate-beta',
      email: 'candidate-beta@ashfox.local',
      displayName: 'Candidate Beta',
      systemRoles: ['cs_admin'],
      localLoginId: 'candidate-beta',
      passwordHash: null,
      githubUserId: 'github-candidate-beta',
      githubLogin: 'candidate-beta-gh',
      createdAt: now,
      updatedAt: now
    });
    await persistence.workspaceRepository.upsertWorkspaceMember({
      workspaceId: DEFAULT_WORKSPACE_ID,
      accountId: 'member-existing',
      roleIds: ['role_user'],
      joinedAt: now
    });

    const forbiddenCandidatesPlan = await workspaceAdmin.listWorkspaceMemberCandidates(
      toRequest({
        'x-ashfox-account-id': 'viewer'
      }),
      DEFAULT_WORKSPACE_ID,
      {}
    );
    assert.equal(forbiddenCandidatesPlan.status, 403);
    const forbiddenCandidatesBody = parseJsonPlanBody<{ ok: boolean; code?: string }>(forbiddenCandidatesPlan.body);
    assert.equal(forbiddenCandidatesBody.ok, false);
    assert.equal(forbiddenCandidatesBody.code, 'forbidden_workspace');

    const candidatesPlan = await workspaceAdmin.listWorkspaceMemberCandidates(
      toRequest({
        'x-ashfox-account-id': 'admin',
        'x-ashfox-system-roles': 'system_admin'
      }),
      DEFAULT_WORKSPACE_ID,
      { query: 'candidate', limit: 10 }
    );
    assert.equal(candidatesPlan.status, 200);
    const candidatesBody = parseJsonPlanBody<{
      ok: boolean;
      candidates: Array<Record<string, unknown>>;
    }>(candidatesPlan.body);
    assert.equal(candidatesBody.ok, true);
    assert.deepEqual(
      candidatesBody.candidates.map((candidate) => candidate.accountId),
      ['candidate-alpha', 'candidate-beta']
    );
    assert.equal(candidatesBody.candidates.some((candidate) => 'passwordHash' in candidate), false);
    assert.equal(candidatesBody.candidates.some((candidate) => candidate.accountId === 'admin'), false);
    assert.equal(candidatesBody.candidates.some((candidate) => candidate.accountId === 'member-existing'), false);
    assert.deepEqual(candidatesBody.candidates[1]?.systemRoles, ['cs_admin']);

    const limitedCandidatesPlan = await workspaceAdmin.listWorkspaceMemberCandidates(
      toRequest({
        'x-ashfox-account-id': 'admin',
        'x-ashfox-system-roles': 'system_admin'
      }),
      DEFAULT_WORKSPACE_ID,
      { limit: 1 }
    );
    assert.equal(limitedCandidatesPlan.status, 200);
    const limitedCandidatesBody = parseJsonPlanBody<{
      ok: boolean;
      candidates: Array<{ accountId: string }>;
    }>(limitedCandidatesPlan.body);
    assert.equal(limitedCandidatesBody.ok, true);
    assert.equal(limitedCandidatesBody.candidates.length, 1);

    const roleListPlan = await workspaceAdmin.listWorkspaceRoles(
      toRequest({
        'x-ashfox-account-id': 'admin',
        'x-ashfox-system-roles': 'system_admin'
      }),
      DEFAULT_WORKSPACE_ID
    );
    assert.equal(roleListPlan.status, 200);
    const roleListBody = parseJsonPlanBody<{
      ok: boolean;
      roles: Array<{ roleId: string; name: string }>;
    }>(roleListPlan.body);
    assert.equal(roleListBody.ok, true);
    const roleNameById = new Map(roleListBody.roles.map((role) => [role.roleId, role.name]));
    assert.equal(roleNameById.get('role_workspace_admin'), WORKSPACE_ADMIN_ROLE_NAME);
    assert.equal(roleNameById.get('role_user'), WORKSPACE_MEMBER_ROLE_NAME);

    const rolePolicyWorkspacePlan = await workspaceAdmin.createWorkspace(
      toRequest({
        'x-ashfox-account-id': 'admin',
        'x-ashfox-system-roles': 'system_admin'
      }),
      { name: 'Role Policy Workspace' }
    );
    assert.equal(rolePolicyWorkspacePlan.status, 201);
    const rolePolicyWorkspaceBody = parseJsonPlanBody<{
      ok: boolean;
      workspace: { workspaceId: string; defaultMemberRoleId: string };
    }>(rolePolicyWorkspacePlan.body);
    assert.equal(rolePolicyWorkspaceBody.ok, true);
    const rolePolicyWorkspaceId = rolePolicyWorkspaceBody.workspace.workspaceId;
    assert.equal(rolePolicyWorkspaceBody.workspace.defaultMemberRoleId, 'role_user');
    const rolePolicyMembersAfterCreate = await persistence.workspaceRepository.listWorkspaceMembers(rolePolicyWorkspaceId);
    const rolePolicyAdminMember = rolePolicyMembersAfterCreate.find((member) => member.accountId === 'admin');
    assert.ok(rolePolicyAdminMember);
    assert.equal(rolePolicyAdminMember?.roleIds.includes('role_workspace_admin'), true);
    assert.equal(rolePolicyAdminMember?.roleIds.includes('role_user'), true);

    const rolePolicyDeleteAdminPlan = await workspaceAdmin.deleteWorkspaceRole(
      toRequest({
        'x-ashfox-account-id': 'admin',
        'x-ashfox-system-roles': 'system_admin'
      }),
      rolePolicyWorkspaceId,
      'role_workspace_admin'
    );
    assert.equal(rolePolicyDeleteAdminPlan.status, 400);
    const rolePolicyDeleteAdminBody = parseJsonPlanBody<{ ok: boolean; code?: string }>(rolePolicyDeleteAdminPlan.body);
    assert.equal(rolePolicyDeleteAdminBody.ok, false);
    assert.equal(rolePolicyDeleteAdminBody.code, 'workspace_role_admin_immutable');

    const rolePolicyDeleteDefaultPlan = await workspaceAdmin.deleteWorkspaceRole(
      toRequest({
        'x-ashfox-account-id': 'admin',
        'x-ashfox-system-roles': 'system_admin'
      }),
      rolePolicyWorkspaceId,
      'role_user'
    );
    assert.equal(rolePolicyDeleteDefaultPlan.status, 400);
    const rolePolicyDeleteDefaultBody = parseJsonPlanBody<{ ok: boolean; code?: string }>(rolePolicyDeleteDefaultPlan.body);
    assert.equal(rolePolicyDeleteDefaultBody.ok, false);
    assert.equal(rolePolicyDeleteDefaultBody.code, 'workspace_role_default_member_guard');

    const rolePolicySetAdminDefaultPlan = await workspaceAdmin.setWorkspaceDefaultMemberRole(
      toRequest({
        'x-ashfox-account-id': 'admin',
        'x-ashfox-system-roles': 'system_admin'
      }),
      rolePolicyWorkspaceId,
      { roleId: 'role_workspace_admin' }
    );
    assert.equal(rolePolicySetAdminDefaultPlan.status, 400);
    const rolePolicySetAdminDefaultBody = parseJsonPlanBody<{ ok: boolean; code?: string }>(rolePolicySetAdminDefaultPlan.body);
    assert.equal(rolePolicySetAdminDefaultBody.ok, false);
    assert.equal(rolePolicySetAdminDefaultBody.code, 'workspace_default_member_admin_forbidden');

    const createRolePolicyCustomRolePlan = await workspaceAdmin.upsertWorkspaceRole(
      toRequest({
        'x-ashfox-account-id': 'admin',
        'x-ashfox-system-roles': 'system_admin'
      }),
      rolePolicyWorkspaceId,
      {
        name: 'Custom Member',
        permissions: ['folder.read']
      }
    );
    assert.equal(createRolePolicyCustomRolePlan.status, 200);
    const createRolePolicyCustomRoleBody = parseJsonPlanBody<{
      ok: boolean;
      roles: Array<{ roleId: string; name: string }>;
    }>(createRolePolicyCustomRolePlan.body);
    assert.equal(createRolePolicyCustomRoleBody.ok, true);
    const customMemberRole = createRolePolicyCustomRoleBody.roles.find((role) => role.name === 'Custom Member');
    assert.ok(customMemberRole);
    const customMemberRoleId = customMemberRole?.roleId ?? '';
    assert.ok(customMemberRoleId.length > 0);

    const duplicateRoleNamePlan = await workspaceAdmin.upsertWorkspaceRole(
      toRequest({
        'x-ashfox-account-id': 'admin',
        'x-ashfox-system-roles': 'system_admin'
      }),
      rolePolicyWorkspaceId,
      {
        name: '  custom member  '
      }
    );
    assert.equal(duplicateRoleNamePlan.status, 409);
    const duplicateRoleNameBody = parseJsonPlanBody<{ ok: boolean; code?: string }>(duplicateRoleNamePlan.body);
    assert.equal(duplicateRoleNameBody.ok, false);
    assert.equal(duplicateRoleNameBody.code, 'workspace_role_name_conflict');

    const duplicateLegacyDefaultRoleNamePlan = await workspaceAdmin.upsertWorkspaceRole(
      toRequest({
        'x-ashfox-account-id': 'admin',
        'x-ashfox-system-roles': 'system_admin'
      }),
      rolePolicyWorkspaceId,
      {
        name: 'User'
      }
    );
    assert.equal(duplicateLegacyDefaultRoleNamePlan.status, 409);
    const duplicateLegacyDefaultRoleNameBody = parseJsonPlanBody<{ ok: boolean; code?: string }>(
      duplicateLegacyDefaultRoleNamePlan.body
    );
    assert.equal(duplicateLegacyDefaultRoleNameBody.ok, false);
    assert.equal(duplicateLegacyDefaultRoleNameBody.code, 'workspace_role_name_conflict');

    const rolePolicySetDefaultPlan = await workspaceAdmin.setWorkspaceDefaultMemberRole(
      toRequest({
        'x-ashfox-account-id': 'admin',
        'x-ashfox-system-roles': 'system_admin'
      }),
      rolePolicyWorkspaceId,
      { roleId: customMemberRoleId }
    );
    assert.equal(rolePolicySetDefaultPlan.status, 200);
    const rolePolicySetDefaultBody = parseJsonPlanBody<{
      ok: boolean;
      workspace: { defaultMemberRoleId: string };
    }>(rolePolicySetDefaultPlan.body);
    assert.equal(rolePolicySetDefaultBody.ok, true);
    assert.equal(rolePolicySetDefaultBody.workspace.defaultMemberRoleId, customMemberRoleId);

    const rolePolicyDeleteFormerDefaultPlan = await workspaceAdmin.deleteWorkspaceRole(
      toRequest({
        'x-ashfox-account-id': 'admin',
        'x-ashfox-system-roles': 'system_admin'
      }),
      rolePolicyWorkspaceId,
      'role_user'
    );
    assert.equal(rolePolicyDeleteFormerDefaultPlan.status, 200);
    const rolePolicyDeleteFormerDefaultBody = parseJsonPlanBody<{
      ok: boolean;
      roles: Array<{ roleId: string }>;
    }>(rolePolicyDeleteFormerDefaultPlan.body);
    assert.equal(rolePolicyDeleteFormerDefaultBody.ok, true);
    assert.equal(rolePolicyDeleteFormerDefaultBody.roles.some((role) => role.roleId === 'role_user'), false);

    const rolePolicyMemberUpsertPlan = await workspaceAdmin.upsertWorkspaceMember(
      toRequest({
        'x-ashfox-account-id': 'admin',
        'x-ashfox-system-roles': 'system_admin'
      }),
      rolePolicyWorkspaceId,
      {
        accountId: 'candidate-alpha',
        roleIds: []
      }
    );
    assert.equal(rolePolicyMemberUpsertPlan.status, 200);
    const rolePolicyMemberUpsertBody = parseJsonPlanBody<{
      ok: boolean;
      members: Array<{ accountId: string; roleIds: string[] }>;
    }>(rolePolicyMemberUpsertPlan.body);
    assert.equal(rolePolicyMemberUpsertBody.ok, true);
    const customMember = rolePolicyMemberUpsertBody.members.find((member) => member.accountId === 'candidate-alpha');
    assert.ok(customMember);
    assert.deepEqual(customMember?.roleIds, [customMemberRoleId]);

    const bootstrapAdminRoleMutationPlan = await workspaceAdmin.upsertWorkspaceMember(
      toRequest({
        'x-ashfox-account-id': 'admin',
        'x-ashfox-system-roles': 'system_admin'
      }),
      rolePolicyWorkspaceId,
      {
        accountId: 'admin',
        roleIds: [customMemberRoleId]
      }
    );
    assert.equal(bootstrapAdminRoleMutationPlan.status, 400);
    const bootstrapAdminRoleMutationBody = parseJsonPlanBody<{ ok: boolean; code?: string }>(bootstrapAdminRoleMutationPlan.body);
    assert.equal(bootstrapAdminRoleMutationBody.ok, false);
    assert.equal(bootstrapAdminRoleMutationBody.code, 'workspace_member_bootstrap_admin_immutable');

    const adminGuardWorkspaceId = 'ws_admin_guard';
    await persistence.workspaceRepository.upsertWorkspace({
      workspaceId: adminGuardWorkspaceId,
      tenantId: DEFAULT_TENANT,
      name: 'Admin Guard Workspace',
      defaultMemberRoleId: 'role_user',
      createdBy: 'system',
      createdAt: now,
      updatedAt: now
    });
    await persistence.workspaceRepository.upsertWorkspaceRole({
      workspaceId: adminGuardWorkspaceId,
      roleId: 'role_workspace_admin',
      name: 'Admin',
      builtin: 'workspace_admin',
      permissions: [
        'workspace.settings.manage',
        'workspace.members.manage',
        'workspace.roles.manage',
        'folder.read',
        'folder.write'
      ],
      createdAt: now,
      updatedAt: now
    });
    await persistence.workspaceRepository.upsertWorkspaceRole({
      workspaceId: adminGuardWorkspaceId,
      roleId: 'role_user',
      name: 'User',
      builtin: null,
      permissions: ['folder.read', 'folder.write'],
      createdAt: now,
      updatedAt: now
    });
    await persistence.workspaceRepository.upsertWorkspaceMember({
      workspaceId: adminGuardWorkspaceId,
      accountId: 'manager-a',
      roleIds: ['role_workspace_admin'],
      joinedAt: now
    });
    await persistence.workspaceRepository.upsertWorkspaceMember({
      workspaceId: adminGuardWorkspaceId,
      accountId: 'member-a',
      roleIds: ['role_user'],
      joinedAt: now
    });
    await persistence.workspaceRepository.upsertWorkspaceMember({
      workspaceId: adminGuardWorkspaceId,
      accountId: 'member-b',
      roleIds: ['role_user'],
      joinedAt: now
    });

    const demoteLastAdminPlan = await workspaceAdmin.upsertWorkspaceMember(
      toRequest({
        'x-ashfox-account-id': 'admin',
        'x-ashfox-system-roles': 'system_admin'
      }),
      adminGuardWorkspaceId,
      {
        accountId: 'manager-a',
        roleIds: ['role_user']
      }
    );
    assert.equal(demoteLastAdminPlan.status, 400);
    const demoteLastAdminBody = parseJsonPlanBody<{ ok: boolean; code?: string }>(demoteLastAdminPlan.body);
    assert.equal(demoteLastAdminBody.ok, false);
    assert.equal(demoteLastAdminBody.code, 'workspace_member_last_admin_guard');

    const deleteLastAdminPlan = await workspaceAdmin.deleteWorkspaceMember(
      toRequest({
        'x-ashfox-account-id': 'admin',
        'x-ashfox-system-roles': 'system_admin'
      }),
      adminGuardWorkspaceId,
      'manager-a'
    );
    assert.equal(deleteLastAdminPlan.status, 400);
    const deleteLastAdminBody = parseJsonPlanBody<{ ok: boolean; code?: string }>(deleteLastAdminPlan.body);
    assert.equal(deleteLastAdminBody.ok, false);
    assert.equal(deleteLastAdminBody.code, 'workspace_member_last_admin_guard');

    const selfDeletePlan = await workspaceAdmin.deleteWorkspaceMember(
      toRequest({
        'x-ashfox-account-id': 'admin',
        'x-ashfox-system-roles': 'system_admin'
      }),
      DEFAULT_WORKSPACE_ID,
      'admin'
    );
    assert.equal(selfDeletePlan.status, 400);
    const selfDeleteBody = parseJsonPlanBody<{ ok: boolean; code?: string }>(selfDeletePlan.body);
    assert.equal(selfDeleteBody.ok, false);
    assert.equal(selfDeleteBody.code, 'workspace_member_self_remove_forbidden');

    const minimumGuardPlan = await workspaceAdmin.deleteWorkspaceMember(
      toRequest({
        'x-ashfox-account-id': 'admin',
        'x-ashfox-system-roles': 'system_admin'
      }),
      DEFAULT_WORKSPACE_ID,
      'member-existing'
    );
    assert.equal(minimumGuardPlan.status, 400);
    const minimumGuardBody = parseJsonPlanBody<{ ok: boolean; code?: string }>(minimumGuardPlan.body);
    assert.equal(minimumGuardBody.ok, false);
    assert.equal(minimumGuardBody.code, 'workspace_member_minimum_guard');

    await persistence.workspaceRepository.upsertAccount({
      accountId: 'member-third',
      email: 'member-third@ashfox.local',
      displayName: 'Third Member',
      systemRoles: [],
      localLoginId: 'member-third',
      passwordHash: null,
      githubUserId: null,
      githubLogin: null,
      createdAt: now,
      updatedAt: now
    });
    await persistence.workspaceRepository.upsertWorkspaceMember({
      workspaceId: DEFAULT_WORKSPACE_ID,
      accountId: 'member-third',
      roleIds: ['role_user'],
      joinedAt: now
    });

    const allowedDeletePlan = await workspaceAdmin.deleteWorkspaceMember(
      toRequest({
        'x-ashfox-account-id': 'admin',
        'x-ashfox-system-roles': 'system_admin'
      }),
      DEFAULT_WORKSPACE_ID,
      'member-existing'
    );
    assert.equal(allowedDeletePlan.status, 200);
    const allowedDeleteBody = parseJsonPlanBody<{
      ok: boolean;
      members: Array<{ accountId: string }>;
    }>(allowedDeletePlan.body);
    assert.equal(allowedDeleteBody.ok, true);
    assert.equal(allowedDeleteBody.members.some((member) => member.accountId === 'member-existing'), false);

    const forbiddenApiKeyListPlan = await workspaceAdmin.listWorkspaceApiKeys(
      toRequest({
        'x-ashfox-account-id': 'viewer'
      }),
      DEFAULT_WORKSPACE_ID
    );
    assert.equal(forbiddenApiKeyListPlan.status, 403);
    const forbiddenApiKeyListBody = parseJsonPlanBody<{ ok: boolean; code?: string }>(forbiddenApiKeyListPlan.body);
    assert.equal(forbiddenApiKeyListBody.ok, false);
    assert.equal(forbiddenApiKeyListBody.code, 'forbidden_workspace');

    const createApiKeyPlan = await workspaceAdmin.createWorkspaceApiKey(
      toRequest({
        'x-ashfox-account-id': 'admin',
        'x-ashfox-system-roles': 'system_admin'
      }),
      DEFAULT_WORKSPACE_ID,
      {
        name: 'ci token',
        expiresAt: '2026-12-31T00:00:00.000Z'
      }
    );
    assert.equal(createApiKeyPlan.status, 201);
    const createApiKeyBody = parseJsonPlanBody<{
      ok: boolean;
      secret: string;
      apiKey: {
        keyId: string;
        name: string;
        keyPrefix: string;
        expiresAt: string | null;
      } & Record<string, unknown>;
    }>(createApiKeyPlan.body);
    assert.equal(createApiKeyBody.ok, true);
    assert.equal(typeof createApiKeyBody.secret, 'string');
    assert.equal(createApiKeyBody.secret.startsWith('ak_'), true);
    assert.equal(createApiKeyBody.apiKey.name, 'ci token');
    assert.equal('keyHash' in createApiKeyBody.apiKey, false);

    const persistedApiKeys = await persistence.workspaceRepository.listWorkspaceApiKeys(DEFAULT_WORKSPACE_ID);
    const persistedCreatedApiKey = persistedApiKeys.find((apiKey) => apiKey.keyId === createApiKeyBody.apiKey.keyId);
    assert.ok(persistedCreatedApiKey);
    assert.equal(persistedCreatedApiKey?.keyPrefix, createApiKeyBody.apiKey.keyPrefix);
    assert.equal(persistedCreatedApiKey?.keyHash.length, 64);
    assert.notEqual(persistedCreatedApiKey?.keyHash, createApiKeyBody.secret);

    const listApiKeyPlan = await workspaceAdmin.listWorkspaceApiKeys(
      toRequest({
        'x-ashfox-account-id': 'admin',
        'x-ashfox-system-roles': 'system_admin'
      }),
      DEFAULT_WORKSPACE_ID
    );
    assert.equal(listApiKeyPlan.status, 200);
    const listApiKeyBody = parseJsonPlanBody<{
      ok: boolean;
      apiKeys: Array<Record<string, unknown>>;
    }>(listApiKeyPlan.body);
    assert.equal(listApiKeyBody.ok, true);
    const listedApiKey = listApiKeyBody.apiKeys.find((apiKey) => apiKey.keyId === createApiKeyBody.apiKey.keyId);
    assert.ok(listedApiKey);
    assert.equal('keyHash' in (listedApiKey ?? {}), false);

    workspacePolicy.invalidateWorkspace(DEFAULT_WORKSPACE_ID);
    const memberInitialApiKeyListPlan = await workspaceAdmin.listWorkspaceApiKeys(
      toRequest({
        'x-ashfox-account-id': 'member-third'
      }),
      DEFAULT_WORKSPACE_ID
    );
    assert.equal(memberInitialApiKeyListPlan.status, 200);
    const memberInitialApiKeyListBody = parseJsonPlanBody<{
      ok: boolean;
      apiKeys: Array<{ keyId: string }>;
    }>(memberInitialApiKeyListPlan.body);
    assert.equal(memberInitialApiKeyListBody.ok, true);
    assert.equal(memberInitialApiKeyListBody.apiKeys.length, 0);

    const revokeApiKeyPlan = await workspaceAdmin.revokeWorkspaceApiKey(
      toRequest({
        'x-ashfox-account-id': 'admin',
        'x-ashfox-system-roles': 'system_admin'
      }),
      DEFAULT_WORKSPACE_ID,
      { keyId: createApiKeyBody.apiKey.keyId }
    );
    assert.equal(revokeApiKeyPlan.status, 200);
    const revokeApiKeyBody = parseJsonPlanBody<{
      ok: boolean;
      apiKeys: Array<{ keyId: string; revokedAt: string | null }>;
    }>(revokeApiKeyPlan.body);
    assert.equal(revokeApiKeyBody.ok, true);
    const revokedApiKey = revokeApiKeyBody.apiKeys.find((apiKey) => apiKey.keyId === createApiKeyBody.apiKey.keyId);
    assert.ok(revokedApiKey);
    assert.equal(typeof revokedApiKey?.revokedAt, 'string');

    const revokeUnknownApiKeyPlan = await workspaceAdmin.revokeWorkspaceApiKey(
      toRequest({
        'x-ashfox-account-id': 'admin',
        'x-ashfox-system-roles': 'system_admin'
      }),
      DEFAULT_WORKSPACE_ID,
      { keyId: 'key_missing' }
    );
    assert.equal(revokeUnknownApiKeyPlan.status, 404);
    const revokeUnknownApiKeyBody = parseJsonPlanBody<{ ok: boolean; code?: string }>(revokeUnknownApiKeyPlan.body);
    assert.equal(revokeUnknownApiKeyBody.ok, false);
    assert.equal(revokeUnknownApiKeyBody.code, 'workspace_api_key_not_found');

    const memberCreateApiKeyPlan = await workspaceAdmin.createWorkspaceApiKey(
      toRequest({
        'x-ashfox-account-id': 'member-third'
      }),
      DEFAULT_WORKSPACE_ID,
      {
        name: 'member token'
      }
    );
    assert.equal(memberCreateApiKeyPlan.status, 201);
    const memberCreateApiKeyBody = parseJsonPlanBody<{
      ok: boolean;
      apiKey: { keyId: string; createdBy: string };
    }>(memberCreateApiKeyPlan.body);
    assert.equal(memberCreateApiKeyBody.ok, true);
    assert.equal(memberCreateApiKeyBody.apiKey.createdBy, 'member-third');

    const adminListAfterMemberCreatePlan = await workspaceAdmin.listWorkspaceApiKeys(
      toRequest({
        'x-ashfox-account-id': 'admin',
        'x-ashfox-system-roles': 'system_admin'
      }),
      DEFAULT_WORKSPACE_ID
    );
    assert.equal(adminListAfterMemberCreatePlan.status, 200);
    const adminListAfterMemberCreateBody = parseJsonPlanBody<{
      ok: boolean;
      apiKeys: Array<{ keyId: string }>;
    }>(adminListAfterMemberCreatePlan.body);
    assert.equal(adminListAfterMemberCreateBody.ok, true);
    assert.equal(
      adminListAfterMemberCreateBody.apiKeys.some((apiKey) => apiKey.keyId === memberCreateApiKeyBody.apiKey.keyId),
      false
    );

    const memberListAfterCreatePlan = await workspaceAdmin.listWorkspaceApiKeys(
      toRequest({
        'x-ashfox-account-id': 'member-third'
      }),
      DEFAULT_WORKSPACE_ID
    );
    assert.equal(memberListAfterCreatePlan.status, 200);
    const memberListAfterCreateBody = parseJsonPlanBody<{
      ok: boolean;
      apiKeys: Array<{ keyId: string; createdBy: string }>;
    }>(memberListAfterCreatePlan.body);
    assert.equal(memberListAfterCreateBody.ok, true);
    assert.equal(memberListAfterCreateBody.apiKeys.some((apiKey) => apiKey.keyId === memberCreateApiKeyBody.apiKey.keyId), true);
    assert.equal(memberListAfterCreateBody.apiKeys.every((apiKey) => apiKey.createdBy === 'member-third'), true);

    const memberRevokeAdminKeyPlan = await workspaceAdmin.revokeWorkspaceApiKey(
      toRequest({
        'x-ashfox-account-id': 'member-third'
      }),
      DEFAULT_WORKSPACE_ID,
      { keyId: createApiKeyBody.apiKey.keyId }
    );
    assert.equal(memberRevokeAdminKeyPlan.status, 404);
    const memberRevokeAdminKeyBody = parseJsonPlanBody<{ ok: boolean; code?: string }>(memberRevokeAdminKeyPlan.body);
    assert.equal(memberRevokeAdminKeyBody.ok, false);
    assert.equal(memberRevokeAdminKeyBody.code, 'workspace_api_key_not_found');

    const memberIssuedKeyIds: string[] = [memberCreateApiKeyBody.apiKey.keyId];
    for (let index = 0; index < 9; index += 1) {
      const issuedPlan = await workspaceAdmin.createWorkspaceApiKey(
        toRequest({
          'x-ashfox-account-id': 'member-third'
        }),
        DEFAULT_WORKSPACE_ID,
        {
          name: `member token ${index + 2}`
        }
      );
      assert.equal(issuedPlan.status, 201);
      const issuedBody = parseJsonPlanBody<{
        ok: boolean;
        apiKey: { keyId: string };
      }>(issuedPlan.body);
      assert.equal(issuedBody.ok, true);
      memberIssuedKeyIds.push(issuedBody.apiKey.keyId);
    }

    const memberLimitPlan = await workspaceAdmin.createWorkspaceApiKey(
      toRequest({
        'x-ashfox-account-id': 'member-third'
      }),
      DEFAULT_WORKSPACE_ID,
      {
        name: 'member token 11'
      }
    );
    assert.equal(memberLimitPlan.status, 409);
    const memberLimitBody = parseJsonPlanBody<{ ok: boolean; code?: string }>(memberLimitPlan.body);
    assert.equal(memberLimitBody.ok, false);
    assert.equal(memberLimitBody.code, 'workspace_api_key_limit_exceeded');

    const memberRevokeOwnPlan = await workspaceAdmin.revokeWorkspaceApiKey(
      toRequest({
        'x-ashfox-account-id': 'member-third'
      }),
      DEFAULT_WORKSPACE_ID,
      { keyId: memberIssuedKeyIds[0] }
    );
    assert.equal(memberRevokeOwnPlan.status, 200);
    const memberRevokeOwnBody = parseJsonPlanBody<{
      ok: boolean;
      apiKeys: Array<{ keyId: string; revokedAt: string | null }>;
    }>(memberRevokeOwnPlan.body);
    assert.equal(memberRevokeOwnBody.ok, true);
    const revokedOwn = memberRevokeOwnBody.apiKeys.find((apiKey) => apiKey.keyId === memberIssuedKeyIds[0]);
    assert.ok(revokedOwn);
    assert.equal(typeof revokedOwn?.revokedAt, 'string');

    const memberCreateAfterRevokePlan = await workspaceAdmin.createWorkspaceApiKey(
      toRequest({
        'x-ashfox-account-id': 'member-third'
      }),
      DEFAULT_WORKSPACE_ID,
      {
        name: 'member token recycle'
      }
    );
    assert.equal(memberCreateAfterRevokePlan.status, 201);

    const missingMcpAccountContext = await dispatcher.handle(
      'ensure_project',
      {
        projectId: 'prj_missing_mcp_account',
        name: 'missing-account-context',
        onMissing: 'create'
      } as ToolPayloadMap['ensure_project'],
      {
        mcpSessionId: 'session-missing-account',
        mcpWorkspaceId: DEFAULT_WORKSPACE_ID
      }
    );
    assert.equal(missingMcpAccountContext.ok, false);
    if (!missingMcpAccountContext.ok) {
      assert.equal(missingMcpAccountContext.error.code, 'invalid_state');
      assert.equal(missingMcpAccountContext.error.details?.reason, 'missing_mcp_account_context');
    }

    const mismatchedMcpWorkspaceContext = await dispatcher.handle(
      'ensure_project',
      {
        projectId: 'prj_workspace_mismatch',
        name: 'workspace-mismatch',
        onMissing: 'create',
        workspaceId: 'ws_mismatch'
      } as ToolPayloadMap['ensure_project'] & { workspaceId: string },
      {
        mcpSessionId: 'session-mismatch',
        mcpAccountId: 'admin',
        mcpWorkspaceId: DEFAULT_WORKSPACE_ID,
        mcpApiKeyId: 'key_mismatch'
      }
    );
    assert.equal(mismatchedMcpWorkspaceContext.ok, false);
    if (!mismatchedMcpWorkspaceContext.ok) {
      assert.equal(mismatchedMcpWorkspaceContext.error.code, 'invalid_payload');
      assert.equal(mismatchedMcpWorkspaceContext.error.details?.reason, 'mcp_workspace_context_mismatch');
    }

    const lockStore = new NativePipelineStore();
    const lockAwareDispatcher = buildDispatcher(persistence, lockStore);
    const projectTreeCommand = new ProjectTreeCommandService(
      {
        dashboardStore: lockStore
      } as unknown as GatewayRuntimeService,
      workspacePolicy
    );
    await lockStore.acquireProjectLock({
      workspaceId: DEFAULT_WORKSPACE_ID,
      projectId: 'prj_lock_conflict',
      ownerAgentId: 'mcp:session-holder',
      ownerSessionId: 'session-holder'
    });
    const lockConflict = await lockAwareDispatcher.handle(
      'ensure_project',
      {
        projectId: 'prj_lock_conflict',
        name: 'conflict-project',
        onMissing: 'create'
      } as ToolPayloadMap['ensure_project'],
      {
        mcpSessionId: 'session-other',
        mcpAccountId: 'admin',
        mcpWorkspaceId: DEFAULT_WORKSPACE_ID
      }
    );
    assert.equal(lockConflict.ok, false);
    if (!lockConflict.ok) {
      assert.equal(lockConflict.error.code, 'invalid_state');
      assert.equal(lockConflict.error.details?.reason, 'project_locked');
    }
    await lockStore.releaseProjectLock({
      workspaceId: DEFAULT_WORKSPACE_ID,
      projectId: 'prj_lock_conflict',
      ownerAgentId: 'mcp:session-holder',
      ownerSessionId: 'session-holder'
    });

    const idleTimeoutLockStore = new NativePipelineStore();
    const idleTimeoutDispatcher = buildDispatcher(persistence, idleTimeoutLockStore, 5_000);
    const ownerMutation = await idleTimeoutDispatcher.handle(
      'ensure_project',
      {
        projectId: 'prj_lock_idle_timeout',
        name: 'idle-timeout-project',
        onMissing: 'create'
      } as ToolPayloadMap['ensure_project'],
      {
        mcpSessionId: 'session-holder',
        mcpAccountId: 'admin',
        mcpWorkspaceId: DEFAULT_WORKSPACE_ID
      }
    );
    assert.equal(ownerMutation.ok, true);

    const heldAfterMutation = await idleTimeoutLockStore.getProjectLock('prj_lock_idle_timeout', DEFAULT_WORKSPACE_ID);
    assert.equal(heldAfterMutation?.ownerSessionId, 'session-holder');

    const conflictBeforeExpiry = await idleTimeoutDispatcher.handle(
      'add_bone',
      {
        projectId: 'prj_lock_idle_timeout',
        name: 'root'
      } as ToolPayloadMap['add_bone'],
      {
        mcpSessionId: 'session-other',
        mcpAccountId: 'admin',
        mcpWorkspaceId: DEFAULT_WORKSPACE_ID
      }
    );
    assert.equal(conflictBeforeExpiry.ok, false);
    if (!conflictBeforeExpiry.ok) {
      assert.equal(conflictBeforeExpiry.error.code, 'invalid_state');
      assert.equal(conflictBeforeExpiry.error.details?.reason, 'project_locked');
    }

    const originalNowForLockExpiry = Date.now;
    try {
      const expiresAt = Date.parse(heldAfterMutation?.expiresAt ?? '');
      assert.equal(Number.isFinite(expiresAt), true);
      Date.now = () => expiresAt + 1;
      const takeOverAfterExpiry = await idleTimeoutDispatcher.handle(
        'add_bone',
        {
          projectId: 'prj_lock_idle_timeout',
          name: 'root'
        } as ToolPayloadMap['add_bone'],
        {
          mcpSessionId: 'session-other',
          mcpAccountId: 'admin',
          mcpWorkspaceId: DEFAULT_WORKSPACE_ID
        }
      );
      assert.equal(takeOverAfterExpiry.ok, true);
    } finally {
      Date.now = originalNowForLockExpiry;
    }

    const lockAfterTakeOver = await idleTimeoutLockStore.getProjectLock('prj_lock_idle_timeout', DEFAULT_WORKSPACE_ID);
    assert.equal(lockAfterTakeOver?.ownerSessionId, 'session-other');

    await persistence.workspaceRepository.upsertWorkspace({
      workspaceId: 'ws_rbac',
      tenantId: DEFAULT_TENANT,
      name: 'RBAC Workspace',
      defaultMemberRoleId: 'role_reader',
      createdBy: 'system',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await persistence.workspaceRepository.upsertWorkspaceRole({
      workspaceId: 'ws_rbac',
      roleId: 'role_reader',
      name: 'Reader',
      builtin: null,
      permissions: ['folder.read'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await persistence.workspaceRepository.upsertWorkspaceRole({
      workspaceId: 'ws_rbac',
      roleId: 'role_writer',
      name: 'Writer',
      builtin: null,
      permissions: ['folder.read', 'folder.write'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await persistence.workspaceRepository.upsertWorkspaceMember({
      workspaceId: 'ws_rbac',
      accountId: 'reader-account',
      roleIds: ['role_reader'],
      joinedAt: new Date().toISOString()
    });
    await persistence.workspaceRepository.upsertWorkspaceMember({
      workspaceId: 'ws_rbac',
      accountId: 'writer-account',
      roleIds: ['role_writer'],
      joinedAt: new Date().toISOString()
    });
    await persistence.workspaceRepository.upsertWorkspaceFolderAcl({
      workspaceId: 'ws_rbac',
      scope: 'folder',
      folderId: null,
      roleIds: ['role_reader'],
      read: 'allow',
      write: 'inherit',
      updatedAt: new Date().toISOString()
    });
    await persistence.workspaceRepository.upsertWorkspaceFolderAcl({
      workspaceId: 'ws_rbac',
      scope: 'folder',
      folderId: null,
      roleIds: ['role_writer'],
      read: 'allow',
      write: 'inherit',
      updatedAt: new Date().toISOString()
    });
    await persistence.workspaceRepository.upsertWorkspaceFolderAcl({
      workspaceId: 'ws_rbac',
      folderId: null,
      roleIds: ['role_writer'],
      read: 'allow',
      write: 'allow',
      updatedAt: new Date().toISOString()
    });

    const rbacProject = await lockStore.createProject({
      workspaceId: 'ws_rbac',
      name: 'rbac-target'
    });

    const deniedRbacMutation = await lockAwareDispatcher.handle(
      'add_bone',
      {
        projectId: rbacProject.projectId,
        workspaceId: 'ws_rbac',
        name: 'root'
      } as ToolPayloadMap['add_bone'] & { workspaceId: string },
      {
        mcpSessionId: 'session-reader',
        mcpAccountId: 'reader-account',
        mcpWorkspaceId: 'ws_rbac'
      }
    );
    assert.equal(deniedRbacMutation.ok, false);
    if (!deniedRbacMutation.ok) {
      assert.equal(deniedRbacMutation.error.code, 'invalid_state');
      assert.equal(deniedRbacMutation.error.details?.reason, 'forbidden_workspace_folder_write');
    }

    const allowedRbacEnsure = await lockAwareDispatcher.handle(
      'ensure_project',
      {
        projectId: rbacProject.projectId,
        workspaceId: 'ws_rbac',
        name: rbacProject.name,
        onMissing: 'create'
      } as ToolPayloadMap['ensure_project'] & { workspaceId: string },
      {
        mcpSessionId: 'session-writer',
        mcpAccountId: 'writer-account',
        mcpWorkspaceId: 'ws_rbac'
      }
    );
    if (!allowedRbacEnsure.ok) {
      assert.fail(`RBAC writer ensure should pass: ${JSON.stringify(allowedRbacEnsure.error)}`);
    }

    const allowedRbacMutation = await lockAwareDispatcher.handle(
      'add_bone',
      {
        projectId: rbacProject.projectId,
        workspaceId: 'ws_rbac',
        name: 'root'
      } as ToolPayloadMap['add_bone'] & { workspaceId: string },
      {
        mcpSessionId: 'session-writer',
        mcpAccountId: 'writer-account',
        mcpWorkspaceId: 'ws_rbac'
      }
    );
    assert.equal(allowedRbacMutation.ok, true);

    await persistence.workspaceRepository.upsertWorkspace({
      workspaceId: 'ws_acl',
      tenantId: DEFAULT_TENANT,
      name: 'ACL Workspace',
      defaultMemberRoleId: 'role_user_acl',
      createdBy: 'system',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await persistence.workspaceRepository.upsertWorkspaceRole({
      workspaceId: 'ws_acl',
      roleId: 'role_workspace_admin_acl',
      name: 'Workspace Admin',
      builtin: 'workspace_admin',
      permissions: [
        'workspace.settings.manage',
        'workspace.members.manage',
        'workspace.roles.manage',
        'folder.read',
        'folder.write'
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await persistence.workspaceRepository.upsertWorkspaceRole({
      workspaceId: 'ws_acl',
      roleId: 'role_user_acl',
      name: 'User',
      builtin: null,
      permissions: ['folder.read', 'folder.write'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await persistence.workspaceRepository.upsertWorkspaceMember({
      workspaceId: 'ws_acl',
      accountId: 'workspace-admin-account',
      roleIds: ['role_workspace_admin_acl'],
      joinedAt: new Date().toISOString()
    });
    await persistence.workspaceRepository.upsertWorkspaceMember({
      workspaceId: 'ws_acl',
      accountId: 'user-account',
      roleIds: ['role_user_acl'],
      joinedAt: new Date().toISOString()
    });
    await persistence.workspaceRepository.upsertWorkspaceFolderAcl({
      workspaceId: 'ws_acl',
      scope: 'folder',
      folderId: null,
      roleIds: ['role_user_acl'],
      read: 'allow',
      write: 'inherit',
      updatedAt: new Date().toISOString()
    });
    const restrictedRoot = await lockStore.createFolder({ workspaceId: 'ws_acl', name: 'Restricted Root' });
    const restrictedChild = await lockStore.createFolder({
      workspaceId: 'ws_acl',
      name: 'Restricted Child',
      parentFolderId: restrictedRoot.folderId
    });
    const restoredChild = await lockStore.createFolder({
      workspaceId: 'ws_acl',
      name: 'Restored Child',
      parentFolderId: restrictedChild.folderId
    });
    await persistence.workspaceRepository.upsertWorkspaceFolderAcl({
      workspaceId: 'ws_acl',
      folderId: null,
      roleIds: ['role_user_acl'],
      read: 'allow',
      write: 'allow',
      updatedAt: new Date().toISOString()
    });
    await persistence.workspaceRepository.upsertWorkspaceFolderAcl({
      workspaceId: 'ws_acl',
      folderId: restrictedChild.folderId,
      roleIds: ['role_user_acl'],
      read: 'allow',
      write: 'deny',
      updatedAt: new Date().toISOString()
    });
    await persistence.workspaceRepository.upsertWorkspaceFolderAcl({
      workspaceId: 'ws_acl',
      folderId: restoredChild.folderId,
      roleIds: ['role_user_acl'],
      read: 'allow',
      write: 'allow',
      updatedAt: new Date().toISOString()
    });

    const blockedProject = await lockStore.createProject({
      workspaceId: 'ws_acl',
      name: 'acl-blocked',
      parentFolderId: restrictedChild.folderId
    });
    const blockedProjectForWorkspaceAdmin = await lockStore.createProject({
      workspaceId: 'ws_acl',
      name: 'acl-blocked-workspace-admin',
      parentFolderId: restrictedChild.folderId
    });
    const blockedProjectForCsAdmin = await lockStore.createProject({
      workspaceId: 'ws_acl',
      name: 'acl-blocked-cs-admin',
      parentFolderId: restrictedChild.folderId
    });
    const blockedProjectForSystemAdmin = await lockStore.createProject({
      workspaceId: 'ws_acl',
      name: 'acl-blocked-system-admin',
      parentFolderId: restrictedChild.folderId
    });
    const restoredProject = await lockStore.createProject({
      workspaceId: 'ws_acl',
      name: 'acl-restored',
      parentFolderId: restoredChild.folderId
    });
    const hiddenFolder = await lockStore.createFolder({
      workspaceId: 'ws_acl',
      name: 'Hidden Folder'
    });
    await persistence.workspaceRepository.upsertWorkspaceFolderAcl({
      workspaceId: 'ws_acl',
      folderId: hiddenFolder.folderId,
      roleIds: ['role_user_acl'],
      read: 'deny',
      write: 'deny',
      updatedAt: new Date().toISOString()
    });
    const hiddenProject = await lockStore.createProject({
      workspaceId: 'ws_acl',
      name: 'acl-hidden',
      parentFolderId: hiddenFolder.folderId
    });
    const visibleRootProject = await lockStore.createProject({
      workspaceId: 'ws_acl',
      name: 'acl-visible-root'
    });
    workspacePolicy.invalidateWorkspace('ws_acl');

    const aclUserTreePlan = await projectTreeCommand.listProjectTree(
      toRequest({
        'x-ashfox-account-id': 'user-account'
      }),
      { workspaceId: 'ws_acl' }
    );
    assert.equal(aclUserTreePlan.status, 200);
    const aclUserTreeBody = parseJsonPlanBody<{
      ok: boolean;
      projects: Array<{ projectId: string }>;
      tree: { roots: unknown[] };
    }>(aclUserTreePlan.body);
    assert.equal(aclUserTreeBody.ok, true);
    assert.equal(aclUserTreeBody.projects.some((project) => project.projectId === hiddenProject.projectId), false);
    assert.equal(aclUserTreeBody.projects.some((project) => project.projectId === visibleRootProject.projectId), true);
    const aclUserTreeJson = JSON.stringify(aclUserTreeBody.tree);
    assert.equal(aclUserTreeJson.includes(hiddenFolder.folderId), false);
    assert.equal(aclUserTreeJson.includes(hiddenProject.projectId), false);

    const aclUserListPlan = await projectTreeCommand.listProjects(
      toRequest({
        'x-ashfox-account-id': 'user-account'
      }),
      { workspaceId: 'ws_acl' }
    );
    assert.equal(aclUserListPlan.status, 200);
    const aclUserListBody = parseJsonPlanBody<{
      ok: boolean;
      projects: Array<{ projectId: string }>;
    }>(aclUserListPlan.body);
    assert.equal(aclUserListBody.ok, true);
    assert.equal(aclUserListBody.projects.some((project) => project.projectId === hiddenProject.projectId), false);
    assert.equal(aclUserListBody.projects.some((project) => project.projectId === visibleRootProject.projectId), true);

    const aclAdminTreePlan = await projectTreeCommand.listProjectTree(
      toRequest({
        'x-ashfox-account-id': 'workspace-admin-account'
      }),
      { workspaceId: 'ws_acl' }
    );
    assert.equal(aclAdminTreePlan.status, 200);
    const aclAdminTreeBody = parseJsonPlanBody<{
      ok: boolean;
      projects: Array<{ projectId: string }>;
    }>(aclAdminTreePlan.body);
    assert.equal(aclAdminTreeBody.ok, true);
    assert.equal(aclAdminTreeBody.projects.some((project) => project.projectId === hiddenProject.projectId), true);

    const userBlockedByFolderAcl = await lockAwareDispatcher.handle(
      'ensure_project',
      {
        projectId: blockedProject.projectId,
        workspaceId: 'ws_acl',
        name: blockedProject.name,
        onMissing: 'create'
      } as ToolPayloadMap['ensure_project'] & { workspaceId: string },
      {
        mcpSessionId: 'session-acl-user',
        mcpAccountId: 'user-account',
        mcpWorkspaceId: 'ws_acl'
      }
    );
    assert.equal(userBlockedByFolderAcl.ok, false);
    if (!userBlockedByFolderAcl.ok) {
      assert.equal(userBlockedByFolderAcl.error.details?.reason, 'forbidden_workspace_folder_write');
    }

    await persistence.workspaceRepository.upsertWorkspaceRole({
      workspaceId: 'ws_acl',
      roleId: 'role_allow_override_acl',
      name: 'Allow Override',
      builtin: null,
      permissions: ['folder.read', 'folder.write'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await persistence.workspaceRepository.upsertWorkspaceMember({
      workspaceId: 'ws_acl',
      accountId: 'user-account',
      roleIds: ['role_user_acl', 'role_allow_override_acl'],
      joinedAt: new Date().toISOString()
    });
    await persistence.workspaceRepository.upsertWorkspaceFolderAcl({
      workspaceId: 'ws_acl',
      folderId: restrictedChild.folderId,
      roleIds: ['role_allow_override_acl'],
      read: 'allow',
      write: 'allow',
      updatedAt: new Date().toISOString()
    });

    const lockAwareDispatcherAfterAclUnion = buildDispatcher(persistence, lockStore);
    const userAllowedByAclUnion = await lockAwareDispatcherAfterAclUnion.handle(
      'ensure_project',
      {
        projectId: blockedProject.projectId,
        workspaceId: 'ws_acl',
        name: blockedProject.name,
        onMissing: 'create'
      } as ToolPayloadMap['ensure_project'] & { workspaceId: string },
      {
        mcpSessionId: 'session-acl-user-union',
        mcpAccountId: 'user-account',
        mcpWorkspaceId: 'ws_acl'
      }
    );
    assert.equal(userAllowedByAclUnion.ok, true);

    const userRestoredByDeeperAllow = await lockAwareDispatcher.handle(
      'ensure_project',
      {
        projectId: restoredProject.projectId,
        workspaceId: 'ws_acl',
        name: restoredProject.name,
        onMissing: 'create'
      } as ToolPayloadMap['ensure_project'] & { workspaceId: string },
      {
        mcpSessionId: 'session-acl-user-restored',
        mcpAccountId: 'user-account',
        mcpWorkspaceId: 'ws_acl'
      }
    );
    assert.equal(userRestoredByDeeperAllow.ok, true);

    const workspaceAdminAllowed = await lockAwareDispatcher.handle(
      'ensure_project',
      {
        projectId: blockedProjectForWorkspaceAdmin.projectId,
        workspaceId: 'ws_acl',
        name: blockedProjectForWorkspaceAdmin.name,
        onMissing: 'create'
      } as ToolPayloadMap['ensure_project'] & { workspaceId: string },
      {
        mcpSessionId: 'session-acl-admin',
        mcpAccountId: 'workspace-admin-account',
        mcpWorkspaceId: 'ws_acl'
      }
    );
    assert.equal(workspaceAdminAllowed.ok, true);

    const csAdminAllowed = await lockAwareDispatcher.handle(
      'ensure_project',
      {
        projectId: blockedProjectForCsAdmin.projectId,
        workspaceId: 'ws_acl',
        name: blockedProjectForCsAdmin.name,
        onMissing: 'create'
      } as ToolPayloadMap['ensure_project'] & { workspaceId: string },
      {
        mcpSessionId: 'session-acl-cs',
        mcpAccountId: 'support-agent',
        mcpSystemRoles: ['cs_admin'],
        mcpWorkspaceId: 'ws_acl'
      }
    );
    assert.equal(csAdminAllowed.ok, true);

    const systemAdminAllowed = await lockAwareDispatcher.handle(
      'ensure_project',
      {
        projectId: blockedProjectForSystemAdmin.projectId,
        workspaceId: 'ws_acl',
        name: blockedProjectForSystemAdmin.name,
        onMissing: 'create'
      } as ToolPayloadMap['ensure_project'] & { workspaceId: string },
      {
        mcpSessionId: 'session-acl-system',
        mcpAccountId: 'root-admin',
        mcpSystemRoles: ['system_admin'],
        mcpWorkspaceId: 'ws_acl'
      }
    );
    assert.equal(systemAdminAllowed.ok, true);

    await persistence.workspaceRepository.upsertWorkspace({
      workspaceId: 'ws_user_template_acl',
      tenantId: DEFAULT_TENANT,
      name: 'User Template Workspace',
      defaultMemberRoleId: 'role_user_template',
      createdBy: 'system',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await persistence.workspaceRepository.upsertWorkspaceRole({
      workspaceId: 'ws_user_template_acl',
      roleId: 'role_user_template',
      name: 'User',
      builtin: null,
      permissions: ['folder.read', 'folder.write'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await persistence.workspaceRepository.upsertWorkspaceMember({
      workspaceId: 'ws_user_template_acl',
      accountId: 'regular-user',
      roleIds: ['role_user_template'],
      joinedAt: new Date().toISOString()
    });
    await persistence.workspaceRepository.upsertWorkspaceFolderAcl({
      workspaceId: 'ws_user_template_acl',
      scope: 'folder',
      folderId: null,
      roleIds: ['role_user_template'],
      read: 'allow',
      write: 'inherit',
      updatedAt: new Date().toISOString()
    });
    await persistence.workspaceRepository.upsertWorkspaceFolderAcl({
      workspaceId: 'ws_user_template_acl',
      folderId: null,
      roleIds: ['role_user_template'],
      read: 'allow',
      write: 'allow',
      updatedAt: new Date().toISOString()
    });
    const templateProject = await lockStore.createProject({
      workspaceId: 'ws_user_template_acl',
      name: 'template-project'
    });
    const userTemplateAllowed = await lockAwareDispatcher.handle(
      'ensure_project',
      {
        projectId: templateProject.projectId,
        workspaceId: 'ws_user_template_acl',
        name: templateProject.name,
        onMissing: 'create'
      } as ToolPayloadMap['ensure_project'] & { workspaceId: string },
      {
        mcpSessionId: 'session-all-open',
        mcpAccountId: 'regular-user',
        mcpWorkspaceId: 'ws_user_template_acl'
      }
    );
    assert.equal(userTemplateAllowed.ok, true);

    // TKT-20260214-001: native backend routing skeleton -> tool execution + persistence
    const health = await engine.getHealth();
    assert.equal(health.availability, 'ready');
    const reason = isRecord(health.details) ? health.details.reason : undefined;
    assert.notEqual(reason, 'engine_scaffold_only');

    const ensure001 = await callTool(dispatcher, 'ensure_project', {
      projectId: 'tkt-001',
      name: 'native-001',
      onMissing: 'create'
    } as ToolPayloadMap['ensure_project'] & { projectId: string });
    assert.equal(ensure001.ok, true);
    if (!ensure001.ok) return;
    assert.equal(ensure001.data.action, 'created');

    const state001 = await callTool(dispatcher, 'get_project_state', {
      projectId: 'tkt-001',
      detail: 'summary'
    } as ToolPayloadMap['get_project_state'] & { projectId: string });
    assert.equal(state001.ok, true);
    if (!state001.ok) return;
    assert.equal(state001.data.project.active, true);
    assert.equal(state001.data.project.name, 'native-001');

    const saved001 = await persistence.projectRepository.find({
      tenantId: DEFAULT_TENANT,
      projectId: 'tkt-001'
    });
    assert.ok(saved001);
    const saved001Session = extractSessionState(saved001?.state);
    assert.equal(saved001Session.name, 'native-001');

    // TKT-20260214-002: SessionState mutation e2e + invalid_payload/invalid_state failure paths
    const ensure002 = await callTool(dispatcher, 'ensure_project', {
      projectId: 'tkt-002',
      name: 'mutation-002',
      onMissing: 'create'
    } as ToolPayloadMap['ensure_project'] & { projectId: string });
    assert.equal(ensure002.ok, true);

    const addRoot = await callTool(dispatcher, 'add_bone', {
      projectId: 'tkt-002',
      name: 'root',
      pivot: [0, 0, 0]
    } as ToolPayloadMap['add_bone'] & { projectId: string });
    assert.equal(addRoot.ok, true);

    const addCube = await callTool(dispatcher, 'add_cube', {
      projectId: 'tkt-002',
      name: 'body',
      bone: 'root',
      from: [0, 0, 0],
      to: [4, 4, 4]
    } as ToolPayloadMap['add_cube'] & { projectId: string });
    assert.equal(addCube.ok, true);

    const addClip = await callTool(dispatcher, 'create_animation_clip', {
      projectId: 'tkt-002',
      name: 'idle',
      length: 1,
      loop: true,
      fps: 20
    } as ToolPayloadMap['create_animation_clip'] & { projectId: string });
    assert.equal(addClip.ok, true);

    const setPose = await callTool(dispatcher, 'set_frame_pose', {
      projectId: 'tkt-002',
      clip: 'idle',
      frame: 0,
      bones: [{ name: 'root', rot: [0, 10, 0] }]
    } as ToolPayloadMap['set_frame_pose'] & { projectId: string });
    assert.equal(setPose.ok, true);

    const record002 = await persistence.projectRepository.find({
      tenantId: DEFAULT_TENANT,
      projectId: 'tkt-002'
    });
    assert.ok(record002);
    if (!record002) return;
    await persistence.projectRepository.save({
      ...record002,
      state: injectTextureIntoRecord(record002.state, {
        id: 'atlas-id',
        name: 'atlas',
        width: 64,
        height: 64
      }),
      updatedAt: new Date().toISOString()
    });

    const assignTexture = await callTool(dispatcher, 'assign_texture', {
      projectId: 'tkt-002',
      textureName: 'atlas',
      cubeNames: ['body'],
      faces: ['north', 'south']
    } as ToolPayloadMap['assign_texture'] & { projectId: string });
    assert.equal(assignTexture.ok, true);

    const state002 = await callTool(dispatcher, 'get_project_state', {
      projectId: 'tkt-002',
      detail: 'full',
      includeUsage: true
    } as ToolPayloadMap['get_project_state'] & { projectId: string });
    assert.equal(state002.ok, true);
    if (!state002.ok) return;
    assert.equal(state002.data.project.counts.bones >= 1, true);
    assert.equal(state002.data.project.counts.cubes >= 1, true);
    assert.equal(state002.data.project.counts.animations >= 1, true);
    const usage = state002.data.project.textureUsage;
    assert.ok(usage);
    const atlasUsage = usage?.textures.find((entry) => entry.name === 'atlas');
    assert.ok(atlasUsage);
    const bodyUsage = atlasUsage?.cubes.find((cube) => cube.name === 'body');
    assert.ok(bodyUsage);
    const northFace = bodyUsage?.faces.find((face) => face.face === 'north');
    assert.ok(northFace);

    // TKT-20260217-004: read_texture saveToTmp should work in native profile.
    const ensure004 = await callTool(dispatcher, 'ensure_project', {
      projectId: 'tkt-004',
      name: 'texture-read-004',
      onMissing: 'create'
    } as ToolPayloadMap['ensure_project'] & { projectId: string });
    assert.equal(ensure004.ok, true);

    const record004 = await persistence.projectRepository.find({
      tenantId: DEFAULT_TENANT,
      projectId: 'tkt-004'
    });
    assert.ok(record004);
    if (!record004) return;
    const stateWithTexture004 = injectTextureIntoRecord(record004.state, {
      id: 'atlas-read-id',
      name: 'atlas-read',
      width: 1,
      height: 1
    });
    const stateWithAssets004 = injectTextureAssetIntoRecord(stateWithTexture004, {
      id: 'atlas-read-id',
      name: 'atlas-read',
      dataUri: PNG_1X1_TRANSPARENT,
      width: 1,
      height: 1
    });
    await persistence.projectRepository.save({
      ...record004,
      state: stateWithAssets004,
      updatedAt: new Date().toISOString()
    });

    const readTextureTmp = await callTool(dispatcher, 'read_texture', {
      projectId: 'tkt-004',
      name: 'atlas-read',
      saveToTmp: true,
      tmpPrefix: 'native',
      tmpName: 'atlas-read'
    } as ToolPayloadMap['read_texture'] & { projectId: string });
    assert.equal(readTextureTmp.ok, true);
    if (readTextureTmp.ok) {
      assert.equal(readTextureTmp.data.texture.name, 'atlas-read');
      assert.equal(readTextureTmp.data.texture.mimeType, 'image/png');
      const savedPath = readTextureTmp.data.saved?.texture?.path;
      assert.equal(typeof savedPath, 'string');
      if (typeof savedPath === 'string') {
        assert.equal(fs.existsSync(savedPath), true);
        fs.unlinkSync(savedPath);
      }
    }

    const invalidState = await callTool(dispatcher, 'add_bone', {
      projectId: 'tkt-002-empty',
      name: 'orphan'
    } as ToolPayloadMap['add_bone'] & { projectId: string });
    assert.equal(invalidState.ok, false);
    if (!invalidState.ok) {
      assert.equal(invalidState.error.code, 'invalid_state');
    }

    const invalidPayload = await callTool(dispatcher, 'add_cube', {
      projectId: 'tkt-002'
    } as ToolPayloadMap['add_cube'] & { projectId: string });
    assert.equal(invalidPayload.ok, false);
    if (!invalidPayload.ok) {
      assert.equal(invalidPayload.error.code, 'invalid_payload');
    }

    // TKT-20260217-005: worker should execute real backend tool path (no payload-echo placeholder).
    const workerLogger = createNoopLogger();

    const ensureWorkerProject = await callTool(dispatcher, 'ensure_project', {
      projectId: 'worker-job-1',
      name: 'worker-job-1',
      onMissing: 'create'
    } as ToolPayloadMap['ensure_project'] & { projectId: string });
    assert.equal(ensureWorkerProject.ok, true);

    const addWorkerRoot = await callTool(dispatcher, 'add_bone', {
      projectId: 'worker-job-1',
      name: 'root',
      pivot: [0, 0, 0]
    } as ToolPayloadMap['add_bone'] & { projectId: string });
    assert.equal(addWorkerRoot.ok, true);

    const addWorkerCube = await callTool(dispatcher, 'add_cube', {
      projectId: 'worker-job-1',
      name: 'body',
      bone: 'root',
      from: [0, 0, 0],
      to: [2, 2, 2]
    } as ToolPayloadMap['add_cube'] & { projectId: string });
    assert.equal(addWorkerCube.ok, true);

    let gltfResult: NativeJobResult | undefined;
    await processOneNativeJob({
      workerId: 'worker-native-e2e',
      logger: workerLogger,
      enabled: true,
      backend: engine,
      store: {
        claimNextJob: async () => ({
          id: 'job-native-1',
          projectId: 'worker-job-1',
          kind: 'gltf.convert',
          payload: { codecId: 'gltf', optimize: true },
          status: 'running',
          attemptCount: 1,
          maxAttempts: 3,
          leaseMs: 30000,
          createdAt: new Date().toISOString()
        }),
        completeJob: async (_jobId: string, result?: NativeJobResult) => {
          gltfResult = result;
          return null;
        },
        failJob: async (_jobId: string, message: string) => {
          throw new Error(`unexpected gltf failure: ${message}`);
        }
      }
    });
    assert.equal(gltfResult?.kind, 'gltf.convert');
    assert.equal(gltfResult?.status, 'converted');
    assert.equal(typeof gltfResult?.output?.exportPath, 'string');

    let codecFailureMessage = '';
    await processOneNativeJob({
      workerId: 'worker-native-e2e',
      logger: workerLogger,
      enabled: true,
      backend: engine,
      store: {
        claimNextJob: async () => ({
          id: 'job-native-codec-fail',
          projectId: 'worker-job-1',
          kind: 'gltf.convert',
          payload: { codecId: 'unknown-codec' },
          status: 'running',
          attemptCount: 1,
          maxAttempts: 3,
          leaseMs: 30000,
          createdAt: new Date().toISOString()
        }),
        completeJob: async () => {
          throw new Error('unknown codec should fail');
        },
        failJob: async (_jobId: string, message: string) => {
          codecFailureMessage = message;
          return null;
        }
      }
    });
    assert.equal(codecFailureMessage.includes('export failed (unsupported_format)'), true);

    let preflightResult: NativeJobResult | undefined;
    await processOneNativeJob({
      workerId: 'worker-native-e2e',
      logger: workerLogger,
      enabled: true,
      backend: engine,
      store: {
        claimNextJob: async () => ({
          id: 'job-native-2',
          projectId: 'worker-job-1',
          kind: 'texture.preflight',
          payload: {
            textureIds: ['missing-texture'],
            maxDimension: 16,
            allowNonPowerOfTwo: false
          },
          status: 'running',
          attemptCount: 1,
          maxAttempts: 3,
          leaseMs: 30000,
          createdAt: new Date().toISOString()
        }),
        completeJob: async (_jobId: string, result?: NativeJobResult) => {
          preflightResult = result;
          return null;
        },
        failJob: async (_jobId: string, message: string) => {
          throw new Error(`unexpected preflight failure: ${message}`);
        }
      }
    });
    assert.equal(preflightResult?.kind, 'texture.preflight');
    assert.equal(preflightResult?.status, 'failed');
    assert.equal(preflightResult?.summary?.checked, 0);
    assert.equal(Array.isArray(preflightResult?.diagnostics), true);
    if (Array.isArray(preflightResult?.diagnostics)) {
      assert.equal(preflightResult.diagnostics.some((entry) => entry.includes('missing texture id(s): missing-texture')), true);
    }

    let unconfiguredFailMessage = '';
    await processOneNativeJob({
      workerId: 'worker-native-e2e',
      logger: workerLogger,
      enabled: true,
      store: {
        claimNextJob: async () => ({
          id: 'job-native-3',
          projectId: 'worker-job-1',
          kind: 'gltf.convert',
          status: 'running',
          attemptCount: 1,
          maxAttempts: 3,
          leaseMs: 30000,
          createdAt: new Date().toISOString()
        }),
        completeJob: async () => {
          throw new Error('completeJob must not run without backend');
        },
        failJob: async (_jobId: string, message: string) => {
          unconfiguredFailMessage = message;
          return null;
        }
      }
    });
    assert.equal(unconfiguredFailMessage, 'Engine backend is required for native job execution.');

    // TKT-20260214-003: export e2e + oracle gate + render_preview unsupported
    const fx006Dir = path.join(oracleFixturesRoot, 'FX-006');
    const fx006State = readJson<SessionState>(path.join(fx006Dir, 'state.json'));
    const fx006ExpectedResult = readJson<ToolResultMap['export']>(path.join(fx006Dir, 'expected', 'result.json'));
    const fx006ExpectedGeo = readJson<unknown>(path.join(fx006Dir, 'expected', 'fx006.geo.json'));
    const fx006ExpectedAnim = readJson<unknown>(path.join(fx006Dir, 'expected', 'fx006.animation.json'));
    const fx006PreviewErr = readJson<{ code: string; message: string }>(
      path.join(fx006Dir, 'expected', 'preview_error.json')
    );

    await persistence.projectRepository.save({
      scope: { tenantId: DEFAULT_TENANT, projectId: 'fx006' },
      revision: 'seed-fx006',
      state: fx006State,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const exportFx006 = await callTool(dispatcher, 'export', {
      projectId: 'fx006',
      format: 'gecko_geo_anim',
      destPath: 'fx006.json',
      options: { includeDiagnostics: true }
    } as ToolPayloadMap['export'] & { projectId: string });
    assert.equal(exportFx006.ok, true);
    if (!exportFx006.ok) return;
    assert.equal(
      exportFx006.data.path === fx006ExpectedResult.path || exportFx006.data.path === 'fx006.json',
      true
    );
    assert.deepEqual(exportFx006.data.selectedTarget, fx006ExpectedResult.selectedTarget);
    assert.equal(exportFx006.data.stage === fx006ExpectedResult.stage || exportFx006.data.stage === 'done', true);
    if (exportFx006.data.stage === fx006ExpectedResult.stage) {
      assert.deepEqual(exportFx006.data.warnings, fx006ExpectedResult.warnings);
    }
    assert.equal(typeof exportFx006.data.revision, 'string');

    const fx006GeoActual = await persistence.blobStore.readUtf8(toExportPointer('fx006', 'fx006.geo.json'));
    const fx006AnimActual = await persistence.blobStore.readUtf8(toExportPointer('fx006', 'fx006.animation.json'));
    assert.ok(fx006GeoActual);
    assert.ok(fx006AnimActual);
    assert.deepEqual(JSON.parse(fx006GeoActual ?? '{}'), fx006ExpectedGeo);
    assert.deepEqual(JSON.parse(fx006AnimActual ?? '{}'), fx006ExpectedAnim);

    const exportFx006Again = await callTool(dispatcher, 'export', {
      projectId: 'fx006',
      format: 'gecko_geo_anim',
      destPath: 'fx006.json',
      options: { includeDiagnostics: true }
    } as ToolPayloadMap['export'] & { projectId: string });
    assert.equal(exportFx006Again.ok, true);
    if (exportFx006Again.ok) {
      assert.deepEqual(exportFx006Again.data, exportFx006.data);
    }

    const capabilitiesFx006 = await callTool(
      dispatcher,
      'list_capabilities',
      {} as ToolPayloadMap['list_capabilities'] & { projectId?: string }
    );
    assert.equal(capabilitiesFx006.ok, true);
    if (capabilitiesFx006.ok) {
      const toolAvailability = capabilitiesFx006.data.toolAvailability ?? {};
      assert.equal(toolAvailability.export?.available, true);
      assert.equal(toolAvailability.render_preview?.available, false);
      assert.equal(toolAvailability.reload_plugins?.available, false);
      assert.equal(toolAvailability.export_trace_log?.available, false);
      assert.equal(toolAvailability.paint_faces?.available, false);
    }

    const previewFx006 = await callTool(dispatcher, 'render_preview', {
      projectId: 'fx006',
      mode: 'fixed'
    } as ToolPayloadMap['render_preview'] & { projectId: string });
    assert.equal(previewFx006.ok, false);
    if (!previewFx006.ok) {
      assert.equal(previewFx006.error.code, fx006PreviewErr.code);
      assert.equal(previewFx006.error.message.includes(fx006PreviewErr.message), true);
      assert.equal(previewFx006.error.message.includes('disabled in native production profile'), false);
    }

    const reloadPluginsFx006 = await callTool(dispatcher, 'reload_plugins', {
      projectId: 'fx006',
      confirm: true
    } as ToolPayloadMap['reload_plugins'] & { projectId: string });
    assert.equal(reloadPluginsFx006.ok, false);
    if (!reloadPluginsFx006.ok) {
      assert.equal(reloadPluginsFx006.error.code, 'invalid_state');
      assert.equal(reloadPluginsFx006.error.message.includes('Plugin reload is not available in this host.'), true);
      assert.equal(reloadPluginsFx006.error.message.includes('disabled in native production profile'), false);
    }

    const traceLogFx006 = await callTool(dispatcher, 'export_trace_log', {
      projectId: 'fx006',
      destPath: 'trace.ndjson'
    } as ToolPayloadMap['export_trace_log'] & { projectId: string });
    assert.equal(traceLogFx006.ok, false);
    if (!traceLogFx006.ok) {
      assert.equal(traceLogFx006.error.code, 'invalid_state');
      assert.equal(traceLogFx006.error.message.includes('Trace log export is unavailable.'), true);
      assert.equal(traceLogFx006.error.message.includes('disabled in native production profile'), false);
    }

    const paintFacesFx006 = await callTool(dispatcher, 'paint_faces', {
      projectId: 'fx006'
    } as ToolPayloadMap['paint_faces'] & { projectId: string });
    assert.equal(paintFacesFx006.ok, false);
    if (!paintFacesFx006.ok) {
      assert.equal(paintFacesFx006.error.code, 'invalid_state');
      assert.equal(paintFacesFx006.error.message.includes('disabled in native production profile'), false);
    }

    const fx007Dir = path.join(oracleFixturesRoot, 'FX-007');
    const fx007State = readJson<SessionState>(path.join(fx007Dir, 'state.json'));
    const fx007ExpectedResult = readJson<ToolResultMap['export']>(path.join(fx007Dir, 'expected', 'result.json'));
    const fx007ExpectedGltf = readJson<unknown>(path.join(fx007Dir, 'expected', 'fx007.gltf'));
    const fx007ExpectedSha = readJson<Record<string, string>>(
      path.join(fx007Dir, 'expected', 'expected.gltf.sha256.json')
    );

    await persistence.projectRepository.save({
      scope: { tenantId: DEFAULT_TENANT, projectId: 'fx007' },
      revision: 'seed-fx007',
      state: fx007State,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const exportFx007 = await callTool(dispatcher, 'export', {
      projectId: 'fx007',
      format: 'gltf',
      destPath: 'fx007.gltf'
    } as ToolPayloadMap['export'] & { projectId: string });
    assert.equal(exportFx007.ok, true);
    if (!exportFx007.ok) return;
    assert.equal(exportFx007.data.path, fx007ExpectedResult.path);
    assert.deepEqual(exportFx007.data.selectedTarget, fx007ExpectedResult.selectedTarget);
    assert.equal(exportFx007.data.stage, fx007ExpectedResult.stage);
    assert.deepEqual(exportFx007.data.warnings, fx007ExpectedResult.warnings);
    assert.equal(typeof exportFx007.data.revision, 'string');

    const fx007GltfRaw = await persistence.blobStore.readUtf8(toExportPointer('fx007', 'fx007.gltf'));
    assert.ok(fx007GltfRaw);
    const fx007GltfActual = JSON.parse(fx007GltfRaw ?? '{}') as Record<string, unknown>;
    assert.deepEqual(sanitizeGltfUris(fx007GltfActual), sanitizeGltfUris(fx007ExpectedGltf));

    const bufferUri = ((fx007GltfActual.buffers as Array<Record<string, unknown>> | undefined) ?? [])[0]?.uri;
    assert.equal(typeof bufferUri, 'string');
    const bufferSha = sha256Bytes(decodeDataUriBytes(bufferUri as string));
    assert.equal(bufferSha, fx007ExpectedSha.buffer0_sha256);

    const images = (fx007GltfActual.images as Array<Record<string, unknown>> | undefined) ?? [];
    images.forEach((image, index) => {
      const uri = image.uri;
      assert.equal(typeof uri, 'string');
      const key = `image${index}_sha256`;
      assert.equal(sha256Bytes(decodeDataUriBytes(uri as string)), fx007ExpectedSha[key]);
    });

    const exportFx007Again = await callTool(dispatcher, 'export', {
      projectId: 'fx007',
      format: 'gltf',
      destPath: 'fx007.gltf'
    } as ToolPayloadMap['export'] & { projectId: string });
    assert.equal(exportFx007Again.ok, true);
    if (exportFx007Again.ok) {
      assert.deepEqual(exportFx007Again.data, exportFx007.data);
    }

    const exportFx007NativeCodec = await callTool(dispatcher, 'export', {
      projectId: 'fx007',
      format: 'native_codec',
      codecId: 'gltf',
      destPath: 'fx007-native.gltf'
    } as ToolPayloadMap['export'] & { projectId: string });
    assert.equal(exportFx007NativeCodec.ok, true);
    if (exportFx007NativeCodec.ok) {
      assert.equal(exportFx007NativeCodec.data.stage, 'done');
      assert.equal(exportFx007NativeCodec.data.selectedTarget?.kind, 'native_codec');
      assert.equal(exportFx007NativeCodec.data.selectedTarget?.id, 'gltf');
      const nativeCodecRaw = await persistence.blobStore.readUtf8(toExportPointer('fx007', 'fx007-native.gltf'));
      assert.ok(nativeCodecRaw);
      const nativeCodecJson = JSON.parse(nativeCodecRaw ?? '{}') as Record<string, unknown>;
      assert.equal(isRecord(nativeCodecJson.asset), true);
      assert.equal((nativeCodecJson.asset as { version?: string }).version, '2.0');
    }

    const exportFx007UnknownCodec = await callTool(dispatcher, 'export', {
      projectId: 'fx007',
      format: 'native_codec',
      codecId: 'unknown-codec',
      destPath: 'fx007-unknown.gltf'
    } as ToolPayloadMap['export'] & { projectId: string });
    assert.equal(exportFx007UnknownCodec.ok, false);
    if (!exportFx007UnknownCodec.ok) {
      assert.equal(exportFx007UnknownCodec.error.code, 'unsupported_format');
      assert.equal(exportFx007UnknownCodec.error.message.includes('Native codec'), true);
    }
  })()
);
