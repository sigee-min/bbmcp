import type { SystemRole, WorkspaceAclEffect, WorkspaceBuiltinRole, WorkspaceMode, WorkspacePermission } from './types';

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
  mode: WorkspaceMode;
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
  permissions: WorkspacePermission[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceFolderAclRecord {
  workspaceId: string;
  folderId: string | null;
  roleId: string;
  read: WorkspaceAclEffect;
  write: WorkspaceAclEffect;
  updatedAt: string;
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
  save(record: PersistedProjectRecord): Promise<void>;
  remove(scope: ProjectRepositoryScope): Promise<void>;
}

export interface WorkspaceRepository {
  getAccount(accountId: string): Promise<AccountRecord | null>;
  getAccountByLocalLoginId(localLoginId: string): Promise<AccountRecord | null>;
  getAccountByGithubUserId(githubUserId: string): Promise<AccountRecord | null>;
  upsertAccount(record: AccountRecord): Promise<void>;
  listWorkspaces(accountId: string): Promise<WorkspaceRecord[]>;
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
