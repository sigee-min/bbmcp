import { Pool } from 'pg';
import type { PersistedProjectRecord, ProjectRepository, ProjectRepositoryScope } from '@ashfox/backend-core';

export interface PostgresProjectRepositoryOptions {
  connectionString: string;
  schema: string;
  tableName: string;
  migrationsTableName: string;
  maxConnections: number;
  poolFactory?: (options: { connectionString: string; maxConnections: number }) => PostgresPool;
}

export interface PostgresPool {
  query<TResult extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<PostgresQueryResult<TResult>>;
  end(): Promise<void>;
}

export type PostgresQueryResult<TResult extends Record<string, unknown> = Record<string, unknown>> = {
  rows: TResult[];
  rowCount?: number | null;
};

type PersistedRow = {
  tenant_id: string;
  project_id: string;
  revision: string;
  state: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

type MigrationRow = {
  version: number | string;
};

type MutationProbeRow = {
  applied: number;
};

type PostgresMigration = {
  version: number;
  name: string;
  upSql: string;
};

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const quoteIdentifier = (value: string, field: 'schema' | 'table'): string => {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`${field} must match ${IDENTIFIER_PATTERN.source}.`);
  }
  return `"${value}"`;
};

const normalizeTimestamp = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
};

const parseState = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

export class PostgresProjectRepository implements ProjectRepository {
  private readonly options: PostgresProjectRepositoryOptions;
  private readonly schemaSql: string;
  private readonly tableSql: string;
  private readonly migrationsTableSql: string;
  private pool: PostgresPool | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(options: PostgresProjectRepositoryOptions) {
    this.options = options;
    this.schemaSql = quoteIdentifier(options.schema, 'schema');
    const tableNameSql = quoteIdentifier(options.tableName, 'table');
    this.tableSql = `${this.schemaSql}.${tableNameSql}`;
    const migrationsTableSql = quoteIdentifier(options.migrationsTableName, 'table');
    this.migrationsTableSql = `${this.schemaSql}.${migrationsTableSql}`;
  }

  private getPool(): PostgresPool {
    if (this.pool) return this.pool;
    this.pool = this.options.poolFactory
      ? this.options.poolFactory({
          connectionString: this.options.connectionString,
          maxConnections: this.options.maxConnections
        })
      : new Pool({
          connectionString: this.options.connectionString,
          max: this.options.maxConnections
        });
    return this.pool;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initializeSchema();
    }
    await this.initPromise;
  }

  private async initializeSchema(): Promise<void> {
    const pool = this.getPool();
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${this.schemaSql}`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${this.migrationsTableSql} (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL
      )
    `);
    const existing = await pool.query<MigrationRow>(`SELECT version FROM ${this.migrationsTableSql}`);
    const appliedVersions = new Set(
      existing.rows
        .map((row) => Number(row.version))
        .filter((version) => Number.isInteger(version))
    );
    for (const migration of this.buildMigrations()) {
      if (appliedVersions.has(migration.version)) continue;
      await this.applyMigration(pool, migration);
      appliedVersions.add(migration.version);
    }
  }

  private buildMigrations(): PostgresMigration[] {
    return [
      {
        version: 1,
        name: 'create_projects_table',
        upSql: `
          CREATE TABLE IF NOT EXISTS ${this.tableSql} (
            tenant_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            revision TEXT NOT NULL,
            state JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (tenant_id, project_id)
          )
        `
      }
    ];
  }

  private async applyMigration(pool: PostgresPool, migration: PostgresMigration): Promise<void> {
    await pool.query('BEGIN');
    try {
      await pool.query(migration.upSql);
      await pool.query(
        `
          INSERT INTO ${this.migrationsTableSql} (version, name, applied_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (version) DO NOTHING
        `,
        [migration.version, migration.name]
      );
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }

  async find(scope: ProjectRepositoryScope): Promise<PersistedProjectRecord | null> {
    await this.ensureInitialized();
    const pool = this.getPool();
    const result = await pool.query<PersistedRow>(
      `
        SELECT tenant_id, project_id, revision, state, created_at, updated_at
        FROM ${this.tableSql}
        WHERE tenant_id = $1
          AND project_id = $2
        LIMIT 1
      `,
      [scope.tenantId, scope.projectId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      scope: {
        tenantId: row.tenant_id,
        projectId: row.project_id
      },
      revision: row.revision,
      state: parseState(row.state),
      createdAt: normalizeTimestamp(row.created_at),
      updatedAt: normalizeTimestamp(row.updated_at)
    };
  }

  async save(record: PersistedProjectRecord): Promise<void> {
    await this.ensureInitialized();
    const pool = this.getPool();
    const createdAt = normalizeTimestamp(record.createdAt);
    const updatedAt = normalizeTimestamp(record.updatedAt);
    await pool.query(
      `
        INSERT INTO ${this.tableSql} (
          tenant_id,
          project_id,
          revision,
          state,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz, $6::timestamptz)
        ON CONFLICT (tenant_id, project_id)
        DO UPDATE
        SET revision = EXCLUDED.revision,
            state = EXCLUDED.state,
            updated_at = EXCLUDED.updated_at
      `,
      [record.scope.tenantId, record.scope.projectId, record.revision, JSON.stringify(record.state), createdAt, updatedAt]
    );
  }

  async saveIfRevision(record: PersistedProjectRecord, expectedRevision: string | null): Promise<boolean> {
    await this.ensureInitialized();
    const pool = this.getPool();
    const createdAt = normalizeTimestamp(record.createdAt);
    const updatedAt = normalizeTimestamp(record.updatedAt);
    if (expectedRevision === null) {
      const inserted = await pool.query<MutationProbeRow>(
        `
          INSERT INTO ${this.tableSql} (
            tenant_id,
            project_id,
            revision,
            state,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz, $6::timestamptz)
          ON CONFLICT (tenant_id, project_id)
          DO NOTHING
          RETURNING 1 AS applied
        `,
        [record.scope.tenantId, record.scope.projectId, record.revision, JSON.stringify(record.state), createdAt, updatedAt]
      );
      return (inserted.rowCount ?? inserted.rows.length) > 0;
    }

    const updated = await pool.query<MutationProbeRow>(
      `
        UPDATE ${this.tableSql}
        SET revision = $3,
            state = $4::jsonb,
            updated_at = $5::timestamptz
        WHERE tenant_id = $1
          AND project_id = $2
          AND revision = $6
        RETURNING 1 AS applied
      `,
      [record.scope.tenantId, record.scope.projectId, record.revision, JSON.stringify(record.state), updatedAt, expectedRevision]
    );
    return (updated.rowCount ?? updated.rows.length) > 0;
  }

  async remove(scope: ProjectRepositoryScope): Promise<void> {
    await this.ensureInitialized();
    const pool = this.getPool();
    await pool.query(
      `
        DELETE FROM ${this.tableSql}
        WHERE tenant_id = $1
          AND project_id = $2
      `,
      [scope.tenantId, scope.projectId]
    );
  }

  async close(): Promise<void> {
    if (!this.pool) return;
    const current = this.pool;
    this.pool = null;
    this.initPromise = null;
    await current.end();
  }
}
