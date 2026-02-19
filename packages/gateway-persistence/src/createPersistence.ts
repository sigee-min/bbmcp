import type { BlobStore, PersistencePorts, ProjectRepository, ProviderReadiness, WorkspaceRepository } from '@ashfox/backend-core';
import {
  resolveAppwriteBlobStoreConfig,
  resolveAppwriteDatabaseConfig,
  resolveAshfoxDbBlobStoreConfig,
  resolveAshfoxBlobStoreConfig,
  resolveAshfoxDatabaseConfig,
  resolvePersistenceSelection,
  resolvePostgresDbBlobStoreConfig,
  resolvePostgresDatabaseConfig,
  resolveSqliteDbBlobStoreConfig,
  resolveSqliteDatabaseConfig,
  resolveS3BlobStoreConfig
} from './config';
import { AppwriteBlobStore } from './infrastructure/AppwriteBlobStore';
import { AppwriteProjectRepository } from './infrastructure/AppwriteProjectRepository';
import { AshfoxStorageBlobStore } from './infrastructure/AshfoxStorageBlobStore';
import { PostgresDbBlobStore } from './infrastructure/PostgresDbBlobStore';
import { PostgresProjectRepository } from './infrastructure/PostgresProjectRepository';
import { S3BlobStore } from './infrastructure/S3BlobStore';
import { SqliteDbBlobStore } from './infrastructure/SqliteDbBlobStore';
import { SqliteProjectRepository } from './infrastructure/SqliteProjectRepository';
import { UnsupportedBlobStore, UnsupportedProjectRepository, UnsupportedWorkspaceRepository } from './infrastructure/UnsupportedAdapters';

export interface CreateGatewayPersistenceOptions {
  failFast?: boolean;
}

type BuiltPort<TPort> = {
  port: TPort;
  readiness: ProviderReadiness;
};

type WorkspaceCapableRepository = ProjectRepository & WorkspaceRepository;

type Closable = {
  close?: () => Promise<void> | void;
};

const MIN_NODE_RUNTIME_MAJOR = 22;

const readNodeRuntimeMajor = (): number => {
  const rawMajor = process.versions.node.split('.')[0];
  const major = Number.parseInt(rawMajor, 10);
  return Number.isFinite(major) ? major : 0;
};

const assertNodeRuntimePreflight = (): void => {
  const major = readNodeRuntimeMajor();
  if (major >= MIN_NODE_RUNTIME_MAJOR) return;
  throw new Error(
    `Unsupported Node.js runtime ${process.versions.node}. Ashfox persistence requires Node.js ${MIN_NODE_RUNTIME_MAJOR}+ for the supported SQLite driver.`
  );
};

const resolveSqliteRuntimeAvailability = (): { available: boolean; reason?: string } => {
  try {
    type SqliteDriverConstructor = new (location: string) => unknown;
    type SqliteModule = SqliteDriverConstructor | { default?: SqliteDriverConstructor };
    const sqliteModule = require('better-sqlite3') as SqliteModule;
    const constructor = typeof sqliteModule === 'function' ? sqliteModule : sqliteModule.default;
    if (typeof constructor === 'function') {
      return { available: true };
    }
    return { available: false, reason: 'sqlite_driver_missing_constructor' };
  } catch {
    return { available: false, reason: 'sqlite_driver_unavailable' };
  }
};

const createProjectRepository = (
  selection: ReturnType<typeof resolvePersistenceSelection>,
  env: NodeJS.ProcessEnv
): BuiltPort<ProjectRepository> => {
  if (selection.databaseProvider === 'postgres') {
    const config = resolvePostgresDatabaseConfig(env);
    return {
      port: new PostgresProjectRepository(config),
      readiness: {
        provider: selection.databaseProvider,
        ready: true,
        details: {
          adapter: 'postgres_repository',
          host: config.host,
          schema: config.schema,
          migrationsTableName: config.migrationsTableName,
          tableName: config.tableName,
          schemaVersion: 1,
          connectivity: 'deferred_until_first_query'
        }
      }
    };
  }
  if (selection.databaseProvider === 'sqlite') {
    const sqliteRuntime = resolveSqliteRuntimeAvailability();
    if (!sqliteRuntime.available) {
      return {
        port: new UnsupportedProjectRepository(
          selection.databaseProvider,
          'SQLite driver (better-sqlite3) is unavailable. Reinstall dependencies or switch ASHFOX_PERSISTENCE_PRESET.'
        ),
        readiness: {
          provider: selection.databaseProvider,
          ready: false,
          reason: sqliteRuntime.reason ?? 'sqlite_driver_unavailable'
        }
      };
    }
    const config = resolveSqliteDatabaseConfig(env);
    return {
      port: new SqliteProjectRepository(config),
      readiness: {
        provider: selection.databaseProvider,
        ready: true,
        details: {
          adapter: 'sqlite_repository',
          filePath: config.filePath,
          migrationsTableName: config.migrationsTableName,
          tableName: config.tableName,
          schemaVersion: 1,
          connectivity: 'embedded'
        }
      }
    };
  }
  if (selection.databaseProvider === 'ashfox') {
    const config = resolveAshfoxDatabaseConfig(env);
    return {
      port: new PostgresProjectRepository(config),
      readiness: {
        provider: selection.databaseProvider,
        ready: true,
        details: {
          adapter: 'ashfox_managed_postgres',
          host: config.host,
          schema: config.schema,
          migrationsTableName: config.migrationsTableName,
          tableName: config.tableName,
          schemaVersion: 1,
          connectivity: 'deferred_until_first_query'
        }
      }
    };
  }
  if (selection.databaseProvider === 'appwrite') {
    const config = resolveAppwriteDatabaseConfig(env);
    if (!config.projectId || !config.apiKey) {
      return {
        port: new UnsupportedProjectRepository(
          selection.databaseProvider,
          'Missing Appwrite credentials. Set ASHFOX_DB_APPWRITE_PROJECT_ID and ASHFOX_DB_APPWRITE_API_KEY.'
        ),
        readiness: {
          provider: selection.databaseProvider,
          ready: false,
          reason: 'missing_credentials',
          details: {
            baseUrl: config.baseUrl,
            databaseId: config.databaseId,
            collectionId: config.collectionId
          }
        }
      };
    }
    return {
      port: new AppwriteProjectRepository(config),
      readiness: {
        provider: selection.databaseProvider,
        ready: true,
        details: {
          adapter: 'appwrite_databases',
          baseUrl: config.baseUrl,
          projectId: config.projectId,
          databaseId: config.databaseId,
          collectionId: config.collectionId,
          responseFormat: config.responseFormat,
          connectivity: 'api'
        }
      }
    };
  }
  return {
    port: new UnsupportedProjectRepository(
      selection.databaseProvider,
      'Unknown database provider.'
    ),
    readiness: {
      provider: selection.databaseProvider,
      ready: false,
      reason: 'unknown_provider'
    }
  };
};

const hasWorkspaceRepository = (port: ProjectRepository): port is WorkspaceCapableRepository => {
  const candidate = port as Partial<WorkspaceRepository>;
  return (
    typeof candidate.getAccount === 'function' &&
    typeof candidate.getAccountByLocalLoginId === 'function' &&
    typeof candidate.getAccountByGithubUserId === 'function' &&
    typeof candidate.upsertAccount === 'function' &&
    typeof candidate.listWorkspaces === 'function' &&
    typeof candidate.getWorkspace === 'function' &&
    typeof candidate.upsertWorkspace === 'function' &&
    typeof candidate.removeWorkspace === 'function' &&
    typeof candidate.listWorkspaceRoles === 'function' &&
    typeof candidate.upsertWorkspaceRole === 'function' &&
    typeof candidate.removeWorkspaceRole === 'function' &&
    typeof candidate.listWorkspaceMembers === 'function' &&
    typeof candidate.upsertWorkspaceMember === 'function' &&
    typeof candidate.removeWorkspaceMember === 'function' &&
    typeof candidate.listWorkspaceFolderAcl === 'function' &&
    typeof candidate.upsertWorkspaceFolderAcl === 'function' &&
    typeof candidate.removeWorkspaceFolderAcl === 'function'
  );
};

const createWorkspaceRepository = (
  selection: ReturnType<typeof resolvePersistenceSelection>,
  projectRepository: ProjectRepository
): BuiltPort<WorkspaceRepository> => {
  if (hasWorkspaceRepository(projectRepository)) {
    return {
      port: projectRepository,
      readiness: {
        provider: selection.databaseProvider,
        ready: true,
        details: {
          adapter: 'workspace_repository',
          databaseProvider: selection.databaseProvider
        }
      }
    };
  }
  return {
    port: new UnsupportedWorkspaceRepository(
      selection.databaseProvider,
      'WorkspaceRepository contract is not implemented for this database adapter.'
    ),
    readiness: {
      provider: selection.databaseProvider,
      ready: false,
      reason: 'workspace_repository_unavailable',
      details: {
        databaseProvider: selection.databaseProvider
      }
    }
  };
};

const createBlobStore = (
  selection: ReturnType<typeof resolvePersistenceSelection>,
  env: NodeJS.ProcessEnv
): BuiltPort<BlobStore> => {
  if (selection.storageProvider === 'db') {
    if (selection.databaseProvider === 'sqlite') {
      const sqliteRuntime = resolveSqliteRuntimeAvailability();
      if (!sqliteRuntime.available) {
        return {
          port: new UnsupportedBlobStore(
            selection.storageProvider,
            'SQLite driver (better-sqlite3) is unavailable. Reinstall dependencies or switch ASHFOX_PERSISTENCE_PRESET.'
          ),
          readiness: {
            provider: selection.storageProvider,
            ready: false,
            reason: sqliteRuntime.reason ?? 'sqlite_driver_unavailable'
          }
        };
      }
      const config = resolveSqliteDbBlobStoreConfig(env);
      return {
        port: new SqliteDbBlobStore(config),
        readiness: {
          provider: selection.storageProvider,
          ready: true,
          details: {
            adapter: 'sqlite_database_blob_store',
            databaseProvider: selection.databaseProvider,
            filePath: config.filePath,
            tableName: config.tableName,
            connectivity: 'embedded'
          }
        }
      };
    }

    if (selection.databaseProvider === 'postgres') {
      const config = resolvePostgresDbBlobStoreConfig(env);
      return {
        port: new PostgresDbBlobStore(config),
        readiness: {
          provider: selection.storageProvider,
          ready: true,
          details: {
            adapter: 'postgres_database_blob_store',
            databaseProvider: selection.databaseProvider,
            host: config.host,
            schema: config.schema,
            tableName: config.tableName,
            connectivity: 'deferred_until_first_query'
          }
        }
      };
    }

    if (selection.databaseProvider === 'ashfox') {
      const config = resolveAshfoxDbBlobStoreConfig(env);
      return {
        port: new PostgresDbBlobStore(config),
        readiness: {
          provider: selection.storageProvider,
          ready: true,
          details: {
            adapter: 'ashfox_database_blob_store',
            databaseProvider: selection.databaseProvider,
            host: config.host,
            schema: config.schema,
            tableName: config.tableName,
            connectivity: 'deferred_until_first_query'
          }
        }
      };
    }

    return {
      port: new UnsupportedBlobStore(
        selection.storageProvider,
        `DB storage provider is unavailable for database provider "${selection.databaseProvider}".`
      ),
      readiness: {
        provider: selection.storageProvider,
        ready: false,
        reason: 'unsupported_database_provider',
        details: {
          databaseProvider: selection.databaseProvider
        }
      }
    };
  }
  if (selection.storageProvider === 's3') {
    const config = resolveS3BlobStoreConfig(env);
    if (!config.accessKeyId || !config.secretAccessKey) {
      return {
        port: new UnsupportedBlobStore(
          selection.storageProvider,
          'Missing S3 credentials. Set ASHFOX_STORAGE_S3_ACCESS_KEY_ID and ASHFOX_STORAGE_S3_SECRET_ACCESS_KEY.'
        ),
        readiness: {
          provider: selection.storageProvider,
          ready: false,
          reason: 'missing_credentials',
          details: { endpoint: config.endpoint, region: config.region }
        }
      };
    }
    return {
      port: new S3BlobStore(config),
      readiness: {
        provider: selection.storageProvider,
        ready: true,
        details: {
          adapter: 's3_storage',
          endpoint: config.endpoint ?? 'aws-default',
          region: config.region,
          keyPrefix: config.keyPrefix
        }
      }
    };
  }
  if (selection.storageProvider === 'ashfox') {
    const config = resolveAshfoxBlobStoreConfig(env);
    if (!config.serviceKey) {
      return {
        port: new UnsupportedBlobStore(
          selection.storageProvider,
          'Missing Ashfox storage service key. Set ASHFOX_STORAGE_ASHFOX_SERVICE_KEY.'
        ),
        readiness: {
          provider: selection.storageProvider,
          ready: false,
          reason: 'missing_credentials',
          details: { baseUrl: config.baseUrl }
        }
      };
    }
    return {
      port: new AshfoxStorageBlobStore(config),
      readiness: {
        provider: selection.storageProvider,
        ready: true,
        details: {
          adapter: 'ashfox_storage_api',
          baseUrl: config.baseUrl,
          keyPrefix: config.keyPrefix
        }
      }
    };
  }
  if (selection.storageProvider === 'appwrite') {
    const config = resolveAppwriteBlobStoreConfig(env);
    if (!config.projectId || !config.apiKey) {
      return {
        port: new UnsupportedBlobStore(
          selection.storageProvider,
          'Missing Appwrite credentials. Set ASHFOX_STORAGE_APPWRITE_PROJECT_ID and ASHFOX_STORAGE_APPWRITE_API_KEY.'
        ),
        readiness: {
          provider: selection.storageProvider,
          ready: false,
          reason: 'missing_credentials',
          details: { baseUrl: config.baseUrl, bucketId: config.bucketId }
        }
      };
    }
    return {
      port: new AppwriteBlobStore(config),
      readiness: {
        provider: selection.storageProvider,
        ready: true,
        details: {
          adapter: 'appwrite_storage',
          baseUrl: config.baseUrl,
          projectId: config.projectId,
          bucketId: config.bucketId,
          keyPrefix: config.keyPrefix,
          metadataDatabaseId: config.metadataDatabaseId,
          metadataCollectionId: config.metadataCollectionId,
          responseFormat: config.responseFormat,
          upsert: config.upsert
        }
      }
    };
  }
  return {
    port: new UnsupportedBlobStore(
      selection.storageProvider,
      'Unknown storage provider.'
    ),
    readiness: {
      provider: selection.storageProvider,
      ready: false,
      reason: 'unknown_provider'
    }
  };
};

const buildReadinessError = (domain: 'database' | 'storage', readiness: ProviderReadiness): string => {
  const reason = readiness.reason ?? 'not_ready';
  const details = readiness.details ? ` details=${JSON.stringify(readiness.details)}` : '';
  return `${domain} provider "${readiness.provider}" failed readiness (${reason}).${details}`;
};

const assertGatewayPersistenceReady = (persistence: PersistencePorts): void => {
  const failures: string[] = [];
  if (!persistence.health.database.ready) {
    failures.push(buildReadinessError('database', persistence.health.database));
  }
  if (!persistence.health.storage.ready) {
    failures.push(buildReadinessError('storage', persistence.health.storage));
  }
  if (failures.length > 0) {
    throw new Error(`Persistence startup validation failed: ${failures.join(' ')}`);
  }
};

const closeIfSupported = async (candidate: unknown): Promise<void> => {
  const close = (candidate as Closable | null | undefined)?.close;
  if (typeof close !== 'function') return;
  await close.call(candidate);
};

export const closeGatewayPersistence = async (persistence: PersistencePorts): Promise<void> => {
  const errors: string[] = [];
  const candidates = Array.from(
    new Set<unknown>([persistence.projectRepository, persistence.workspaceRepository, persistence.blobStore])
  );
  for (const candidate of candidates) {
    try {
      await closeIfSupported(candidate);
    } catch (error) {
      if (error instanceof Error) {
        errors.push(error.message);
      } else {
        errors.push(String(error));
      }
    }
  }
  if (errors.length > 0) {
    throw new Error(`One or more persistence resources failed to close: ${errors.join(' | ')}`);
  }
};

export const createGatewayPersistence = (
  env: NodeJS.ProcessEnv,
  options: CreateGatewayPersistenceOptions = {}
): PersistencePorts => {
  assertNodeRuntimePreflight();
  const selection = resolvePersistenceSelection(env);
  const repository = createProjectRepository(selection, env);
  const workspaceRepository = createWorkspaceRepository(selection, repository.port);
  const blobStore = createBlobStore(selection, env);
  const databaseReadiness: ProviderReadiness =
    repository.readiness.ready && workspaceRepository.readiness.ready
      ? repository.readiness
      : {
          ...repository.readiness,
          ready: false,
          reason: repository.readiness.reason ?? workspaceRepository.readiness.reason ?? 'workspace_repository_unavailable',
          details: {
            ...(repository.readiness.details ?? {}),
            workspace: workspaceRepository.readiness
          }
        };
  const persistence: PersistencePorts = {
    projectRepository: repository.port,
    workspaceRepository: workspaceRepository.port,
    blobStore: blobStore.port,
    health: {
      selection,
      database: databaseReadiness,
      storage: blobStore.readiness
    }
  };
  if (options.failFast) {
    assertGatewayPersistenceReady(persistence);
  }
  return persistence;
};
