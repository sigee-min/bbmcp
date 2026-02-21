import type { SystemRole, WorkspaceAclEffect, WorkspaceAclScope, WorkspaceBuiltinRole } from './types';

export type DatabaseProvider = 'sqlite' | 'postgres' | 'ashfox' | 'appwrite';

export type StorageProvider = 'db' | 's3' | 'ashfox' | 'appwrite';

export type PersistencePreset = 'local' | 'selfhost' | 'ashfox' | 'appwrite';

export interface PersistenceSelection {
  preset: PersistencePreset;
  databaseProvider: DatabaseProvider;
  storageProvider: StorageProvider;
}

export interface ProjectRepositoryScope {
  tenantId: string;
  projectId: string;
}

export interface WorkspaceRecord {
  workspaceId: string;
  tenantId: string;
  name: string;
  defaultMemberRoleId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountRecord {
  accountId: string;
  email: string;
  displayName: string;
  systemRoles: SystemRole[];
  localLoginId?: string | null;
  passwordHash?: string | null;
  githubUserId?: string | null;
  githubLogin?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceSmtpSettingsRecord {
  enabled: boolean;
  host: string | null;
  port: number | null;
  secure: boolean;
  username: string | null;
  passwordEncrypted: string | null;
  fromEmail: string | null;
  fromName: string | null;
  updatedBy: string;
  updatedAt: string;
}

export interface ServiceGithubAuthSettingsRecord {
  enabled: boolean;
  clientId: string | null;
  clientSecretEncrypted: string | null;
  callbackUrl: string | null;
  scopes: string;
  updatedBy: string;
  updatedAt: string;
}

export interface ServiceSettingsRecord {
  smtp: ServiceSmtpSettingsRecord;
  githubAuth: ServiceGithubAuthSettingsRecord;
  createdAt: string;
  updatedAt: string;
}

export interface AccountCandidateQuery {
  query?: string;
  limit?: number;
  excludeAccountIds?: readonly string[];
}

export type ServiceSearchMatchMode = 'exact' | 'prefix' | 'contains';
export type ServiceUsersSearchField = 'any' | 'accountId' | 'displayName' | 'email' | 'localLoginId' | 'githubLogin';
export type ServiceWorkspacesSearchField = 'any' | 'workspaceId' | 'name' | 'createdBy' | 'memberAccountId';

export interface ServiceUsersSearchInput {
  q?: string;
  field?: ServiceUsersSearchField;
  match?: ServiceSearchMatchMode;
  workspaceId?: string;
  limit?: number;
  cursor?: string | null;
}

export interface ServiceWorkspacesSearchInput {
  q?: string;
  field?: ServiceWorkspacesSearchField;
  match?: ServiceSearchMatchMode;
  memberAccountId?: string;
  limit?: number;
  cursor?: string | null;
}

export interface ServiceUsersSearchResult {
  users: AccountRecord[];
  total: number;
  nextCursor: string | null;
}

export interface ServiceWorkspacesSearchResult {
  workspaces: WorkspaceRecord[];
  total: number;
  nextCursor: string | null;
}

export interface WorkspaceMemberRecord {
  workspaceId: string;
  accountId: string;
  roleIds: string[];
  joinedAt: string;
}

export interface WorkspaceRoleStorageRecord {
  workspaceId: string;
  roleId: string;
  name: string;
  builtin: WorkspaceBuiltinRole | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceAclRuleRecord {
  workspaceId: string;
  ruleId: string;
  scope?: WorkspaceAclScope;
  folderId: string | null;
  roleIds: string[];
  read: WorkspaceAclEffect;
  write: WorkspaceAclEffect;
  locked?: boolean;
  updatedAt: string;
}

export type WorkspaceFolderAclRecord = WorkspaceAclRuleRecord;

export interface WorkspaceApiKeyRecord {
  workspaceId: string;
  keyId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface PersistedProjectRecord {
  scope: ProjectRepositoryScope;
  revision: string;
  state: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRepository {
  find(scope: ProjectRepositoryScope): Promise<PersistedProjectRecord | null>;
  listByScopePrefix(scope: ProjectRepositoryScope): Promise<PersistedProjectRecord[]>;
  save(record: PersistedProjectRecord): Promise<void>;
  remove(scope: ProjectRepositoryScope): Promise<void>;
}

export interface WorkspaceRepository {
  getAccount(accountId: string): Promise<AccountRecord | null>;
  getAccountByLocalLoginId(localLoginId: string): Promise<AccountRecord | null>;
  getAccountByGithubUserId(githubUserId: string): Promise<AccountRecord | null>;
  countAccountsBySystemRole(role: SystemRole): Promise<number>;
  listAccounts(input?: AccountCandidateQuery): Promise<AccountRecord[]>;
  searchServiceUsers(input?: ServiceUsersSearchInput): Promise<ServiceUsersSearchResult>;
  searchServiceWorkspaces(input?: ServiceWorkspacesSearchInput): Promise<ServiceWorkspacesSearchResult>;
  upsertAccount(record: AccountRecord): Promise<void>;
  updateAccountSystemRoles(accountId: string, systemRoles: SystemRole[], updatedAt: string): Promise<AccountRecord | null>;
  listAccountWorkspaces(accountId: string): Promise<WorkspaceRecord[]>;
  listAllWorkspaces(): Promise<WorkspaceRecord[]>;
  getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null>;
  upsertWorkspace(record: WorkspaceRecord): Promise<void>;
  removeWorkspace(workspaceId: string): Promise<void>;
  listWorkspaceRoles(workspaceId: string): Promise<WorkspaceRoleStorageRecord[]>;
  upsertWorkspaceRole(record: WorkspaceRoleStorageRecord): Promise<void>;
  removeWorkspaceRole(workspaceId: string, roleId: string): Promise<void>;
  listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberRecord[]>;
  upsertWorkspaceMember(record: WorkspaceMemberRecord): Promise<void>;
  removeWorkspaceMember(workspaceId: string, accountId: string): Promise<void>;
  listWorkspaceFolderAcl(workspaceId: string): Promise<WorkspaceFolderAclRecord[]>;
  upsertWorkspaceFolderAcl(record: WorkspaceFolderAclRecord): Promise<void>;
  removeWorkspaceFolderAcl(workspaceId: string, folderId: string | null, roleId: string): Promise<void>;
  listWorkspaceApiKeys(workspaceId: string): Promise<WorkspaceApiKeyRecord[]>;
  findWorkspaceApiKeyByHash(keyHash: string): Promise<WorkspaceApiKeyRecord | null>;
  createWorkspaceApiKey(record: WorkspaceApiKeyRecord): Promise<void>;
  revokeWorkspaceApiKey(workspaceId: string, keyId: string, revokedAt: string): Promise<void>;
  updateWorkspaceApiKeyLastUsed(workspaceId: string, keyId: string, lastUsedAt: string): Promise<void>;
  getServiceSettings(): Promise<ServiceSettingsRecord | null>;
  upsertServiceSettings(record: ServiceSettingsRecord): Promise<void>;
}

export interface ProjectRepositoryWithRevisionGuard {
  saveIfRevision(record: PersistedProjectRecord, expectedRevision: string | null): Promise<boolean>;
}

export interface BlobPointer {
  bucket: string;
  key: string;
}

export interface BlobWriteInput extends BlobPointer {
  bytes: Uint8Array;
  contentType: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export interface BlobReadResult extends BlobPointer {
  bytes: Uint8Array;
  contentType: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
  updatedAt?: string;
}

export interface BlobStore {
  put(input: BlobWriteInput): Promise<BlobPointer>;
  get(pointer: BlobPointer): Promise<BlobReadResult | null>;
  delete(pointer: BlobPointer): Promise<void>;
}

export interface ProviderReadiness {
  provider: string;
  ready: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface PersistenceHealth {
  selection: PersistenceSelection;
  database: ProviderReadiness;
  storage: ProviderReadiness;
}

export interface PersistencePorts {
  projectRepository: ProjectRepository;
  workspaceRepository: WorkspaceRepository;
  blobStore: BlobStore;
  health: PersistenceHealth;
}
