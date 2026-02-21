import {
  resolveAppwriteDatabaseConfig,
  resolveAshfoxDatabaseConfig,
  resolvePersistenceSelection,
  resolvePostgresDatabaseConfig,
  resolveSqliteDatabaseConfig
} from '../../config';
import { AppwriteProjectRepository } from '../../infrastructure/AppwriteProjectRepository';
import { PostgresProjectRepository } from '../../infrastructure/PostgresProjectRepository';
import { SqliteProjectRepository } from '../../infrastructure/SqliteProjectRepository';
import { UnsupportedProjectRepository, UnsupportedWorkspaceRepository } from '../../infrastructure/UnsupportedAdapters';
import { resolveSqliteRuntimeAvailability } from '../runtime';
import type { BuiltDatabasePorts } from '../types';

type PersistenceSelection = ReturnType<typeof resolvePersistenceSelection>;
type DatabaseProvider = PersistenceSelection['databaseProvider'];

const createUnsupportedDatabasePorts = (
  selection: PersistenceSelection,
  reason: string,
  readinessReason: string,
  details: Record<string, unknown> = {}
): BuiltDatabasePorts => ({
  projectRepository: {
    port: new UnsupportedProjectRepository(selection.databaseProvider, reason),
    readiness: {
      provider: selection.databaseProvider,
      ready: false,
      reason: readinessReason,
      details
    }
  },
  workspaceRepository: {
    port: new UnsupportedWorkspaceRepository(selection.databaseProvider, reason),
    readiness: {
      provider: selection.databaseProvider,
      ready: false,
      reason: readinessReason,
      details: {
        ...details,
        databaseProvider: selection.databaseProvider
      }
    }
  }
});

const createSqliteDatabasePorts = (
  selection: PersistenceSelection,
  env: NodeJS.ProcessEnv
): BuiltDatabasePorts => {
  const sqliteRuntime = resolveSqliteRuntimeAvailability();
  if (!sqliteRuntime.available) {
    const reason = sqliteRuntime.reason ?? 'sqlite_driver_unavailable';
    return createUnsupportedDatabasePorts(
      selection,
      'SQLite driver (better-sqlite3) is unavailable. Reinstall dependencies or switch ASHFOX_PERSISTENCE_PRESET.',
      reason,
      { databaseProvider: selection.databaseProvider }
    );
  }

  const config = resolveSqliteDatabaseConfig(env);
  const repository = new SqliteProjectRepository(config);
  return {
    projectRepository: {
      port: repository,
      readiness: {
        provider: selection.databaseProvider,
        ready: true,
        details: {
          adapter: 'sqlite_repository',
          filePath: config.filePath,
          migrationsTableName: config.migrationsTableName,
          tableName: config.tableName,
          connectivity: 'embedded'
        }
      }
    },
    workspaceRepository: {
      port: repository,
      readiness: {
        provider: selection.databaseProvider,
        ready: true,
        details: {
          adapter: 'sqlite_workspace_repository',
          filePath: config.filePath,
          databaseProvider: selection.databaseProvider
        }
      }
    }
  };
};

const createPostgresDatabasePorts = (
  selection: PersistenceSelection,
  env: NodeJS.ProcessEnv
): BuiltDatabasePorts => {
  const config = resolvePostgresDatabaseConfig(env);
  const repository = new PostgresProjectRepository(config);
  return {
    projectRepository: {
      port: repository,
      readiness: {
        provider: selection.databaseProvider,
        ready: true,
        details: {
          adapter: 'postgres_repository',
          host: config.host,
          schema: config.schema,
          migrationsTableName: config.migrationsTableName,
          tableName: config.tableName,
          connectivity: 'deferred_until_first_query'
        }
      }
    },
    workspaceRepository: {
      port: repository,
      readiness: {
        provider: selection.databaseProvider,
        ready: true,
        details: {
          adapter: 'postgres_workspace_repository',
          host: config.host,
          schema: config.schema,
          databaseProvider: selection.databaseProvider
        }
      }
    }
  };
};

const createAshfoxDatabasePorts = (
  selection: PersistenceSelection,
  env: NodeJS.ProcessEnv
): BuiltDatabasePorts => {
  const config = resolveAshfoxDatabaseConfig(env);
  const repository = new PostgresProjectRepository(config);
  return {
    projectRepository: {
      port: repository,
      readiness: {
        provider: selection.databaseProvider,
        ready: true,
        details: {
          adapter: 'ashfox_managed_postgres',
          host: config.host,
          schema: config.schema,
          migrationsTableName: config.migrationsTableName,
          tableName: config.tableName,
          connectivity: 'deferred_until_first_query'
        }
      }
    },
    workspaceRepository: {
      port: repository,
      readiness: {
        provider: selection.databaseProvider,
        ready: true,
        details: {
          adapter: 'ashfox_workspace_repository',
          host: config.host,
          schema: config.schema,
          databaseProvider: selection.databaseProvider
        }
      }
    }
  };
};

const createAppwriteDatabasePorts = (
  selection: PersistenceSelection,
  env: NodeJS.ProcessEnv
): BuiltDatabasePorts => {
  const config = resolveAppwriteDatabaseConfig(env);
  if (!config.projectId || !config.apiKey) {
    return createUnsupportedDatabasePorts(
      selection,
      'Missing Appwrite credentials. Set ASHFOX_DB_APPWRITE_PROJECT_ID and ASHFOX_DB_APPWRITE_API_KEY.',
      'missing_credentials',
      {
        baseUrl: config.baseUrl,
        databaseId: config.databaseId,
        collectionId: config.collectionId
      }
    );
  }

  const repository = new AppwriteProjectRepository(config);
  return {
    projectRepository: {
      port: repository,
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
    },
    workspaceRepository: {
      port: repository,
      readiness: {
        provider: selection.databaseProvider,
        ready: true,
        details: {
          adapter: 'appwrite_workspace_repository',
          baseUrl: config.baseUrl,
          databaseId: config.databaseId,
          collectionId: config.collectionId,
          databaseProvider: selection.databaseProvider
        }
      }
    }
  };
};

const databasePortFactories: Record<
  DatabaseProvider,
  (selection: PersistenceSelection, env: NodeJS.ProcessEnv) => BuiltDatabasePorts
> = {
  sqlite: createSqliteDatabasePorts,
  postgres: createPostgresDatabasePorts,
  ashfox: createAshfoxDatabasePorts,
  appwrite: createAppwriteDatabasePorts
};

export const createDatabasePorts = (selection: PersistenceSelection, env: NodeJS.ProcessEnv): BuiltDatabasePorts => {
  const factory = databasePortFactories[selection.databaseProvider];
  if (!factory) {
    return createUnsupportedDatabasePorts(
      selection,
      'Unknown database provider.',
      'unknown_provider',
      { databaseProvider: selection.databaseProvider }
    );
  }
  return factory(selection, env);
};
