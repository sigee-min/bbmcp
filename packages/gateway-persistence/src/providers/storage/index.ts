import {
  resolveAppwriteBlobStoreConfig,
  resolveAshfoxBlobStoreConfig,
  resolveAshfoxDbBlobStoreConfig,
  resolvePersistenceSelection,
  resolvePostgresDbBlobStoreConfig,
  resolveS3BlobStoreConfig,
  resolveSqliteDbBlobStoreConfig
} from '../../config';
import { AppwriteBlobStore } from '../../infrastructure/AppwriteBlobStore';
import { AshfoxStorageBlobStore } from '../../infrastructure/AshfoxStorageBlobStore';
import { PostgresDbBlobStore } from '../../infrastructure/PostgresDbBlobStore';
import { S3BlobStore } from '../../infrastructure/S3BlobStore';
import { SqliteDbBlobStore } from '../../infrastructure/SqliteDbBlobStore';
import { UnsupportedBlobStore } from '../../infrastructure/UnsupportedAdapters';
import { resolveSqliteRuntimeAvailability } from '../runtime';
import type { BuiltBlobStore } from '../types';

type PersistenceSelection = ReturnType<typeof resolvePersistenceSelection>;

const createUnsupportedStoragePort = (
  selection: PersistenceSelection,
  reason: string,
  readinessReason: string,
  details: Record<string, unknown> = {}
): BuiltBlobStore => ({
  port: new UnsupportedBlobStore(selection.storageProvider, reason),
  readiness: {
    provider: selection.storageProvider,
    ready: false,
    reason: readinessReason,
    details
  }
});

const createDbBlobStore = (selection: PersistenceSelection, env: NodeJS.ProcessEnv): BuiltBlobStore => {
  if (selection.databaseProvider === 'sqlite') {
    const sqliteRuntime = resolveSqliteRuntimeAvailability();
    if (!sqliteRuntime.available) {
      return createUnsupportedStoragePort(
        selection,
        'SQLite driver (better-sqlite3) is unavailable. Reinstall dependencies or switch ASHFOX_PERSISTENCE_PRESET.',
        sqliteRuntime.reason ?? 'sqlite_driver_unavailable'
      );
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

  return createUnsupportedStoragePort(
    selection,
    `DB storage provider is unavailable for database provider "${selection.databaseProvider}".`,
    'unsupported_database_provider',
    { databaseProvider: selection.databaseProvider }
  );
};

const createS3BlobStore = (selection: PersistenceSelection, env: NodeJS.ProcessEnv): BuiltBlobStore => {
  const config = resolveS3BlobStoreConfig(env);
  if (!config.accessKeyId || !config.secretAccessKey) {
    return createUnsupportedStoragePort(
      selection,
      'Missing S3 credentials. Set ASHFOX_STORAGE_S3_ACCESS_KEY_ID and ASHFOX_STORAGE_S3_SECRET_ACCESS_KEY.',
      'missing_credentials',
      { endpoint: config.endpoint, region: config.region }
    );
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
};

const createAshfoxBlobStore = (selection: PersistenceSelection, env: NodeJS.ProcessEnv): BuiltBlobStore => {
  const config = resolveAshfoxBlobStoreConfig(env);
  if (!config.serviceKey) {
    return createUnsupportedStoragePort(
      selection,
      'Missing Ashfox storage service key. Set ASHFOX_STORAGE_ASHFOX_SERVICE_KEY.',
      'missing_credentials',
      { baseUrl: config.baseUrl }
    );
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
};

const createAppwriteBlobStore = (selection: PersistenceSelection, env: NodeJS.ProcessEnv): BuiltBlobStore => {
  const config = resolveAppwriteBlobStoreConfig(env);
  if (!config.projectId || !config.apiKey) {
    return createUnsupportedStoragePort(
      selection,
      'Missing Appwrite credentials. Set ASHFOX_STORAGE_APPWRITE_PROJECT_ID and ASHFOX_STORAGE_APPWRITE_API_KEY.',
      'missing_credentials',
      { baseUrl: config.baseUrl, bucketId: config.bucketId }
    );
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
};

const storageFactories: Record<
  PersistenceSelection['storageProvider'],
  (selection: PersistenceSelection, env: NodeJS.ProcessEnv) => BuiltBlobStore
> = {
  db: createDbBlobStore,
  s3: createS3BlobStore,
  ashfox: createAshfoxBlobStore,
  appwrite: createAppwriteBlobStore
};

export const createBlobStore = (selection: PersistenceSelection, env: NodeJS.ProcessEnv): BuiltBlobStore => {
  const factory = storageFactories[selection.storageProvider];
  if (!factory) {
    return createUnsupportedStoragePort(selection, 'Unknown storage provider.', 'unknown_provider');
  }
  return factory(selection, env);
};
