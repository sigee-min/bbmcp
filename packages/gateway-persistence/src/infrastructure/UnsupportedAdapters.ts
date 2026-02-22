import type {
  AccountRecord,
  BlobPointer,
  BlobReadResult,
  BlobStore,
  BlobWriteInput,
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

const buildAdapterError = (domain: 'database' | 'storage', provider: string, reason: string): Error =>
  new Error(`${domain} provider "${provider}" is unavailable: ${reason}`);

export class UnsupportedProjectRepository implements ProjectRepository {
  private readonly error: Error;

  constructor(provider: string, reason: string) {
    this.error = buildAdapterError('database', provider, reason);
  }

  async find(_scope: ProjectRepositoryScope): Promise<null> {
    throw this.error;
  }

  async listByScopePrefix(_scope: ProjectRepositoryScope): Promise<PersistedProjectRecord[]> {
    throw this.error;
  }

  async save(): Promise<void> {
    throw this.error;
  }

  async remove(_scope: ProjectRepositoryScope): Promise<void> {
    throw this.error;
  }
}

export class UnsupportedBlobStore implements BlobStore {
  private readonly error: Error;

  constructor(provider: string, reason: string) {
    this.error = buildAdapterError('storage', provider, reason);
  }

  async put(_input: BlobWriteInput): Promise<BlobPointer> {
    throw this.error;
  }

  async get(_pointer: BlobPointer): Promise<BlobReadResult | null> {
    throw this.error;
  }

  async delete(_pointer: BlobPointer): Promise<void> {
    throw this.error;
  }
}

export class UnsupportedWorkspaceRepository implements WorkspaceRepository {
  private readonly error: Error;

  constructor(provider: string, reason: string) {
    this.error = buildAdapterError('database', provider, reason);
  }

  async getAccount(_accountId: string): Promise<AccountRecord | null> {
    throw this.error;
  }

  async getAccountByLocalLoginId(_localLoginId: string): Promise<AccountRecord | null> {
    throw this.error;
  }

  async getAccountByGithubUserId(_githubUserId: string): Promise<AccountRecord | null> {
    throw this.error;
  }

  async countAccountsBySystemRole(_role: 'system_admin' | 'cs_admin'): Promise<number> {
    throw this.error;
  }

  async listAccounts(_input?: {
    query?: string;
    limit?: number;
    excludeAccountIds?: readonly string[];
  }): Promise<AccountRecord[]> {
    throw this.error;
  }

  async searchServiceUsers(_input?: ServiceUsersSearchInput): Promise<ServiceUsersSearchResult> {
    throw this.error;
  }

  async searchServiceWorkspaces(_input?: ServiceWorkspacesSearchInput): Promise<ServiceWorkspacesSearchResult> {
    throw this.error;
  }

  async upsertAccount(_record: AccountRecord): Promise<void> {
    throw this.error;
  }

  async updateAccountSystemRoles(
    _accountId: string,
    _systemRoles: Array<'system_admin' | 'cs_admin'>,
    _updatedAt: string
  ): Promise<AccountRecord | null> {
    throw this.error;
  }

  async listAccountWorkspaces(_accountId: string): Promise<WorkspaceRecord[]> {
    throw this.error;
  }

  async listAllWorkspaces(): Promise<WorkspaceRecord[]> {
    throw this.error;
  }

  async getWorkspace(_workspaceId: string): Promise<WorkspaceRecord | null> {
    throw this.error;
  }

  async upsertWorkspace(_record: WorkspaceRecord): Promise<void> {
    throw this.error;
  }

  async removeWorkspace(_workspaceId: string): Promise<void> {
    throw this.error;
  }

  async listWorkspaceRoles(_workspaceId: string): Promise<WorkspaceRoleStorageRecord[]> {
    throw this.error;
  }

  async upsertWorkspaceRole(_record: WorkspaceRoleStorageRecord): Promise<void> {
    throw this.error;
  }

  async removeWorkspaceRole(_workspaceId: string, _roleId: string): Promise<void> {
    throw this.error;
  }

  async listWorkspaceMembers(_workspaceId: string): Promise<WorkspaceMemberRecord[]> {
    throw this.error;
  }

  async upsertWorkspaceMember(_record: WorkspaceMemberRecord): Promise<void> {
    throw this.error;
  }

  async removeWorkspaceMember(_workspaceId: string, _accountId: string): Promise<void> {
    throw this.error;
  }

  async listWorkspaceFolderAcl(_workspaceId: string): Promise<WorkspaceFolderAclRecord[]> {
    throw this.error;
  }

  async upsertWorkspaceFolderAcl(_record: WorkspaceFolderAclRecord): Promise<void> {
    throw this.error;
  }

  async removeWorkspaceFolderAcl(_workspaceId: string, _folderId: string | null, _roleId: string): Promise<void> {
    throw this.error;
  }

  async listWorkspaceApiKeys(_workspaceId: string): Promise<WorkspaceApiKeyRecord[]> {
    throw this.error;
  }

  async findWorkspaceApiKeyByHash(_keyHash: string): Promise<WorkspaceApiKeyRecord | null> {
    throw this.error;
  }

  async createWorkspaceApiKey(_record: WorkspaceApiKeyRecord): Promise<void> {
    throw this.error;
  }

  async revokeWorkspaceApiKey(_workspaceId: string, _keyId: string, _revokedAt: string): Promise<void> {
    throw this.error;
  }

  async updateWorkspaceApiKeyLastUsed(_workspaceId: string, _keyId: string, _lastUsedAt: string): Promise<void> {
    throw this.error;
  }

  async listServiceApiKeys(_accountId: string): Promise<ServiceApiKeyRecord[]> {
    throw this.error;
  }

  async findServiceApiKeyByHash(_keyHash: string): Promise<ServiceApiKeyRecord | null> {
    throw this.error;
  }

  async createServiceApiKey(_record: ServiceApiKeyRecord): Promise<void> {
    throw this.error;
  }

  async revokeServiceApiKey(_accountId: string, _keyId: string, _revokedAt: string): Promise<void> {
    throw this.error;
  }

  async updateServiceApiKeyLastUsed(_accountId: string, _keyId: string, _lastUsedAt: string): Promise<void> {
    throw this.error;
  }

  async getServiceSettings(): Promise<ServiceSettingsRecord | null> {
    throw this.error;
  }

  async upsertServiceSettings(_record: ServiceSettingsRecord): Promise<void> {
    throw this.error;
  }
}
