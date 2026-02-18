import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PersistedProjectRecord, ProjectRepository, ProjectRepositoryScope } from '@ashfox/backend-core';
import type { SqliteRepositoryConfig } from '../config';
import { quoteSqlIdentifier } from './validation';

type SqliteStatement = {
  run: (...params: unknown[]) => unknown;
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
};

type SqliteDatabase = {
  exec: (sql: string) => unknown;
  prepare: (sql: string) => SqliteStatement;
  close: () => void;
};

type SqliteRunResult = {
  changes?: number | bigint;
};

type DatabaseSyncConstructor = new (location: string) => SqliteDatabase;

type SqliteRow = {
  tenant_id: string;
  project_id: string;
  revision: string;
  state: string;
  created_at: string;
  updated_at: string;
};

type SqliteMigrationRow = {
  version: number | string;
};

type SqliteMigration = {
  version: number;
  name: string;
  upSql: string;
};

const ensureIso = (value: unknown): string => {
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
};

const toChangedRows = (value: unknown): number => {
  const changes = (value as SqliteRunResult | null | undefined)?.changes;
  if (typeof changes === 'number') return Number.isFinite(changes) ? changes : 0;
  if (typeof changes === 'bigint') {
    const asNumber = Number(changes);
    return Number.isFinite(asNumber) ? asNumber : 0;
  }
  return 0;
};

const parseState = (value: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const loadDatabaseConstructor = (): DatabaseSyncConstructor => {
  type SqliteModule = { DatabaseSync?: DatabaseSyncConstructor };
  const sqliteModule = require('node:sqlite') as SqliteModule;
  if (typeof sqliteModule.DatabaseSync !== 'function') {
    throw new Error('node:sqlite DatabaseSync API is unavailable.');
  }
  return sqliteModule.DatabaseSync;
};

export class SqliteProjectRepository implements ProjectRepository {
  private readonly filePath: string;
  private readonly tableSql: string;
  private readonly migrationsTableSql: string;
  private database: SqliteDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(config: SqliteRepositoryConfig) {
    this.filePath = path.resolve(config.filePath);
    this.tableSql = quoteSqlIdentifier(config.tableName, 'table');
    this.migrationsTableSql = quoteSqlIdentifier(config.migrationsTableName, 'table');
  }

  private getDatabase(): SqliteDatabase {
    if (this.database) return this.database;
    const DatabaseSync = loadDatabaseConstructor();
    this.database = new DatabaseSync(this.filePath);
    return this.database;
  }

  private async ensureInitialized(): Promise<SqliteDatabase> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        const db = this.getDatabase();
        db.exec(`
          CREATE TABLE IF NOT EXISTS ${this.migrationsTableSql} (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
          )
        `);
        const appliedRows = db.prepare(`SELECT version FROM ${this.migrationsTableSql}`).all() as SqliteMigrationRow[];
        const appliedVersions = new Set(
          appliedRows
            .map((row) => Number(row.version))
            .filter((version) => Number.isInteger(version))
        );
        for (const migration of this.buildMigrations()) {
          if (appliedVersions.has(migration.version)) continue;
          this.applyMigration(db, migration);
          appliedVersions.add(migration.version);
        }
      })();
    }
    await this.initPromise;
    return this.getDatabase();
  }

  private buildMigrations(): SqliteMigration[] {
    return [
      {
        version: 1,
        name: 'create_projects_table',
        upSql: `
          CREATE TABLE IF NOT EXISTS ${this.tableSql} (
            tenant_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            revision TEXT NOT NULL,
            state TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (tenant_id, project_id)
          )
        `
      }
    ];
  }

  private applyMigration(db: SqliteDatabase, migration: SqliteMigration): void {
    db.exec('BEGIN');
    try {
      db.exec(migration.upSql);
      db.prepare(
        `
          INSERT OR IGNORE INTO ${this.migrationsTableSql} (version, name, applied_at)
          VALUES (?, ?, ?)
        `
      ).run(migration.version, migration.name, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // Ignore rollback failures and surface the original error.
      }
      throw error;
    }
  }

  async find(scope: ProjectRepositoryScope): Promise<PersistedProjectRecord | null> {
    const db = await this.ensureInitialized();
    const result = db
      .prepare(
        `
          SELECT tenant_id, project_id, revision, state, created_at, updated_at
          FROM ${this.tableSql}
          WHERE tenant_id = ?
            AND project_id = ?
          LIMIT 1
        `
      )
      .get(scope.tenantId, scope.projectId) as SqliteRow | undefined;
    if (!result) return null;
    return {
      scope: {
        tenantId: result.tenant_id,
        projectId: result.project_id
      },
      revision: result.revision,
      state: parseState(result.state),
      createdAt: ensureIso(result.created_at),
      updatedAt: ensureIso(result.updated_at)
    };
  }

  async save(record: PersistedProjectRecord): Promise<void> {
    const db = await this.ensureInitialized();
    db.prepare(
      `
        INSERT INTO ${this.tableSql} (
          tenant_id,
          project_id,
          revision,
          state,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (tenant_id, project_id)
        DO UPDATE
        SET revision = excluded.revision,
            state = excluded.state,
            updated_at = excluded.updated_at
      `
    ).run(
      record.scope.tenantId,
      record.scope.projectId,
      record.revision,
      JSON.stringify(record.state),
      ensureIso(record.createdAt),
      ensureIso(record.updatedAt)
    );
  }

  async saveIfRevision(record: PersistedProjectRecord, expectedRevision: string | null): Promise<boolean> {
    const db = await this.ensureInitialized();
    if (expectedRevision === null) {
      const inserted = db.prepare(
        `
          INSERT OR IGNORE INTO ${this.tableSql} (
            tenant_id,
            project_id,
            revision,
            state,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `
      ).run(
        record.scope.tenantId,
        record.scope.projectId,
        record.revision,
        JSON.stringify(record.state),
        ensureIso(record.createdAt),
        ensureIso(record.updatedAt)
      );
      return toChangedRows(inserted) > 0;
    }

    const updated = db.prepare(
      `
        UPDATE ${this.tableSql}
        SET revision = ?,
            state = ?,
            updated_at = ?
        WHERE tenant_id = ?
          AND project_id = ?
          AND revision = ?
      `
    ).run(
      record.revision,
      JSON.stringify(record.state),
      ensureIso(record.updatedAt),
      record.scope.tenantId,
      record.scope.projectId,
      expectedRevision
    );
    return toChangedRows(updated) > 0;
  }

  async remove(scope: ProjectRepositoryScope): Promise<void> {
    const db = await this.ensureInitialized();
    db.prepare(
      `
        DELETE FROM ${this.tableSql}
        WHERE tenant_id = ?
          AND project_id = ?
      `
    ).run(scope.tenantId, scope.projectId);
  }

  async close(): Promise<void> {
    if (!this.database) return;
    const current = this.database;
    this.database = null;
    this.initPromise = null;
    current.close();
  }
}
