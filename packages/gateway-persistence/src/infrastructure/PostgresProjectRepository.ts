import { Pool } from 'pg';
import type {
  AccountRecord,
  PersistedProjectRecord,
  ProjectRepository,
  ProjectRepositoryScope,
  ServiceUsersSearchInput,
  ServiceUsersSearchResult,
  ServiceWorkspacesSearchInput,
  ServiceWorkspacesSearchResult,
  ServiceSettingsRecord,
  WorkspaceApiKeyRecord,
  WorkspaceFolderAclRecord,
  WorkspaceMemberRecord,
  WorkspaceRecord,
  WorkspaceRepository,
  WorkspaceRoleStorageRecord
} from '@ashfox/backend-core';
import {
  createDefaultUserRootAcl,
  createDefaultServiceSettings,
  escapeSqlLikePattern,
  fromAclStorageFolderKey,
  normalizeServiceSettings,
  normalizeServiceSearchCursorOffset,
  normalizeServiceSearchLimit,
  normalizeServiceSearchToken,
  normalizeDefaultMemberRoleId,
  normalizeRequiredAccountId,
  normalizeTimestamp,
  parseJsonStringArray,
  parseWorkspaceAclEffect,
  parseWorkspaceBuiltinRole,
  toAclFolderKey,
  toAclStorageFolderKey
} from './workspace/common';
import {
  buildPostgresWorkspaceMigrations,
  normalizePostgresMigrationLedgerSchema,
  seedPostgresWorkspaceTemplate,
  type PostgresWorkspaceMigration
} from './sql/postgresWorkspaceBootstrap';
import { PostgresProjectStateStore } from './sql/projectStateStore';
import { PostgresWorkspaceAccountStore } from './sql/workspaceAccountStore';
import {
  removeWorkspaceAccessMetaPostgres,
  removeWorkspaceCascadePostgres,
  removeWorkspaceRoleCascadePostgres,
  upsertWorkspaceAccessMetaPostgres
} from './sql/workspaceRbacStore';
import { runAsyncUnitOfWork } from './sql/unitOfWork';
import { SqlWorkspaceRepositoryBase } from './workspace/sqlWorkspaceRepositoryBase';
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

type MigrationRow = {
  migration_id?: string | null;
};

type WorkspaceRow = {
  workspace_id: string;
  tenant_id: string;
  name: string;
  default_member_role_id: string | null;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
};

type WorkspaceListRow = WorkspaceRow & {
  member_account_id: string | null;
};

type PostgresAccountRow = {
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

type WorkspaceRoleRow = {
  workspace_id: string;
  role_id: string;
  name: string;
  builtin: string | null;
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

type WorkspaceApiKeyRow = {
  workspace_id: string;
  key_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
  last_used_at: Date | string | null;
  expires_at: Date | string | null;
  revoked_at: Date | string | null;
};

type ServiceSettingsRow = {
  id: string;
  settings_json: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

const toAclTemplateRuleId = (
  scope: 'workspace' | 'folder',
  storageFolderKey: string,
  read: WorkspaceFolderAclRecord['read'],
  write: WorkspaceFolderAclRecord['write'],
  locked: boolean
): string =>
  `acl_${Buffer.from([scope, storageFolderKey, read, write, locked ? '1' : '0'].join('::'), 'utf8').toString('base64url')}`;

const normalizeAclRoleIds = (roleIds: readonly string[]): string[] =>
  Array.from(new Set(roleIds.map((roleId) => String(roleId ?? '').trim()).filter((roleId) => roleId.length > 0)));

const normalizePostgresAccountRecord = (row: PostgresAccountRow): AccountRecord => ({
  accountId: row.account_id,
  email: row.email,
  displayName: row.display_name,
  systemRoles: parseJsonStringArray(row.system_roles).filter(
    (role): role is 'system_admin' | 'cs_admin' => role === 'system_admin' || role === 'cs_admin'
  ),
  localLoginId: row.local_login_id,
  passwordHash: row.password_hash,
  githubUserId: row.github_user_id,
  githubLogin: row.github_login,
  createdAt: normalizeTimestamp(row.created_at),
  updatedAt: normalizeTimestamp(row.updated_at)
});

export class PostgresProjectRepository extends SqlWorkspaceRepositoryBase implements ProjectRepository, WorkspaceRepository {
  private readonly options: PostgresProjectRepositoryOptions;
  private readonly schemaSql: string;
  private readonly tableSql: string;
  private readonly migrationsTableSql: string;
  private readonly workspaceTableSql: string;
  private readonly accountTableSql: string;
  private readonly workspaceMembersTableSql: string;
  private readonly workspaceRolesTableSql: string;
  private readonly workspaceAclTableSql: string;
  private readonly workspaceAccessMetaTableSql: string;
  private readonly workspaceApiKeysTableSql: string;
  private readonly serviceSettingsTableSql: string;
  private readonly projectStateStore: PostgresProjectStateStore;
  private readonly workspaceAccountStore: PostgresWorkspaceAccountStore;
  private pool: PostgresPool | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(options: PostgresProjectRepositoryOptions) {
    super();
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
    this.workspaceAccessMetaTableSql = `${this.schemaSql}.${quoteSqlIdentifier('ashfox_workspace_access_meta', 'table')}`;
    this.workspaceApiKeysTableSql = `${this.schemaSql}.${quoteSqlIdentifier('ashfox_workspace_api_keys', 'table')}`;
    this.serviceSettingsTableSql = `${this.schemaSql}.${quoteSqlIdentifier('ashfox_service_settings', 'table')}`;
    this.projectStateStore = new PostgresProjectStateStore({
      ensureInitialized: async () => this.ensureInitialized(),
      getPool: () => this.getPool(),
      tableSql: this.tableSql,
      parseState: (value) => {
        if (typeof value !== 'string') return value;
        try {
          return JSON.parse(value) as unknown;
        } catch {
          return value;
        }
      },
      normalizeTimestamp,
      escapeLikePattern: (value) => value.replace(/[\\%_]/g, '\\$&')
    });
    this.workspaceAccountStore = new PostgresWorkspaceAccountStore({
      ensureInitialized: async () => this.ensureInitialized(),
      getPool: () => this.getPool(),
      accountTableSql: this.accountTableSql
    });
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
        migration_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL
      )
    `);
    await normalizePostgresMigrationLedgerSchema({
      pool,
      schema: this.options.schema,
      migrationsTableName: this.options.migrationsTableName,
      migrationsTableSql: this.migrationsTableSql
    });
    const existing = await pool.query<MigrationRow>(`SELECT migration_id FROM ${this.migrationsTableSql} WHERE migration_id IS NOT NULL`);
    const appliedMigrationIds = new Set(
      existing.rows
        .map((row) => (typeof row.migration_id === 'string' ? row.migration_id.trim() : ''))
        .filter((migrationId) => migrationId.length > 0)
    );
    const migrations = buildPostgresWorkspaceMigrations({
      tableSql: this.tableSql,
      workspaceTableSql: this.workspaceTableSql,
      accountTableSql: this.accountTableSql,
      workspaceMembersTableSql: this.workspaceMembersTableSql,
      workspaceRolesTableSql: this.workspaceRolesTableSql,
      workspaceAclTableSql: this.workspaceAclTableSql,
      workspaceAccessMetaTableSql: this.workspaceAccessMetaTableSql,
      workspaceApiKeysTableSql: this.workspaceApiKeysTableSql,
      serviceSettingsTableSql: this.serviceSettingsTableSql
    });
    for (const migration of migrations) {
      if (appliedMigrationIds.has(migration.migrationId)) continue;
      await this.applyMigration(pool, migration);
      appliedMigrationIds.add(migration.migrationId);
    }
    await seedPostgresWorkspaceTemplate({
      pool,
      workspaceTableSql: this.workspaceTableSql,
      accountTableSql: this.accountTableSql,
      workspaceRolesTableSql: this.workspaceRolesTableSql,
      workspaceMembersTableSql: this.workspaceMembersTableSql,
      workspaceAccessMetaTableSql: this.workspaceAccessMetaTableSql,
      workspaceAclTableSql: this.workspaceAclTableSql
    });
  }

  private async applyMigration(pool: PostgresPool, migration: PostgresWorkspaceMigration): Promise<void> {
    await pool.query('BEGIN');
    try {
      await pool.query(migration.upSql);
      await pool.query(
        `
          INSERT INTO ${this.migrationsTableSql} (migration_id, name, applied_at)
          SELECT $1, $2, NOW()
          WHERE NOT EXISTS (
            SELECT 1
            FROM ${this.migrationsTableSql}
            WHERE migration_id = $1
          )
        `,
        [migration.migrationId, migration.name]
      );
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }

  async find(scope: ProjectRepositoryScope): Promise<PersistedProjectRecord | null> {
    return this.projectStateStore.find(scope);
  }

  async listByScopePrefix(scope: ProjectRepositoryScope): Promise<PersistedProjectRecord[]> {
    return this.projectStateStore.listByScopePrefix(scope);
  }

  async save(record: PersistedProjectRecord): Promise<void> {
    await this.projectStateStore.save(record);
  }

  async saveIfRevision(record: PersistedProjectRecord, expectedRevision: string | null): Promise<boolean> {
    return this.projectStateStore.saveIfRevision(record, expectedRevision);
  }

  async remove(scope: ProjectRepositoryScope): Promise<void> {
    await this.projectStateStore.remove(scope);
  }

  async getAccount(accountId: string): Promise<AccountRecord | null> {
    return this.workspaceAccountStore.getAccount(accountId);
  }

  async getAccountByLocalLoginId(localLoginId: string): Promise<AccountRecord | null> {
    return this.workspaceAccountStore.getAccountByLocalLoginId(localLoginId);
  }

  async getAccountByGithubUserId(githubUserId: string): Promise<AccountRecord | null> {
    return this.workspaceAccountStore.getAccountByGithubUserId(githubUserId);
  }

  async listAccounts(input?: { query?: string; limit?: number; excludeAccountIds?: readonly string[] }): Promise<AccountRecord[]> {
    return this.workspaceAccountStore.listAccounts(input);
  }

  async searchServiceUsers(input?: ServiceUsersSearchInput): Promise<ServiceUsersSearchResult> {
    await this.ensureInitialized();
    const pool = this.getPool();
    const normalizedQuery = normalizeServiceSearchToken(input?.q);
    const normalizedWorkspaceId = String(input?.workspaceId ?? '').trim();
    const field = input?.field ?? 'any';
    const match = input?.match ?? 'contains';
    const limit = normalizeServiceSearchLimit(input?.limit);
    const offset = normalizeServiceSearchCursorOffset(input?.cursor);
    const whereConditions: string[] = [];
    const params: unknown[] = [];

    const pushParam = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    const buildMatchCondition = (expression: string): string => {
      if (!normalizedQuery) {
        return '1 = 1';
      }
      if (match === 'exact') {
        return `${expression} = ${pushParam(normalizedQuery)}`;
      }
      const escaped = escapeSqlLikePattern(normalizedQuery);
      const token = match === 'prefix' ? `${escaped}%` : `%${escaped}%`;
      return `${expression} LIKE ${pushParam(token)} ESCAPE '\\'`;
    };

    if (normalizedWorkspaceId) {
      whereConditions.push(
        `EXISTS (
          SELECT 1
          FROM ${this.workspaceAccessMetaTableSql} AS access
          WHERE access.workspace_id = ${pushParam(normalizedWorkspaceId)}
            AND access.account_id = a.account_id
        )`
      );
    }

    if (normalizedQuery) {
      const accountExpr = `LOWER(a.account_id)`;
      const emailExpr = `LOWER(a.email)`;
      const displayNameExpr = `LOWER(a.display_name)`;
      const localLoginExpr = `LOWER(COALESCE(a.local_login_id, ''))`;
      const githubLoginExpr = `LOWER(COALESCE(a.github_login, ''))`;
      const fieldExprMap: Record<'accountId' | 'email' | 'displayName' | 'localLoginId' | 'githubLogin', string> = {
        accountId: accountExpr,
        email: emailExpr,
        displayName: displayNameExpr,
        localLoginId: localLoginExpr,
        githubLogin: githubLoginExpr
      };

      if (field === 'any') {
        const parts = [accountExpr, emailExpr, displayNameExpr, localLoginExpr, githubLoginExpr].map((expr) =>
          buildMatchCondition(expr)
        );
        whereConditions.push(`(${parts.join(' OR ')})`);
      } else {
        whereConditions.push(buildMatchCondition(fieldExprMap[field]));
      }
    }

    const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const countResult = await pool.query<{ count: number | string }>(
      `
        SELECT COUNT(*)::int AS count
        FROM ${this.accountTableSql} AS a
        ${whereSql}
      `,
      params
    );
    const totalRaw = countResult.rows[0]?.count ?? 0;
    const total = typeof totalRaw === 'string' ? Number.parseInt(totalRaw, 10) : Number(totalRaw);

    const pagingParams = [...params];
    pagingParams.push(limit);
    const limitPlaceholder = `$${pagingParams.length}`;
    pagingParams.push(offset);
    const offsetPlaceholder = `$${pagingParams.length}`;
    const result = await pool.query<PostgresAccountRow>(
      `
        SELECT
          a.account_id,
          a.email,
          a.display_name,
          a.system_roles,
          a.local_login_id,
          a.password_hash,
          a.github_user_id,
          a.github_login,
          a.created_at,
          a.updated_at
        FROM ${this.accountTableSql} AS a
        ${whereSql}
        ORDER BY a.display_name ASC, a.account_id ASC
        LIMIT ${limitPlaceholder}
        OFFSET ${offsetPlaceholder}
      `,
      pagingParams
    );
    const normalizedTotal = Number.isFinite(total) ? total : 0;
    const nextOffset = offset + result.rows.length;
    return {
      users: result.rows.map((row) => normalizePostgresAccountRecord(row)),
      total: normalizedTotal,
      nextCursor: nextOffset < normalizedTotal ? String(nextOffset) : null
    };
  }

  async searchServiceWorkspaces(input?: ServiceWorkspacesSearchInput): Promise<ServiceWorkspacesSearchResult> {
    await this.ensureInitialized();
    const pool = this.getPool();
    const normalizedQuery = normalizeServiceSearchToken(input?.q);
    const normalizedMemberAccountId = String(input?.memberAccountId ?? '').trim().toLowerCase();
    const field = input?.field ?? 'any';
    const match = input?.match ?? 'contains';
    const limit = normalizeServiceSearchLimit(input?.limit);
    const offset = normalizeServiceSearchCursorOffset(input?.cursor);
    const whereConditions: string[] = [];
    const params: unknown[] = [];

    const pushParam = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    const buildMatchCondition = (expression: string): string => {
      if (!normalizedQuery) {
        return '1 = 1';
      }
      if (match === 'exact') {
        return `${expression} = ${pushParam(normalizedQuery)}`;
      }
      const escaped = normalizedQuery.replace(/[\\%_]/g, '\\$&');
      const token = match === 'prefix' ? `${escaped}%` : `%${escaped}%`;
      return `${expression} LIKE ${pushParam(token)} ESCAPE '\\'`;
    };

    const buildMemberMatchCondition = (token: string): string => {
      if (match === 'exact') {
        return `EXISTS (
          SELECT 1
          FROM ${this.workspaceAccessMetaTableSql} AS access
          WHERE access.workspace_id = w.workspace_id
            AND LOWER(access.account_id) = ${pushParam(token)}
        )`;
      }
      const escaped = escapeSqlLikePattern(token);
      const likeToken = match === 'prefix' ? `${escaped}%` : `%${escaped}%`;
      return `EXISTS (
        SELECT 1
        FROM ${this.workspaceAccessMetaTableSql} AS access
        WHERE access.workspace_id = w.workspace_id
          AND LOWER(access.account_id) LIKE ${pushParam(likeToken)} ESCAPE '\\'
      )`;
    };

    if (normalizedMemberAccountId) {
      whereConditions.push(
        `EXISTS (
          SELECT 1
          FROM ${this.workspaceAccessMetaTableSql} AS access
          WHERE access.workspace_id = w.workspace_id
            AND LOWER(access.account_id) = ${pushParam(normalizedMemberAccountId)}
        )`
      );
    }

    if (normalizedQuery) {
      const workspaceIdExpr = `LOWER(w.workspace_id)`;
      const nameExpr = `LOWER(w.name)`;
      const createdByExpr = `LOWER(w.created_by)`;
      if (field === 'memberAccountId') {
        whereConditions.push(buildMemberMatchCondition(normalizedQuery));
      } else if (field === 'any') {
        const parts = [workspaceIdExpr, nameExpr, createdByExpr].map((expr) => buildMatchCondition(expr));
        parts.push(buildMemberMatchCondition(normalizedQuery));
        whereConditions.push(`(${parts.join(' OR ')})`);
      } else {
        const expressionMap: Record<'workspaceId' | 'name' | 'createdBy', string> = {
          workspaceId: workspaceIdExpr,
          name: nameExpr,
          createdBy: createdByExpr
        };
        whereConditions.push(buildMatchCondition(expressionMap[field]));
      }
    }

    const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const countResult = await pool.query<{ count: number | string }>(
      `
        SELECT COUNT(*)::int AS count
        FROM ${this.workspaceTableSql} AS w
        ${whereSql}
      `,
      params
    );
    const totalRaw = countResult.rows[0]?.count ?? 0;
    const total = typeof totalRaw === 'string' ? Number.parseInt(totalRaw, 10) : Number(totalRaw);

    const pagingParams = [...params];
    pagingParams.push(limit);
    const limitPlaceholder = `$${pagingParams.length}`;
    pagingParams.push(offset);
    const offsetPlaceholder = `$${pagingParams.length}`;
    const result = await pool.query<WorkspaceRow>(
      `
        SELECT w.workspace_id, w.tenant_id, w.name, w.default_member_role_id, w.created_by, w.created_at, w.updated_at
        FROM ${this.workspaceTableSql} AS w
        ${whereSql}
        ORDER BY w.created_at ASC, w.workspace_id ASC
        LIMIT ${limitPlaceholder}
        OFFSET ${offsetPlaceholder}
      `,
      pagingParams
    );
    const normalizedTotal = Number.isFinite(total) ? total : 0;
    const nextOffset = offset + result.rows.length;
    return {
      workspaces: result.rows.map((row) => ({
        workspaceId: row.workspace_id,
        tenantId: row.tenant_id,
        name: row.name,
        defaultMemberRoleId: normalizeDefaultMemberRoleId(row.default_member_role_id),
        createdBy: row.created_by,
        createdAt: normalizeTimestamp(row.created_at),
        updatedAt: normalizeTimestamp(row.updated_at)
      })),
      total: normalizedTotal,
      nextCursor: nextOffset < normalizedTotal ? String(nextOffset) : null
    };
  }

  async upsertAccount(record: AccountRecord): Promise<void> {
    await this.workspaceAccountStore.upsertAccount(record);
  }

  async countAccountsBySystemRole(role: 'system_admin' | 'cs_admin'): Promise<number> {
    return this.workspaceAccountStore.countAccountsBySystemRole(role);
  }

  async updateAccountSystemRoles(
    accountId: string,
    systemRoles: Array<'system_admin' | 'cs_admin'>,
    updatedAt: string
  ): Promise<AccountRecord | null> {
    return this.workspaceAccountStore.updateAccountSystemRoles(accountId, systemRoles, updatedAt);
  }

  async getServiceSettings(): Promise<ServiceSettingsRecord | null> {
    await this.ensureInitialized();
    const pool = this.getPool();
    const result = await pool.query<ServiceSettingsRow>(
      `
        SELECT id, settings_json, created_at, updated_at
        FROM ${this.serviceSettingsTableSql}
        WHERE id = $1
        LIMIT 1
      `,
      ['global']
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const normalized = normalizeServiceSettings(
      row.settings_json,
      createDefaultServiceSettings(normalizeTimestamp(row.updated_at), 'system')
    );
    return {
      ...normalized,
      createdAt: normalizeTimestamp(row.created_at),
      updatedAt: normalizeTimestamp(row.updated_at)
    };
  }

  async upsertServiceSettings(record: ServiceSettingsRecord): Promise<void> {
    await this.ensureInitialized();
    const pool = this.getPool();
    const normalized = normalizeServiceSettings(record, createDefaultServiceSettings(record.updatedAt, record.smtp.updatedBy));
    await pool.query(
      `
        INSERT INTO ${this.serviceSettingsTableSql} (
          id,
          settings_json,
          created_at,
          updated_at
        )
        VALUES ($1, $2::jsonb, $3::timestamptz, $4::timestamptz)
        ON CONFLICT (id)
        DO UPDATE
        SET settings_json = EXCLUDED.settings_json,
            updated_at = EXCLUDED.updated_at
      `,
      ['global', JSON.stringify(normalized), normalizeTimestamp(normalized.createdAt), normalizeTimestamp(normalized.updatedAt)]
    );
  }

  async listAllWorkspaces(): Promise<WorkspaceRecord[]> {
    await this.ensureInitialized();
    const pool = this.getPool();
    const result = await pool.query<WorkspaceRow>(
      `
        SELECT workspace_id, tenant_id, name, default_member_role_id, created_by, created_at, updated_at
        FROM ${this.workspaceTableSql}
        ORDER BY created_at ASC, workspace_id ASC
      `
    );
    return result.rows.map((row) => ({
      workspaceId: row.workspace_id,
      tenantId: row.tenant_id,
      name: row.name,
      defaultMemberRoleId: normalizeDefaultMemberRoleId(row.default_member_role_id),
      createdBy: row.created_by,
      createdAt: normalizeTimestamp(row.created_at),
      updatedAt: normalizeTimestamp(row.updated_at)
    }));
  }

  async listAccountWorkspaces(accountId: string): Promise<WorkspaceRecord[]> {
    await this.ensureInitialized();
    const pool = this.getPool();
    const normalizedAccountId = normalizeRequiredAccountId(accountId, 'listAccountWorkspaces.accountId');

    const result = await pool.query<WorkspaceListRow>(
      `
        SELECT w.workspace_id, w.tenant_id, w.name, w.default_member_role_id, w.created_by, w.created_at, w.updated_at,
               access.account_id AS member_account_id
        FROM ${this.workspaceTableSql} AS w
        INNER JOIN ${this.workspaceAccessMetaTableSql} AS access
          ON access.workspace_id = w.workspace_id
         AND access.account_id = $1
        ORDER BY w.created_at ASC, w.workspace_id ASC
      `,
      [normalizedAccountId]
    );
    return result.rows.map((row) => ({
      workspaceId: row.workspace_id,
      tenantId: row.tenant_id,
      name: row.name,
      defaultMemberRoleId: normalizeDefaultMemberRoleId(row.default_member_role_id),
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
        SELECT workspace_id, tenant_id, name, default_member_role_id, created_by, created_at, updated_at
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
      defaultMemberRoleId: normalizeDefaultMemberRoleId(row.default_member_role_id),
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
          default_member_role_id,
          created_by,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz)
        ON CONFLICT (workspace_id)
        DO UPDATE
        SET tenant_id = EXCLUDED.tenant_id,
            name = EXCLUDED.name,
            default_member_role_id = EXCLUDED.default_member_role_id,
            created_by = EXCLUDED.created_by,
            updated_at = EXCLUDED.updated_at
      `,
      [
        record.workspaceId,
        record.tenantId,
        record.name,
        normalizeDefaultMemberRoleId(record.defaultMemberRoleId),
        record.createdBy,
        normalizeTimestamp(record.createdAt),
        normalizeTimestamp(record.updatedAt)
      ]
    );
    const userRootAcl = createDefaultUserRootAcl(record.workspaceId, normalizeTimestamp(record.updatedAt));
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
        ON CONFLICT (workspace_id, folder_id, role_id) DO NOTHING
      `,
      [
        userRootAcl.workspaceId,
        toAclFolderKey(userRootAcl.folderId),
        userRootAcl.roleIds[0],
        userRootAcl.read,
        userRootAcl.write,
        userRootAcl.updatedAt
      ]
    );
  }

  async removeWorkspace(workspaceId: string): Promise<void> {
    await this.ensureInitialized();
    const pool = this.getPool();
    await removeWorkspaceCascadePostgres(
      pool,
      {
        workspaceTableSql: this.workspaceTableSql,
        workspaceMembersTableSql: this.workspaceMembersTableSql,
        workspaceRolesTableSql: this.workspaceRolesTableSql,
        workspaceAclTableSql: this.workspaceAclTableSql,
        workspaceAccessMetaTableSql: this.workspaceAccessMetaTableSql,
        workspaceApiKeysTableSql: this.workspaceApiKeysTableSql
      },
      workspaceId
    );
  }

  async listWorkspaceRoles(workspaceId: string): Promise<WorkspaceRoleStorageRecord[]> {
    await this.ensureInitialized();
    const pool = this.getPool();
    const result = await pool.query<WorkspaceRoleRow>(
      `
        SELECT workspace_id, role_id, name, builtin, created_at, updated_at
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
      createdAt: normalizeTimestamp(row.created_at),
      updatedAt: normalizeTimestamp(row.updated_at)
    }));
  }

  async upsertWorkspaceRole(record: WorkspaceRoleStorageRecord): Promise<void> {
    await this.ensureInitialized();
    const pool = this.getPool();
    await pool.query(
      `
        INSERT INTO ${this.workspaceRolesTableSql} (
          workspace_id,
          role_id,
          name,
          builtin,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz)
        ON CONFLICT (workspace_id, role_id)
        DO UPDATE
        SET name = EXCLUDED.name,
            builtin = EXCLUDED.builtin,
            updated_at = EXCLUDED.updated_at
      `,
      [
        record.workspaceId,
        record.roleId,
        record.name,
        record.builtin,
        normalizeTimestamp(record.createdAt),
        normalizeTimestamp(record.updatedAt)
      ]
    );
  }

  async removeWorkspaceRole(workspaceId: string, roleId: string): Promise<void> {
    await this.ensureInitialized();
    const members = await this.listWorkspaceMembers(workspaceId);
    const memberRoleUpdates = this.buildMemberRoleRemovalUpdates(members, roleId);
    const pool = this.getPool();
    await removeWorkspaceRoleCascadePostgres(
      pool,
      {
        workspaceTableSql: this.workspaceTableSql,
        workspaceMembersTableSql: this.workspaceMembersTableSql,
        workspaceRolesTableSql: this.workspaceRolesTableSql,
        workspaceAclTableSql: this.workspaceAclTableSql,
        workspaceAccessMetaTableSql: this.workspaceAccessMetaTableSql
      },
      workspaceId,
      roleId,
      memberRoleUpdates
    );
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
      roleIds: this.normalizeMemberRoleIds(parseJsonStringArray(row.role_ids)),
      joinedAt: normalizeTimestamp(row.joined_at)
    }));
  }

  async upsertWorkspaceMember(record: WorkspaceMemberRecord): Promise<void> {
    await this.ensureInitialized();
    const pool = this.getPool();
    const roleIds = this.normalizeMemberRoleIds(record.roleIds);
    await runAsyncUnitOfWork(
      {
        begin: async () => {
          await pool.query('BEGIN');
        },
        commit: async () => {
          await pool.query('COMMIT');
        },
        rollback: async () => {
          await pool.query('ROLLBACK');
        }
      },
      async () => {
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
        await upsertWorkspaceAccessMetaPostgres(
          pool,
          this.workspaceAccessMetaTableSql,
          record.workspaceId,
          record.accountId,
          roleIds
        );
      }
    );
  }

  async removeWorkspaceMember(workspaceId: string, accountId: string): Promise<void> {
    await this.ensureInitialized();
    const pool = this.getPool();
    await runAsyncUnitOfWork(
      {
        begin: async () => {
          await pool.query('BEGIN');
        },
        commit: async () => {
          await pool.query('COMMIT');
        },
        rollback: async () => {
          await pool.query('ROLLBACK');
        }
      },
      async () => {
        await pool.query(
          `
            DELETE FROM ${this.workspaceMembersTableSql}
            WHERE workspace_id = $1
              AND account_id = $2
          `,
          [workspaceId, accountId]
        );
        await removeWorkspaceAccessMetaPostgres(pool, this.workspaceAccessMetaTableSql, workspaceId, accountId);
      }
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
    return result.rows.map((row) => {
      const parsed = fromAclStorageFolderKey(row.folder_id);
      const read = parseWorkspaceAclEffect(row.read_effect);
      const write = parseWorkspaceAclEffect(row.write_effect);
      return {
        ...parsed,
        workspaceId: row.workspace_id,
        ruleId: toAclTemplateRuleId(parsed.scope, row.folder_id, read, write, false),
        roleIds: [row.role_id],
        read,
        write,
        locked: false,
        updatedAt: normalizeTimestamp(row.updated_at)
      };
    });
  }

  async upsertWorkspaceFolderAcl(record: WorkspaceFolderAclRecord): Promise<void> {
    await this.ensureInitialized();
    const pool = this.getPool();
    const normalizedRoleIds = normalizeAclRoleIds(record.roleIds);
    if (normalizedRoleIds.length === 0) {
      return;
    }
    const folderStorageKey = toAclStorageFolderKey(record.scope, record.folderId);
    for (const roleId of normalizedRoleIds) {
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
      [
        record.workspaceId,
        folderStorageKey,
        roleId,
        record.read,
        record.write,
        normalizeTimestamp(record.updatedAt)
      ]
      );
    }
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

  async listWorkspaceApiKeys(workspaceId: string): Promise<WorkspaceApiKeyRecord[]> {
    await this.ensureInitialized();
    const pool = this.getPool();
    const result = await pool.query<WorkspaceApiKeyRow>(
      `
        SELECT
          workspace_id,
          key_id,
          name,
          key_prefix,
          key_hash,
          created_by,
          created_at,
          updated_at,
          last_used_at,
          expires_at,
          revoked_at
        FROM ${this.workspaceApiKeysTableSql}
        WHERE workspace_id = $1
        ORDER BY created_at DESC, key_id ASC
      `,
      [workspaceId]
    );
    return result.rows.map((row) => ({
      workspaceId: row.workspace_id,
      keyId: row.key_id,
      name: row.name,
      keyPrefix: row.key_prefix,
      keyHash: row.key_hash,
      createdBy: row.created_by,
      createdAt: normalizeTimestamp(row.created_at),
      updatedAt: normalizeTimestamp(row.updated_at),
      lastUsedAt: row.last_used_at ? normalizeTimestamp(row.last_used_at) : null,
      expiresAt: row.expires_at ? normalizeTimestamp(row.expires_at) : null,
      revokedAt: row.revoked_at ? normalizeTimestamp(row.revoked_at) : null
    }));
  }

  async createWorkspaceApiKey(record: WorkspaceApiKeyRecord): Promise<void> {
    await this.ensureInitialized();
    const pool = this.getPool();
    await pool.query(
      `
        INSERT INTO ${this.workspaceApiKeysTableSql} (
          workspace_id,
          key_id,
          name,
          key_prefix,
          key_hash,
          created_by,
          created_at,
          updated_at,
          last_used_at,
          expires_at,
          revoked_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9::timestamptz, $10::timestamptz, $11::timestamptz)
      `,
      [
        record.workspaceId,
        record.keyId,
        record.name,
        record.keyPrefix,
        record.keyHash,
        record.createdBy,
        normalizeTimestamp(record.createdAt),
        normalizeTimestamp(record.updatedAt),
        record.lastUsedAt ? normalizeTimestamp(record.lastUsedAt) : null,
        record.expiresAt ? normalizeTimestamp(record.expiresAt) : null,
        record.revokedAt ? normalizeTimestamp(record.revokedAt) : null
      ]
    );
  }

  async revokeWorkspaceApiKey(workspaceId: string, keyId: string, revokedAt: string): Promise<void> {
    await this.ensureInitialized();
    const pool = this.getPool();
    const normalizedRevokedAt = normalizeTimestamp(revokedAt);
    await pool.query(
      `
        UPDATE ${this.workspaceApiKeysTableSql}
        SET revoked_at = $1::timestamptz,
            updated_at = $1::timestamptz
        WHERE workspace_id = $2
          AND key_id = $3
      `,
      [normalizedRevokedAt, workspaceId, keyId]
    );
  }

  async updateWorkspaceApiKeyLastUsed(workspaceId: string, keyId: string, lastUsedAt: string): Promise<void> {
    await this.ensureInitialized();
    const pool = this.getPool();
    const normalizedLastUsedAt = normalizeTimestamp(lastUsedAt);
    await pool.query(
      `
        UPDATE ${this.workspaceApiKeysTableSql}
        SET last_used_at = $1::timestamptz,
            updated_at = $1::timestamptz
        WHERE workspace_id = $2
          AND key_id = $3
      `,
      [normalizedLastUsedAt, workspaceId, keyId]
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
