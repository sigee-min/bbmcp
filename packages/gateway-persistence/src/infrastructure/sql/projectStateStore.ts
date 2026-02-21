import type { PersistedProjectRecord, ProjectRepositoryScope } from '@ashfox/backend-core';

type SqliteStatement = {
  run: (...params: unknown[]) => unknown;
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
};

type SqliteDatabase = {
  prepare: (sql: string) => SqliteStatement;
};

type SqliteProjectRow = {
  tenant_id: string;
  project_id: string;
  revision: string;
  state: string;
  created_at: string;
  updated_at: string;
};

type PostgresQueryResult<TResult extends Record<string, unknown> = Record<string, unknown>> = {
  rows: TResult[];
  rowCount?: number | null;
};

type PostgresPool = {
  query<TResult extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<PostgresQueryResult<TResult>>;
};

type PostgresProjectRow = {
  tenant_id: string;
  project_id: string;
  revision: string;
  state: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

type MutationProbeRow = {
  applied: number;
};

export interface SqliteProjectStateStoreDeps {
  getDatabase: () => Promise<SqliteDatabase>;
  tableSql: string;
  parseState: (value: string) => unknown;
  normalizeTimestamp: (value: string) => string;
  escapeLikePattern: (value: string) => string;
  toChangedRows: (value: unknown) => number;
}

export class SqliteProjectStateStore {
  constructor(private readonly deps: SqliteProjectStateStoreDeps) {}

  async find(scope: ProjectRepositoryScope): Promise<PersistedProjectRecord | null> {
    const db = await this.deps.getDatabase();
    const result = db
      .prepare(
        `
          SELECT tenant_id, project_id, revision, state, created_at, updated_at
          FROM ${this.deps.tableSql}
          WHERE tenant_id = ?
            AND project_id = ?
          LIMIT 1
        `
      )
      .get(scope.tenantId, scope.projectId) as SqliteProjectRow | undefined;
    if (!result) return null;
    return {
      scope: {
        tenantId: result.tenant_id,
        projectId: result.project_id
      },
      revision: result.revision,
      state: this.deps.parseState(result.state),
      createdAt: this.deps.normalizeTimestamp(result.created_at),
      updatedAt: this.deps.normalizeTimestamp(result.updated_at)
    };
  }

  async listByScopePrefix(scope: ProjectRepositoryScope): Promise<PersistedProjectRecord[]> {
    const db = await this.deps.getDatabase();
    const likePattern = `${this.deps.escapeLikePattern(scope.projectId)}%`;
    const rows = db
      .prepare(
        `
          SELECT tenant_id, project_id, revision, state, created_at, updated_at
          FROM ${this.deps.tableSql}
          WHERE tenant_id = ?
            AND project_id LIKE ? ESCAPE '\\'
          ORDER BY project_id ASC
        `
      )
      .all(scope.tenantId, likePattern) as SqliteProjectRow[];

    return rows.map((row) => ({
      scope: {
        tenantId: row.tenant_id,
        projectId: row.project_id
      },
      revision: row.revision,
      state: this.deps.parseState(row.state),
      createdAt: this.deps.normalizeTimestamp(row.created_at),
      updatedAt: this.deps.normalizeTimestamp(row.updated_at)
    }));
  }

  async save(record: PersistedProjectRecord): Promise<void> {
    const db = await this.deps.getDatabase();
    db.prepare(
      `
        INSERT INTO ${this.deps.tableSql} (
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
      this.deps.normalizeTimestamp(record.createdAt),
      this.deps.normalizeTimestamp(record.updatedAt)
    );
  }

  async saveIfRevision(record: PersistedProjectRecord, expectedRevision: string | null): Promise<boolean> {
    const db = await this.deps.getDatabase();
    if (expectedRevision === null) {
      const inserted = db.prepare(
        `
          INSERT OR IGNORE INTO ${this.deps.tableSql} (
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
        this.deps.normalizeTimestamp(record.createdAt),
        this.deps.normalizeTimestamp(record.updatedAt)
      );
      return this.deps.toChangedRows(inserted) > 0;
    }

    const updated = db.prepare(
      `
        UPDATE ${this.deps.tableSql}
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
      this.deps.normalizeTimestamp(record.updatedAt),
      record.scope.tenantId,
      record.scope.projectId,
      expectedRevision
    );

    return this.deps.toChangedRows(updated) > 0;
  }

  async remove(scope: ProjectRepositoryScope): Promise<void> {
    const db = await this.deps.getDatabase();
    db.prepare(
      `
        DELETE FROM ${this.deps.tableSql}
        WHERE tenant_id = ?
          AND project_id = ?
      `
    ).run(scope.tenantId, scope.projectId);
  }
}

export interface PostgresProjectStateStoreDeps {
  ensureInitialized: () => Promise<void>;
  getPool: () => PostgresPool;
  tableSql: string;
  parseState: (value: unknown) => unknown;
  normalizeTimestamp: (value: Date | string) => string;
  escapeLikePattern: (value: string) => string;
}

export class PostgresProjectStateStore {
  constructor(private readonly deps: PostgresProjectStateStoreDeps) {}

  async find(scope: ProjectRepositoryScope): Promise<PersistedProjectRecord | null> {
    await this.deps.ensureInitialized();
    const pool = this.deps.getPool();
    const result = await pool.query<PostgresProjectRow>(
      `
        SELECT tenant_id, project_id, revision, state, created_at, updated_at
        FROM ${this.deps.tableSql}
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
      state: this.deps.parseState(row.state),
      createdAt: this.deps.normalizeTimestamp(row.created_at),
      updatedAt: this.deps.normalizeTimestamp(row.updated_at)
    };
  }

  async listByScopePrefix(scope: ProjectRepositoryScope): Promise<PersistedProjectRecord[]> {
    await this.deps.ensureInitialized();
    const pool = this.deps.getPool();
    const likePattern = `${this.deps.escapeLikePattern(scope.projectId)}%`;
    const result = await pool.query<PostgresProjectRow>(
      `
        SELECT tenant_id, project_id, revision, state, created_at, updated_at
        FROM ${this.deps.tableSql}
        WHERE tenant_id = $1
          AND project_id LIKE $2 ESCAPE '\\'
        ORDER BY project_id ASC
      `,
      [scope.tenantId, likePattern]
    );

    return result.rows.map((row) => ({
      scope: {
        tenantId: row.tenant_id,
        projectId: row.project_id
      },
      revision: row.revision,
      state: this.deps.parseState(row.state),
      createdAt: this.deps.normalizeTimestamp(row.created_at),
      updatedAt: this.deps.normalizeTimestamp(row.updated_at)
    }));
  }

  async save(record: PersistedProjectRecord): Promise<void> {
    await this.deps.ensureInitialized();
    const pool = this.deps.getPool();
    await pool.query(
      `
        INSERT INTO ${this.deps.tableSql} (
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
      [
        record.scope.tenantId,
        record.scope.projectId,
        record.revision,
        JSON.stringify(record.state),
        this.deps.normalizeTimestamp(record.createdAt),
        this.deps.normalizeTimestamp(record.updatedAt)
      ]
    );
  }

  async saveIfRevision(record: PersistedProjectRecord, expectedRevision: string | null): Promise<boolean> {
    await this.deps.ensureInitialized();
    const pool = this.deps.getPool();

    if (expectedRevision === null) {
      const inserted = await pool.query<MutationProbeRow>(
        `
          INSERT INTO ${this.deps.tableSql} (
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
        [
          record.scope.tenantId,
          record.scope.projectId,
          record.revision,
          JSON.stringify(record.state),
          this.deps.normalizeTimestamp(record.createdAt),
          this.deps.normalizeTimestamp(record.updatedAt)
        ]
      );
      return (inserted.rowCount ?? inserted.rows.length) > 0;
    }

    const updated = await pool.query<MutationProbeRow>(
      `
        UPDATE ${this.deps.tableSql}
        SET revision = $3,
            state = $4::jsonb,
            updated_at = $5::timestamptz
        WHERE tenant_id = $1
          AND project_id = $2
          AND revision = $6
        RETURNING 1 AS applied
      `,
      [
        record.scope.tenantId,
        record.scope.projectId,
        record.revision,
        JSON.stringify(record.state),
        this.deps.normalizeTimestamp(record.updatedAt),
        expectedRevision
      ]
    );

    return (updated.rowCount ?? updated.rows.length) > 0;
  }

  async remove(scope: ProjectRepositoryScope): Promise<void> {
    await this.deps.ensureInitialized();
    const pool = this.deps.getPool();
    await pool.query(
      `
        DELETE FROM ${this.deps.tableSql}
        WHERE tenant_id = $1
          AND project_id = $2
      `,
      [scope.tenantId, scope.projectId]
    );
  }
}
