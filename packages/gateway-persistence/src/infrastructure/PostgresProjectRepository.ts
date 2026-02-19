import { Pool } from 'pg';
import type {
  AccountRecord,
  PersistedProjectRecord,
  ProjectRepository,
  ProjectRepositoryScope,
  WorkspaceFolderAclRecord,
  WorkspaceMemberRecord,
  WorkspaceRecord,
  WorkspaceRepository,
  WorkspaceRoleStorageRecord
} from '@ashfox/backend-core';
import {
  createWorkspaceSeedTemplate,
  fromAclFolderKey,
  isWorkspacePermission,
  normalizeTimestamp,
  parseJsonStringArray,
  parseWorkspaceAclEffect,
  parseWorkspaceBuiltinRole,
  parseWorkspaceMode,
  parseWorkspacePermissionArray,
  toAclFolderKey,
  uniqueStrings
} from './workspace/common';
import { quoteSqlIdentifier } from './validation';

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

type PersistedProjectRow = {
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

type WorkspaceRow = {
  workspace_id: string;
  tenant_id: string;
  name: string;
  mode: string;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
};

type WorkspaceListRow = WorkspaceRow & {
  member_account_id: string | null;
};

type WorkspaceRoleRow = {
  workspace_id: string;
  role_id: string;
  name: string;
  builtin: string | null;
  permissions: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

type WorkspaceMemberRow = {
  workspace_id: string;
  account_id: string;
  role_ids: unknown;
  joined_at: Date | string;
};

type WorkspaceAclRow = {
  workspace_id: string;
  folder_id: string;
  role_id: string;
  read_effect: string;
  write_effect: string;
  updated_at: Date | string;
};

type AccountRow = {
  account_id: string;
  email: string;
  display_name: string;
  system_roles: unknown;
  local_login_id: string | null;
  password_hash: string | null;
  github_user_id: string | null;
  github_login: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const parseState = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const parseSystemRoles = (value: unknown): Array<'system_admin' | 'cs_admin'> =>
  parseJsonStringArray(value).filter((role): role is 'system_admin' | 'cs_admin' => role === 'system_admin' || role === 'cs_admin');

const normalizeAccountRecord = (row: AccountRow): AccountRecord => ({
  accountId: row.account_id,
  email: row.email,
  displayName: row.display_name,
  systemRoles: parseSystemRoles(row.system_roles),
  localLoginId: row.local_login_id,
  passwordHash: row.password_hash,
  githubUserId: row.github_user_id,
  githubLogin: row.github_login,
  createdAt: normalizeTimestamp(row.created_at),
  updatedAt: normalizeTimestamp(row.updated_at)
});

export class PostgresProjectRepository implements ProjectRepository, WorkspaceRepository {
  private readonly options: PostgresProjectRepositoryOptions;
  private readonly schemaSql: string;
  private readonly tableSql: string;
  private readonly migrationsTableSql: string;
  private readonly workspaceTableSql: string;
  private readonly accountTableSql: string;
  private readonly workspaceMembersTableSql: string;
  private readonly workspaceRolesTableSql: string;
  private readonly workspaceAclTableSql: string;
  private pool: PostgresPool | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(options: PostgresProjectRepositoryOptions) {
    this.options = options;
    this.schemaSql = quoteSqlIdentifier(options.schema, 'schema');
    const tableNameSql = quoteSqlIdentifier(options.tableName, 'table');
    this.tableSql = `${this.schemaSql}.${tableNameSql}`;
    const migrationsTableSql = quoteSqlIdentifier(options.migrationsTableName, 'table');
    this.migrationsTableSql = `${this.schemaSql}.${migrationsTableSql}`;
    this.workspaceTableSql = `${this.schemaSql}.${quoteSqlIdentifier('ashfox_workspaces', 'table')}`;
    this.accountTableSql = `${this.schemaSql}.${quoteSqlIdentifier('ashfox_accounts', 'table')}`;
    this.workspaceMembersTableSql = `${this.schemaSql}.${quoteSqlIdentifier('ashfox_workspace_members', 'table')}`;
    this.workspaceRolesTableSql = `${this.schemaSql}.${quoteSqlIdentifier('ashfox_workspace_roles', 'table')}`;
    this.workspaceAclTableSql = `${this.schemaSql}.${quoteSqlIdentifier('ashfox_workspace_folder_acl', 'table')}`;
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
    await this.seedDefaultWorkspaceTemplate(pool);
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
      },
      {
        version: 2,
        name: 'create_workspace_rbac_tables',
        upSql: `
          CREATE TABLE IF NOT EXISTS ${this.workspaceTableSql} (
            workspace_id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            name TEXT NOT NULL,
            mode TEXT NOT NULL,
            created_by TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL
          );
          CREATE TABLE IF NOT EXISTS ${this.accountTableSql} (
            account_id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            display_name TEXT NOT NULL,
            system_roles JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL
          );
          CREATE TABLE IF NOT EXISTS ${this.workspaceMembersTableSql} (
            workspace_id TEXT NOT NULL,
            account_id TEXT NOT NULL,
            role_ids JSONB NOT NULL,
            joined_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (workspace_id, account_id)
          );
          CREATE TABLE IF NOT EXISTS ${this.workspaceRolesTableSql} (
            workspace_id TEXT NOT NULL,
            role_id TEXT NOT NULL,
            name TEXT NOT NULL,
            builtin TEXT NULL,
            permissions JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (workspace_id, role_id)
          );
          CREATE TABLE IF NOT EXISTS ${this.workspaceAclTableSql} (
            workspace_id TEXT NOT NULL,
            folder_id TEXT NOT NULL,
            role_id TEXT NOT NULL,
            read_effect TEXT NOT NULL,
            write_effect TEXT NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (workspace_id, folder_id, role_id)
          );
          CREATE INDEX IF NOT EXISTS idx_workspace_members_account_id
            ON ${this.workspaceMembersTableSql}(account_id);
          CREATE INDEX IF NOT EXISTS idx_workspace_roles_workspace_id
            ON ${this.workspaceRolesTableSql}(workspace_id);
          CREATE INDEX IF NOT EXISTS idx_workspace_acl_workspace_id
            ON ${this.workspaceAclTableSql}(workspace_id);
        `
      },
      {
        version: 3,
        name: 'add_account_auth_columns',
        upSql: `
          ALTER TABLE ${this.accountTableSql}
            ADD COLUMN IF NOT EXISTS local_login_id TEXT NULL;
          ALTER TABLE ${this.accountTableSql}
            ADD COLUMN IF NOT EXISTS password_hash TEXT NULL;
          ALTER TABLE ${this.accountTableSql}
            ADD COLUMN IF NOT EXISTS github_user_id TEXT NULL;
          ALTER TABLE ${this.accountTableSql}
            ADD COLUMN IF NOT EXISTS github_login TEXT NULL;
          CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_local_login_id
            ON ${this.accountTableSql}(local_login_id)
            WHERE local_login_id IS NOT NULL;
          CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_github_user_id
            ON ${this.accountTableSql}(github_user_id)
            WHERE github_user_id IS NOT NULL;
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

  private async seedDefaultWorkspaceTemplate(pool: PostgresPool): Promise<void> {
    const seed = createWorkspaceSeedTemplate();
    await pool.query(
      `
        INSERT INTO ${this.workspaceTableSql} (
          workspace_id,
          tenant_id,
          name,
          mode,
          created_by,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (workspace_id) DO NOTHING
      `,
      [
        seed.workspace.workspaceId,
        seed.workspace.tenantId,
        seed.workspace.name,
        seed.workspace.mode,
        seed.workspace.createdBy
      ]
    );

    await pool.query(
      `
        INSERT INTO ${this.accountTableSql} (
          account_id,
          email,
          display_name,
          system_roles,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW())
        ON CONFLICT (account_id) DO NOTHING
      `,
      [
        seed.systemAccount.accountId,
        seed.systemAccount.email,
        seed.systemAccount.displayName,
        JSON.stringify(seed.systemAccount.systemRoles)
      ]
    );

    await pool.query(
      `
        INSERT INTO ${this.workspaceRolesTableSql} (
          workspace_id,
          role_id,
          name,
          builtin,
          permissions,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, NOW(), NOW())
        ON CONFLICT (workspace_id, role_id) DO NOTHING
      `,
      [
        seed.roles[0].workspaceId,
        seed.roles[0].roleId,
        seed.roles[0].name,
        seed.roles[0].builtin,
        JSON.stringify(seed.roles[0].permissions)
      ]
    );

    await pool.query(
      `
        INSERT INTO ${this.workspaceRolesTableSql} (
          workspace_id,
          role_id,
          name,
          builtin,
          permissions,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, NOW(), NOW())
        ON CONFLICT (workspace_id, role_id) DO NOTHING
      `,
      [
        seed.roles[1].workspaceId,
        seed.roles[1].roleId,
        seed.roles[1].name,
        seed.roles[1].builtin,
        JSON.stringify(seed.roles[1].permissions)
      ]
    );

    await pool.query(
      `
        INSERT INTO ${this.workspaceMembersTableSql} (
          workspace_id,
          account_id,
          role_ids,
          joined_at,
          updated_at
        )
        VALUES ($1, $2, $3::jsonb, NOW(), NOW())
        ON CONFLICT (workspace_id, account_id) DO NOTHING
      `,
      [seed.member.workspaceId, seed.member.accountId, JSON.stringify(seed.member.roleIds)]
    );
  }

  async find(scope: ProjectRepositoryScope): Promise<PersistedProjectRecord | null> {
    await this.ensureInitialized();
    const pool = this.getPool();
    const result = await pool.query<PersistedProjectRow>(
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

  async getAccount(accountId: string): Promise<AccountRecord | null> {
    await this.ensureInitialized();
    const pool = this.getPool();
    const result = await pool.query<AccountRow>(
      `
        SELECT
          account_id,
          email,
          display_name,
          system_roles,
          local_login_id,
          password_hash,
          github_user_id,
          github_login,
          created_at,
          updated_at
        FROM ${this.accountTableSql}
        WHERE account_id = $1
        LIMIT 1
      `,
      [accountId]
    );
    const row = result.rows[0];
    return row ? normalizeAccountRecord(row) : null;
  }

  async getAccountByLocalLoginId(localLoginId: string): Promise<AccountRecord | null> {
    await this.ensureInitialized();
    const normalizedLoginId = localLoginId.trim().toLowerCase();
    if (!normalizedLoginId) {
      return null;
    }
    const pool = this.getPool();
    const result = await pool.query<AccountRow>(
      `
        SELECT
          account_id,
          email,
          display_name,
          system_roles,
          local_login_id,
          password_hash,
          github_user_id,
          github_login,
          created_at,
          updated_at
        FROM ${this.accountTableSql}
        WHERE local_login_id = $1
        LIMIT 1
      `,
      [normalizedLoginId]
    );
    const row = result.rows[0];
    return row ? normalizeAccountRecord(row) : null;
  }

  async getAccountByGithubUserId(githubUserId: string): Promise<AccountRecord | null> {
    await this.ensureInitialized();
    const normalizedGithubUserId = githubUserId.trim();
    if (!normalizedGithubUserId) {
      return null;
    }
    const pool = this.getPool();
    const result = await pool.query<AccountRow>(
      `
        SELECT
          account_id,
          email,
          display_name,
          system_roles,
          local_login_id,
          password_hash,
          github_user_id,
          github_login,
          created_at,
          updated_at
        FROM ${this.accountTableSql}
        WHERE github_user_id = $1
        LIMIT 1
      `,
      [normalizedGithubUserId]
    );
    const row = result.rows[0];
    return row ? normalizeAccountRecord(row) : null;
  }

  async upsertAccount(record: AccountRecord): Promise<void> {
    await this.ensureInitialized();
    const pool = this.getPool();
    const now = new Date().toISOString();
    const systemRoles = uniqueStrings(record.systemRoles).filter(
      (role): role is 'system_admin' | 'cs_admin' => role === 'system_admin' || role === 'cs_admin'
    );
    const localLoginId =
      typeof record.localLoginId === 'string' && record.localLoginId.trim().length > 0
        ? record.localLoginId.trim().toLowerCase()
        : null;
    const githubUserId =
      typeof record.githubUserId === 'string' && record.githubUserId.trim().length > 0
        ? record.githubUserId.trim()
        : null;
    const githubLogin =
      typeof record.githubLogin === 'string' && record.githubLogin.trim().length > 0
        ? record.githubLogin.trim()
        : null;
    const passwordHash =
      typeof record.passwordHash === 'string' && record.passwordHash.trim().length > 0 ? record.passwordHash.trim() : null;
    await pool.query(
      `
        INSERT INTO ${this.accountTableSql} (
          account_id,
          email,
          display_name,
          system_roles,
          local_login_id,
          password_hash,
          github_user_id,
          github_login,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz)
        ON CONFLICT (account_id)
        DO UPDATE
        SET email = EXCLUDED.email,
            display_name = EXCLUDED.display_name,
            system_roles = EXCLUDED.system_roles,
            local_login_id = EXCLUDED.local_login_id,
            password_hash = EXCLUDED.password_hash,
            github_user_id = EXCLUDED.github_user_id,
            github_login = EXCLUDED.github_login,
            updated_at = EXCLUDED.updated_at
      `,
      [
        record.accountId.trim(),
        record.email.trim() || 'unknown@ashfox.local',
        record.displayName.trim() || 'User',
        JSON.stringify(systemRoles),
        localLoginId,
        passwordHash,
        githubUserId,
        githubLogin,
        normalizeTimestamp(record.createdAt || now),
        normalizeTimestamp(record.updatedAt || now)
      ]
    );
  }

  async listWorkspaces(accountId: string): Promise<WorkspaceRecord[]> {
    await this.ensureInitialized();
    const pool = this.getPool();
    const normalizedAccountId = String(accountId ?? '').trim();
    if (!normalizedAccountId) {
      const result = await pool.query<WorkspaceRow>(
        `
          SELECT workspace_id, tenant_id, name, mode, created_by, created_at, updated_at
          FROM ${this.workspaceTableSql}
          ORDER BY created_at ASC, workspace_id ASC
        `
      );
      return result.rows.map((row) => ({
        workspaceId: row.workspace_id,
        tenantId: row.tenant_id,
        name: row.name,
        mode: parseWorkspaceMode(row.mode),
        createdBy: row.created_by,
        createdAt: normalizeTimestamp(row.created_at),
        updatedAt: normalizeTimestamp(row.updated_at)
      }));
    }

    const result = await pool.query<WorkspaceListRow>(
      `
        SELECT w.workspace_id, w.tenant_id, w.name, w.mode, w.created_by, w.created_at, w.updated_at,
               m.account_id AS member_account_id
        FROM ${this.workspaceTableSql} AS w
        LEFT JOIN ${this.workspaceMembersTableSql} AS m
          ON m.workspace_id = w.workspace_id
         AND m.account_id = $1
        ORDER BY w.created_at ASC, w.workspace_id ASC
      `,
      [normalizedAccountId]
    );
    return result.rows
      .filter((row) => row.member_account_id === normalizedAccountId)
      .map((row) => ({
        workspaceId: row.workspace_id,
        tenantId: row.tenant_id,
        name: row.name,
        mode: parseWorkspaceMode(row.mode),
        createdBy: row.created_by,
        createdAt: normalizeTimestamp(row.created_at),
        updatedAt: normalizeTimestamp(row.updated_at)
      }));
  }

  async getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null> {
    await this.ensureInitialized();
    const pool = this.getPool();
    const result = await pool.query<WorkspaceRow>(
      `
        SELECT workspace_id, tenant_id, name, mode, created_by, created_at, updated_at
        FROM ${this.workspaceTableSql}
        WHERE workspace_id = $1
        LIMIT 1
      `,
      [workspaceId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      workspaceId: row.workspace_id,
      tenantId: row.tenant_id,
      name: row.name,
      mode: parseWorkspaceMode(row.mode),
      createdBy: row.created_by,
      createdAt: normalizeTimestamp(row.created_at),
      updatedAt: normalizeTimestamp(row.updated_at)
    };
  }

  async upsertWorkspace(record: WorkspaceRecord): Promise<void> {
    await this.ensureInitialized();
    const pool = this.getPool();
    await pool.query(
      `
        INSERT INTO ${this.workspaceTableSql} (
          workspace_id,
          tenant_id,
          name,
          mode,
          created_by,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz)
        ON CONFLICT (workspace_id)
        DO UPDATE
        SET tenant_id = EXCLUDED.tenant_id,
            name = EXCLUDED.name,
            mode = EXCLUDED.mode,
            created_by = EXCLUDED.created_by,
            updated_at = EXCLUDED.updated_at
      `,
      [
        record.workspaceId,
        record.tenantId,
        record.name,
        record.mode,
        record.createdBy,
        normalizeTimestamp(record.createdAt),
        normalizeTimestamp(record.updatedAt)
      ]
    );
  }

  async removeWorkspace(workspaceId: string): Promise<void> {
    await this.ensureInitialized();
    const pool = this.getPool();
    await pool.query('BEGIN');
    try {
      await pool.query(
        `
          DELETE FROM ${this.workspaceAclTableSql}
          WHERE workspace_id = $1
        `,
        [workspaceId]
      );
      await pool.query(
        `
          DELETE FROM ${this.workspaceMembersTableSql}
          WHERE workspace_id = $1
        `,
        [workspaceId]
      );
      await pool.query(
        `
          DELETE FROM ${this.workspaceRolesTableSql}
          WHERE workspace_id = $1
        `,
        [workspaceId]
      );
      await pool.query(
        `
          DELETE FROM ${this.workspaceTableSql}
          WHERE workspace_id = $1
        `,
        [workspaceId]
      );
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }

  async listWorkspaceRoles(workspaceId: string): Promise<WorkspaceRoleStorageRecord[]> {
    await this.ensureInitialized();
    const pool = this.getPool();
    const result = await pool.query<WorkspaceRoleRow>(
      `
        SELECT workspace_id, role_id, name, builtin, permissions, created_at, updated_at
        FROM ${this.workspaceRolesTableSql}
        WHERE workspace_id = $1
        ORDER BY created_at ASC, role_id ASC
      `,
      [workspaceId]
    );
    return result.rows.map((row) => ({
      workspaceId: row.workspace_id,
      roleId: row.role_id,
      name: row.name,
      builtin: parseWorkspaceBuiltinRole(row.builtin),
      permissions: parseWorkspacePermissionArray(row.permissions),
      createdAt: normalizeTimestamp(row.created_at),
      updatedAt: normalizeTimestamp(row.updated_at)
    }));
  }

  async upsertWorkspaceRole(record: WorkspaceRoleStorageRecord): Promise<void> {
    await this.ensureInitialized();
    const pool = this.getPool();
    const permissions = uniqueStrings(record.permissions).filter(isWorkspacePermission);
    await pool.query(
      `
        INSERT INTO ${this.workspaceRolesTableSql} (
          workspace_id,
          role_id,
          name,
          builtin,
          permissions,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz, $7::timestamptz)
        ON CONFLICT (workspace_id, role_id)
        DO UPDATE
        SET name = EXCLUDED.name,
            builtin = EXCLUDED.builtin,
            permissions = EXCLUDED.permissions,
            updated_at = EXCLUDED.updated_at
      `,
      [
        record.workspaceId,
        record.roleId,
        record.name,
        record.builtin,
        JSON.stringify(permissions),
        normalizeTimestamp(record.createdAt),
        normalizeTimestamp(record.updatedAt)
      ]
    );
  }

  async removeWorkspaceRole(workspaceId: string, roleId: string): Promise<void> {
    await this.ensureInitialized();
    const members = await this.listWorkspaceMembers(workspaceId);
    const pool = this.getPool();
    await pool.query('BEGIN');
    try {
      await pool.query(
        `
          DELETE FROM ${this.workspaceRolesTableSql}
          WHERE workspace_id = $1
            AND role_id = $2
        `,
        [workspaceId, roleId]
      );
      await pool.query(
        `
          DELETE FROM ${this.workspaceAclTableSql}
          WHERE workspace_id = $1
            AND role_id = $2
        `,
        [workspaceId, roleId]
      );
      for (const member of members) {
        const roleIds = member.roleIds.filter((existingRoleId) => existingRoleId !== roleId);
        await pool.query(
          `
            UPDATE ${this.workspaceMembersTableSql}
            SET role_ids = $1::jsonb,
                updated_at = NOW()
            WHERE workspace_id = $2
              AND account_id = $3
          `,
          [JSON.stringify(roleIds), workspaceId, member.accountId]
        );
      }
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }

  async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberRecord[]> {
    await this.ensureInitialized();
    const pool = this.getPool();
    const result = await pool.query<WorkspaceMemberRow>(
      `
        SELECT workspace_id, account_id, role_ids, joined_at
        FROM ${this.workspaceMembersTableSql}
        WHERE workspace_id = $1
        ORDER BY joined_at ASC, account_id ASC
      `,
      [workspaceId]
    );
    return result.rows.map((row) => ({
      workspaceId: row.workspace_id,
      accountId: row.account_id,
      roleIds: uniqueStrings(parseJsonStringArray(row.role_ids)),
      joinedAt: normalizeTimestamp(row.joined_at)
    }));
  }

  async upsertWorkspaceMember(record: WorkspaceMemberRecord): Promise<void> {
    await this.ensureInitialized();
    const pool = this.getPool();
    const roleIds = uniqueStrings(record.roleIds);
    await pool.query(
      `
        INSERT INTO ${this.workspaceMembersTableSql} (
          workspace_id,
          account_id,
          role_ids,
          joined_at,
          updated_at
        )
        VALUES ($1, $2, $3::jsonb, $4::timestamptz, NOW())
        ON CONFLICT (workspace_id, account_id)
        DO UPDATE
        SET role_ids = EXCLUDED.role_ids,
            updated_at = NOW()
      `,
      [record.workspaceId, record.accountId, JSON.stringify(roleIds), normalizeTimestamp(record.joinedAt)]
    );
  }

  async removeWorkspaceMember(workspaceId: string, accountId: string): Promise<void> {
    await this.ensureInitialized();
    const pool = this.getPool();
    await pool.query(
      `
        DELETE FROM ${this.workspaceMembersTableSql}
        WHERE workspace_id = $1
          AND account_id = $2
      `,
      [workspaceId, accountId]
    );
  }

  async listWorkspaceFolderAcl(workspaceId: string): Promise<WorkspaceFolderAclRecord[]> {
    await this.ensureInitialized();
    const pool = this.getPool();
    const result = await pool.query<WorkspaceAclRow>(
      `
        SELECT workspace_id, folder_id, role_id, read_effect, write_effect, updated_at
        FROM ${this.workspaceAclTableSql}
        WHERE workspace_id = $1
        ORDER BY folder_id ASC, role_id ASC
      `,
      [workspaceId]
    );
    return result.rows.map((row) => ({
      workspaceId: row.workspace_id,
      folderId: fromAclFolderKey(row.folder_id),
      roleId: row.role_id,
      read: parseWorkspaceAclEffect(row.read_effect),
      write: parseWorkspaceAclEffect(row.write_effect),
      updatedAt: normalizeTimestamp(row.updated_at)
    }));
  }

  async upsertWorkspaceFolderAcl(record: WorkspaceFolderAclRecord): Promise<void> {
    await this.ensureInitialized();
    const pool = this.getPool();
    await pool.query(
      `
        INSERT INTO ${this.workspaceAclTableSql} (
          workspace_id,
          folder_id,
          role_id,
          read_effect,
          write_effect,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
        ON CONFLICT (workspace_id, folder_id, role_id)
        DO UPDATE
        SET read_effect = EXCLUDED.read_effect,
            write_effect = EXCLUDED.write_effect,
            updated_at = EXCLUDED.updated_at
      `,
      [record.workspaceId, toAclFolderKey(record.folderId), record.roleId, record.read, record.write, normalizeTimestamp(record.updatedAt)]
    );
  }

  async removeWorkspaceFolderAcl(workspaceId: string, folderId: string | null, roleId: string): Promise<void> {
    await this.ensureInitialized();
    const pool = this.getPool();
    await pool.query(
      `
        DELETE FROM ${this.workspaceAclTableSql}
        WHERE workspace_id = $1
          AND folder_id = $2
          AND role_id = $3
      `,
      [workspaceId, toAclFolderKey(folderId), roleId]
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
