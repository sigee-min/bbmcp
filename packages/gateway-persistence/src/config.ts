import path from 'node:path';
import type { DatabaseProvider, PersistencePreset, PersistenceSelection, StorageProvider } from '@ashfox/backend-core';

export interface PostgresRepositoryConfig {
  connectionString: string;
  schema: string;
  tableName: string;
  migrationsTableName: string;
  maxConnections: number;
  provider: DatabaseProvider;
  host: string;
}

export interface SqliteRepositoryConfig {
  filePath: string;
  tableName: string;
  migrationsTableName: string;
  provider: DatabaseProvider;
}

export interface PostgresDbBlobStoreConfig {
  connectionString: string;
  schema: string;
  tableName: string;
  maxConnections: number;
  provider: DatabaseProvider;
  host: string;
}

export interface SqliteDbBlobStoreConfig {
  filePath: string;
  tableName: string;
  provider: DatabaseProvider;
}

export interface S3BlobStoreConfig {
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  forcePathStyle: boolean;
  keyPrefix?: string;
  requestTimeoutMs: number;
}

export interface AshfoxBlobStoreConfig {
  baseUrl: string;
  serviceKey: string;
  keyPrefix?: string;
  requestTimeoutMs: number;
  upsert: boolean;
}

export interface AppwriteCommonConfig {
  baseUrl: string;
  projectId: string;
  apiKey: string;
  requestTimeoutMs: number;
  responseFormat: string;
}

export interface AppwriteDatabaseConfig extends AppwriteCommonConfig {
  databaseId: string;
  collectionId: string;
  workspaceStateCollectionId?: string;
  workspaceStateEnabled?: boolean;
  workspaceStateShadowRead?: boolean;
  provider: DatabaseProvider;
}

export interface AppwriteBlobStoreConfig extends AppwriteCommonConfig {
  bucketId: string;
  keyPrefix?: string;
  upsert: boolean;
  metadataDatabaseId?: string;
  metadataCollectionId?: string;
  provider: StorageProvider;
}

const DEFAULT_PRESET: PersistencePreset = 'local';
const DEFAULT_POSTGRES_URL = 'postgresql://ashfox:ashfox@postgres:5432/ashfox';
const DEFAULT_SQLITE_PATH = path.resolve(__dirname, '../../../.ashfox/local/ashfox.sqlite');
const DEFAULT_MIGRATIONS_TABLE = 'ashfox_schema_migrations';
const DEFAULT_DB_BLOB_TABLE = 'ashfox_blobs';
const DEFAULT_ASHFOX_DB_HOST = 'database.sigee.xyx';
const DEFAULT_ASHFOX_STORAGE_URL = 'https://database.sigee.xyx';
const DEFAULT_APPWRITE_URL = 'https://cloud.appwrite.io/v1';
const DEFAULT_APPWRITE_RESPONSE_FORMAT = '1.8.0';
const DEFAULT_APPWRITE_DATABASE_ID = 'ashfox';
const DEFAULT_APPWRITE_PROJECTS_COLLECTION_ID = 'ashfox_projects';
const DEFAULT_APPWRITE_WORKSPACE_COLLECTION_ID = 'ashfox_workspace_state';
const DEFAULT_APPWRITE_BLOB_BUCKET_ID = 'ashfox_blobs';
const DEFAULT_APPWRITE_BLOB_METADATA_COLLECTION_ID = 'ashfox_blob_metadata';

const PRESET_SELECTIONS: Record<PersistencePreset, { databaseProvider: DatabaseProvider; storageProvider: StorageProvider }> =
  {
    local: { databaseProvider: 'sqlite', storageProvider: 'db' },
    selfhost: { databaseProvider: 'postgres', storageProvider: 'db' },
    ashfox: { databaseProvider: 'ashfox', storageProvider: 'ashfox' },
    appwrite: { databaseProvider: 'appwrite', storageProvider: 'appwrite' }
  };

const normalize = (value: string | undefined): string => String(value ?? '').trim().toLowerCase();
const nonEmpty = (value: string | undefined): string | null => {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
};

const firstNonEmpty = (...values: Array<string | undefined>): string | null => {
  for (const value of values) {
    const resolved = nonEmpty(value);
    if (resolved) return resolved;
  }
  return null;
};

const parseBool = (value: string | undefined, fallback: boolean): boolean => {
  const normalized = normalize(value);
  if (!normalized) return fallback;
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return fallback;
};

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) return fallback;
  return Math.floor(numeric);
};

const parsePreset = (value: string | undefined): PersistencePreset | null => {
  const normalized = normalize(value);
  if (normalized === 'local' || normalized === 'selfhost' || normalized === 'ashfox' || normalized === 'appwrite') {
    return normalized;
  }
  return null;
};

const normalizeUrlBase = (value: string): string => value.replace(/\/+$/, '');

const buildPostgresUrl = (input: {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
  ssl: boolean;
}): string => {
  const user = encodeURIComponent(input.user);
  const password = input.password ? `:${encodeURIComponent(input.password)}` : '';
  const database = encodeURIComponent(input.database);
  const query = input.ssl ? '?sslmode=require' : '';
  return `postgresql://${user}${password}@${input.host}:${input.port}/${database}${query}`;
};

const parseHostFromConnection = (connectionString: string, fallbackHost: string): string => {
  try {
    return new URL(connectionString).hostname || fallbackHost;
  } catch {
    return fallbackHost;
  }
};

export const resolvePersistenceSelection = (env: NodeJS.ProcessEnv): PersistenceSelection => {
  const preset = parsePreset(env.ASHFOX_PERSISTENCE_PRESET) ?? DEFAULT_PRESET;
  const presetSelection = PRESET_SELECTIONS[preset];
  return {
    preset,
    databaseProvider: presetSelection.databaseProvider,
    storageProvider: presetSelection.storageProvider
  };
};

export const resolveSqliteDatabaseConfig = (env: NodeJS.ProcessEnv): SqliteRepositoryConfig => {
  const rawPath = nonEmpty(env.ASHFOX_DB_SQLITE_PATH);
  const filePath = rawPath ? path.resolve(rawPath) : DEFAULT_SQLITE_PATH;
  return {
    filePath,
    tableName: nonEmpty(env.ASHFOX_DB_SQLITE_TABLE) ?? 'ashfox_projects',
    migrationsTableName: nonEmpty(env.ASHFOX_DB_SQLITE_MIGRATIONS_TABLE) ?? DEFAULT_MIGRATIONS_TABLE,
    provider: 'sqlite'
  };
};

export const resolvePostgresDatabaseConfig = (env: NodeJS.ProcessEnv): PostgresRepositoryConfig => {
  const connectionString = nonEmpty(env.ASHFOX_DB_POSTGRES_URL) ?? DEFAULT_POSTGRES_URL;
  return {
    connectionString,
    schema: nonEmpty(env.ASHFOX_DB_POSTGRES_SCHEMA) ?? 'public',
    tableName: nonEmpty(env.ASHFOX_DB_POSTGRES_TABLE) ?? 'ashfox_projects',
    migrationsTableName: nonEmpty(env.ASHFOX_DB_POSTGRES_MIGRATIONS_TABLE) ?? DEFAULT_MIGRATIONS_TABLE,
    maxConnections: parsePositiveInt(env.ASHFOX_DB_POSTGRES_MAX_CONNECTIONS, 10),
    provider: 'postgres',
    host: parseHostFromConnection(connectionString, 'postgres')
  };
};

export const resolveAshfoxDatabaseConfig = (env: NodeJS.ProcessEnv): PostgresRepositoryConfig => {
  const rawConnection = nonEmpty(env.ASHFOX_DB_ASHFOX_URL);
  if (rawConnection) {
    return {
      connectionString: rawConnection,
      schema: nonEmpty(env.ASHFOX_DB_ASHFOX_SCHEMA) ?? 'public',
      tableName: nonEmpty(env.ASHFOX_DB_ASHFOX_TABLE) ?? 'ashfox_projects',
      migrationsTableName: nonEmpty(env.ASHFOX_DB_ASHFOX_MIGRATIONS_TABLE) ?? DEFAULT_MIGRATIONS_TABLE,
      maxConnections: parsePositiveInt(env.ASHFOX_DB_ASHFOX_MAX_CONNECTIONS, 10),
      provider: 'ashfox',
      host: parseHostFromConnection(rawConnection, DEFAULT_ASHFOX_DB_HOST)
    };
  }
  const host = nonEmpty(env.ASHFOX_DB_ASHFOX_HOST) ?? DEFAULT_ASHFOX_DB_HOST;
  const port = parsePositiveInt(env.ASHFOX_DB_ASHFOX_PORT, 5432);
  const user = nonEmpty(env.ASHFOX_DB_ASHFOX_USER) ?? 'postgres';
  const password = nonEmpty(env.ASHFOX_DB_ASHFOX_PASSWORD) ?? undefined;
  const database = nonEmpty(env.ASHFOX_DB_ASHFOX_NAME) ?? 'postgres';
  const ssl = parseBool(env.ASHFOX_DB_ASHFOX_SSL, true);
  return {
    connectionString: buildPostgresUrl({ host, port, user, password, database, ssl }),
    schema: nonEmpty(env.ASHFOX_DB_ASHFOX_SCHEMA) ?? 'public',
    tableName: nonEmpty(env.ASHFOX_DB_ASHFOX_TABLE) ?? 'ashfox_projects',
    migrationsTableName: nonEmpty(env.ASHFOX_DB_ASHFOX_MIGRATIONS_TABLE) ?? DEFAULT_MIGRATIONS_TABLE,
    maxConnections: parsePositiveInt(env.ASHFOX_DB_ASHFOX_MAX_CONNECTIONS, 10),
    provider: 'ashfox',
    host
  };
};

export const resolveSqliteDbBlobStoreConfig = (env: NodeJS.ProcessEnv): SqliteDbBlobStoreConfig => {
  const fallback = resolveSqliteDatabaseConfig(env);
  const filePath = path.resolve(nonEmpty(env.ASHFOX_STORAGE_DB_SQLITE_PATH) ?? fallback.filePath);
  return {
    filePath,
    tableName: nonEmpty(env.ASHFOX_STORAGE_DB_SQLITE_TABLE) ?? DEFAULT_DB_BLOB_TABLE,
    provider: 'sqlite'
  };
};

export const resolvePostgresDbBlobStoreConfig = (env: NodeJS.ProcessEnv): PostgresDbBlobStoreConfig => {
  const fallback = resolvePostgresDatabaseConfig(env);
  const connectionString = nonEmpty(env.ASHFOX_STORAGE_DB_POSTGRES_URL) ?? fallback.connectionString;
  return {
    connectionString,
    schema: nonEmpty(env.ASHFOX_STORAGE_DB_POSTGRES_SCHEMA) ?? fallback.schema,
    tableName: nonEmpty(env.ASHFOX_STORAGE_DB_POSTGRES_TABLE) ?? DEFAULT_DB_BLOB_TABLE,
    maxConnections: parsePositiveInt(env.ASHFOX_STORAGE_DB_POSTGRES_MAX_CONNECTIONS, fallback.maxConnections),
    provider: 'postgres',
    host: parseHostFromConnection(connectionString, fallback.host)
  };
};

export const resolveAshfoxDbBlobStoreConfig = (env: NodeJS.ProcessEnv): PostgresDbBlobStoreConfig => {
  const fallback = resolveAshfoxDatabaseConfig(env);
  const connectionString = nonEmpty(env.ASHFOX_STORAGE_DB_ASHFOX_URL) ?? fallback.connectionString;
  return {
    connectionString,
    schema: nonEmpty(env.ASHFOX_STORAGE_DB_ASHFOX_SCHEMA) ?? fallback.schema,
    tableName: nonEmpty(env.ASHFOX_STORAGE_DB_ASHFOX_TABLE) ?? DEFAULT_DB_BLOB_TABLE,
    maxConnections: parsePositiveInt(env.ASHFOX_STORAGE_DB_ASHFOX_MAX_CONNECTIONS, fallback.maxConnections),
    provider: 'ashfox',
    host: parseHostFromConnection(connectionString, fallback.host)
  };
};

const resolveAppwriteCommonConfig = (env: NodeJS.ProcessEnv, scope: 'db' | 'storage'): AppwriteCommonConfig => {
  const isDb = scope === 'db';
  const baseUrl = normalizeUrlBase(
    firstNonEmpty(
      isDb ? env.ASHFOX_DB_APPWRITE_URL : env.ASHFOX_STORAGE_APPWRITE_URL,
      isDb ? env.ASHFOX_DB_APPWRITE_ENDPOINT : env.ASHFOX_STORAGE_APPWRITE_ENDPOINT,
      env.ASHFOX_APPWRITE_URL,
      env.ASHFOX_APPWRITE_ENDPOINT
    ) ?? DEFAULT_APPWRITE_URL
  );
  const projectId =
    firstNonEmpty(
      isDb ? env.ASHFOX_DB_APPWRITE_PROJECT_ID : env.ASHFOX_STORAGE_APPWRITE_PROJECT_ID,
      isDb ? env.ASHFOX_DB_APPWRITE_PROJECT : env.ASHFOX_STORAGE_APPWRITE_PROJECT,
      env.ASHFOX_APPWRITE_PROJECT_ID,
      env.ASHFOX_APPWRITE_PROJECT
    ) ?? '';
  const apiKey =
    firstNonEmpty(
      isDb ? env.ASHFOX_DB_APPWRITE_API_KEY : env.ASHFOX_STORAGE_APPWRITE_API_KEY,
      isDb ? env.ASHFOX_DB_APPWRITE_KEY : env.ASHFOX_STORAGE_APPWRITE_KEY,
      env.ASHFOX_APPWRITE_API_KEY,
      env.ASHFOX_APPWRITE_KEY
    ) ?? '';
  const requestTimeoutMs = parsePositiveInt(
    firstNonEmpty(
      isDb ? env.ASHFOX_DB_APPWRITE_TIMEOUT_MS : env.ASHFOX_STORAGE_APPWRITE_TIMEOUT_MS,
      env.ASHFOX_APPWRITE_TIMEOUT_MS
    ) ?? undefined,
    15000
  );
  const responseFormat =
    firstNonEmpty(
      isDb ? env.ASHFOX_DB_APPWRITE_RESPONSE_FORMAT : env.ASHFOX_STORAGE_APPWRITE_RESPONSE_FORMAT,
      env.ASHFOX_APPWRITE_RESPONSE_FORMAT
    ) ?? DEFAULT_APPWRITE_RESPONSE_FORMAT;
  return {
    baseUrl,
    projectId,
    apiKey,
    requestTimeoutMs,
    responseFormat
  };
};

export const resolveAppwriteDatabaseConfig = (env: NodeJS.ProcessEnv): AppwriteDatabaseConfig => {
  const common = resolveAppwriteCommonConfig(env, 'db');
  const workspaceStateEnabled = parseBool(
    firstNonEmpty(
      env.ASHFOX_DB_APPWRITE_WORKSPACE_STATE_ENABLED,
      env.ASHFOX_DB_APPWRITE_WORKSPACE_V2_ENABLED,
      env.ASHFOX_APPWRITE_WORKSPACE_STATE_ENABLED
    ) ?? undefined,
    false
  );
  return {
    ...common,
    databaseId:
      firstNonEmpty(env.ASHFOX_DB_APPWRITE_DATABASE_ID, env.ASHFOX_APPWRITE_DATABASE_ID) ?? DEFAULT_APPWRITE_DATABASE_ID,
    collectionId:
      firstNonEmpty(
        env.ASHFOX_DB_APPWRITE_COLLECTION_ID,
        env.ASHFOX_DB_APPWRITE_PROJECT_COLLECTION_ID,
        env.ASHFOX_APPWRITE_COLLECTION_ID
      ) ?? DEFAULT_APPWRITE_PROJECTS_COLLECTION_ID,
    workspaceStateCollectionId:
      firstNonEmpty(
        env.ASHFOX_DB_APPWRITE_WORKSPACE_STATE_COLLECTION_ID,
        env.ASHFOX_APPWRITE_WORKSPACE_STATE_COLLECTION_ID,
        env.ASHFOX_DB_APPWRITE_WORKSPACE_V2_COLLECTION_ID,
        env.ASHFOX_DB_APPWRITE_WORKSPACE_COLLECTION_ID,
        env.ASHFOX_APPWRITE_WORKSPACE_V2_COLLECTION_ID
      ) ?? DEFAULT_APPWRITE_WORKSPACE_COLLECTION_ID,
    workspaceStateEnabled,
    workspaceStateShadowRead: parseBool(
      firstNonEmpty(
        env.ASHFOX_DB_APPWRITE_WORKSPACE_STATE_SHADOW_READ,
        env.ASHFOX_DB_APPWRITE_WORKSPACE_V2_SHADOW_READ,
        env.ASHFOX_APPWRITE_WORKSPACE_STATE_SHADOW_READ
      ) ?? undefined,
      workspaceStateEnabled
    ),
    provider: 'appwrite'
  };
};

export const resolveS3BlobStoreConfig = (env: NodeJS.ProcessEnv): S3BlobStoreConfig => ({
  region: nonEmpty(env.ASHFOX_STORAGE_S3_REGION) ?? 'us-east-1',
  endpoint: nonEmpty(env.ASHFOX_STORAGE_S3_ENDPOINT) ?? undefined,
  accessKeyId: nonEmpty(env.ASHFOX_STORAGE_S3_ACCESS_KEY_ID) ?? '',
  secretAccessKey: nonEmpty(env.ASHFOX_STORAGE_S3_SECRET_ACCESS_KEY) ?? '',
  sessionToken: nonEmpty(env.ASHFOX_STORAGE_S3_SESSION_TOKEN) ?? undefined,
  forcePathStyle: parseBool(env.ASHFOX_STORAGE_S3_FORCE_PATH_STYLE, true),
  keyPrefix: nonEmpty(env.ASHFOX_STORAGE_S3_KEY_PREFIX) ?? undefined,
  requestTimeoutMs: parsePositiveInt(env.ASHFOX_STORAGE_S3_TIMEOUT_MS, 15000)
});

export const resolveAshfoxBlobStoreConfig = (env: NodeJS.ProcessEnv): AshfoxBlobStoreConfig => ({
  baseUrl: normalizeUrlBase(nonEmpty(env.ASHFOX_STORAGE_ASHFOX_URL) ?? DEFAULT_ASHFOX_STORAGE_URL),
  serviceKey: nonEmpty(env.ASHFOX_STORAGE_ASHFOX_SERVICE_KEY) ?? '',
  keyPrefix: nonEmpty(env.ASHFOX_STORAGE_ASHFOX_KEY_PREFIX) ?? undefined,
  requestTimeoutMs: parsePositiveInt(env.ASHFOX_STORAGE_ASHFOX_TIMEOUT_MS, 15000),
  upsert: parseBool(env.ASHFOX_STORAGE_ASHFOX_UPSERT, true)
});

export const resolveAppwriteBlobStoreConfig = (env: NodeJS.ProcessEnv): AppwriteBlobStoreConfig => {
  const common = resolveAppwriteCommonConfig(env, 'storage');
  return {
    ...common,
    bucketId:
      firstNonEmpty(env.ASHFOX_STORAGE_APPWRITE_BUCKET_ID, env.ASHFOX_APPWRITE_BUCKET_ID) ?? DEFAULT_APPWRITE_BLOB_BUCKET_ID,
    keyPrefix: firstNonEmpty(env.ASHFOX_STORAGE_APPWRITE_KEY_PREFIX) ?? undefined,
    upsert: parseBool(env.ASHFOX_STORAGE_APPWRITE_UPSERT, true),
    metadataDatabaseId:
      firstNonEmpty(
        env.ASHFOX_STORAGE_APPWRITE_METADATA_DATABASE_ID,
        env.ASHFOX_DB_APPWRITE_DATABASE_ID,
        env.ASHFOX_APPWRITE_DATABASE_ID
      ) ?? DEFAULT_APPWRITE_DATABASE_ID,
    metadataCollectionId:
      firstNonEmpty(
        env.ASHFOX_STORAGE_APPWRITE_METADATA_COLLECTION_ID,
        env.ASHFOX_APPWRITE_BLOB_METADATA_COLLECTION_ID
      ) ?? DEFAULT_APPWRITE_BLOB_METADATA_COLLECTION_ID,
    provider: 'appwrite'
  };
};
