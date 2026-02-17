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
  blobStore: BlobStore;
  health: PersistenceHealth;
}
