import { promises as fs } from 'node:fs';
import path from 'node:path';
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
import type { SqliteRepositoryConfig } from '../config';
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
  buildSqliteWorkspaceMigrations,
  normalizeSqliteMigrationLedgerSchema,
  seedSqliteWorkspaceTemplate,
  type SqliteDatabase,
  type SqliteWorkspaceMigration
} from './sql/sqliteWorkspaceBootstrap';
import { SqliteProjectStateStore } from './sql/projectStateStore';
import { SqliteWorkspaceAccountStore } from './sql/workspaceAccountStore';
import {
  removeWorkspaceAccessMetaSqlite,
  removeWorkspaceCascadeSqlite,
  removeWorkspaceRoleCascadeSqlite,
  upsertWorkspaceAccessMetaSqlite
} from './sql/workspaceRbacStore';
import { runSyncUnitOfWork } from './sql/unitOfWork';
import { SqlWorkspaceRepositoryBase } from './workspace/sqlWorkspaceRepositoryBase';
import { quoteSqlIdentifier } from './validation';

type DatabaseSyncConstructor = new (location: string) => SqliteDatabase;

type SqliteMigrationRow = {
  migration_id?: string | null;
};

type SqliteWorkspaceRow = {
  workspace_id: string;
  tenant_id: string;
  name: string;
  default_member_role_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type SqliteAccountRow = {
  account_id: string;
  email: string;
  display_name: string;
  system_roles: string;
  local_login_id: string | null;
  password_hash: string | null;
  github_user_id: string | null;
  github_login: string | null;
  created_at: string;
  updated_at: string;
};

type SqliteWorkspaceRoleRow = {
  workspace_id: string;
  role_id: string;
  name: string;
  builtin: string | null;
  created_at: string;
  updated_at: string;
};

type SqliteWorkspaceMemberRow = {
  workspace_id: string;
  account_id: string;
  role_ids: string;
  joined_at: string;
};

type SqliteWorkspaceAclRow = {
  workspace_id: string;
  folder_id: string;
  role_id: string;
  read_effect: string;
  write_effect: string;
  updated_at: string;
};

type SqliteWorkspaceApiKeyRow = {
  workspace_id: string;
  key_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

type SqliteWorkspaceListRow = SqliteWorkspaceRow & {
  member_account_id: string | null;
};

type SqliteServiceSettingsRow = {
  id: string;
  settings_json: string;
  created_at: string;
  updated_at: string;
};

const ensureIso = normalizeTimestamp;
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

const normalizeWorkspaceRecord = (row: SqliteWorkspaceRow): WorkspaceRecord => ({
  workspaceId: row.workspace_id,
  tenantId: row.tenant_id,
  name: row.name,
  defaultMemberRoleId: normalizeDefaultMemberRoleId(row.default_member_role_id),
  createdBy: row.created_by,
  createdAt: ensureIso(row.created_at),
  updatedAt: ensureIso(row.updated_at)
});

const normalizeAccountRecord = (row: SqliteAccountRow): AccountRecord => ({
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
  createdAt: ensureIso(row.created_at),
  updatedAt: ensureIso(row.updated_at)
});

const loadDatabaseConstructor = (): DatabaseSyncConstructor => {
  type SqliteModule = DatabaseSyncConstructor | { default?: DatabaseSyncConstructor };
  const sqliteModule = require('better-sqlite3') as SqliteModule;
  const constructor = typeof sqliteModule === 'function' ? sqliteModule : sqliteModule.default;
  if (typeof constructor !== 'function') {
    throw new Error('better-sqlite3 Database API is unavailable.');
  }
  return constructor;
};

export class SqliteProjectRepository extends SqlWorkspaceRepositoryBase implements ProjectRepository, WorkspaceRepository {
  private readonly filePath: string;
  private readonly tableSql: string;
  private readonly migrationsTableName: string;
  private readonly migrationsTableSql: string;
  private readonly workspaceTableSql: string;
  private readonly accountTableSql: string;
  private readonly workspaceMembersTableSql: string;
  private readonly workspaceRolesTableSql: string;
  private readonly workspaceAclTableSql: string;
  private readonly workspaceAccessMetaTableSql: string;
  private readonly workspaceApiKeysTableSql: string;
  private readonly serviceSettingsTableSql: string;
  private readonly projectStateStore: SqliteProjectStateStore;
  private readonly workspaceAccountStore: SqliteWorkspaceAccountStore;
  private database: SqliteDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(config: SqliteRepositoryConfig) {
    super();
    this.filePath = path.resolve(config.filePath);
    this.tableSql = quoteSqlIdentifier(config.tableName, 'table');
    this.migrationsTableName = config.migrationsTableName;
    this.migrationsTableSql = quoteSqlIdentifier(config.migrationsTableName, 'table');
    this.workspaceTableSql = quoteSqlIdentifier('ashfox_workspaces', 'table');
    this.accountTableSql = quoteSqlIdentifier('ashfox_accounts', 'table');
    this.workspaceMembersTableSql = quoteSqlIdentifier('ashfox_workspace_members', 'table');
    this.workspaceRolesTableSql = quoteSqlIdentifier('ashfox_workspace_roles', 'table');
    this.workspaceAclTableSql = quoteSqlIdentifier('ashfox_workspace_folder_acl', 'table');
    this.workspaceAccessMetaTableSql = quoteSqlIdentifier('ashfox_workspace_access_meta', 'table');
    this.workspaceApiKeysTableSql = quoteSqlIdentifier('ashfox_workspace_api_keys', 'table');
    this.serviceSettingsTableSql = quoteSqlIdentifier('ashfox_service_settings', 'table');
    this.projectStateStore = new SqliteProjectStateStore({
      getDatabase: async () => this.ensureInitialized(),
      tableSql: this.tableSql,
      parseState: (value) => {
        try {
          return JSON.parse(value) as unknown;
        } catch {
          return value;
        }
      },
      normalizeTimestamp: ensureIso,
      escapeLikePattern: (value) => value.replace(/[\\%_]/g, '\\$&'),
      toChangedRows: (value) => {
        const changes = (value as { changes?: number | bigint } | null | undefined)?.changes;
        if (typeof changes === 'number') return Number.isFinite(changes) ? changes : 0;
        if (typeof changes === 'bigint') {
          const asNumber = Number(changes);
          return Number.isFinite(asNumber) ? asNumber : 0;
        }
        return 0;
      }
    });
    this.workspaceAccountStore = new SqliteWorkspaceAccountStore({
      getDatabase: async () => this.ensureInitialized(),
      accountTableSql: this.accountTableSql
    });
  }

  private getDatabase(): SqliteDatabase {
    if (this.database) return this.database;
    const Database = loadDatabaseConstructor();
    this.database = new Database(this.filePath);
    return this.database;
  }

  private async ensureInitialized(): Promise<SqliteDatabase> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        const db = this.getDatabase();
        db.exec(`
          CREATE TABLE IF NOT EXISTS ${this.migrationsTableSql} (
            migration_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
          )
        `);
        normalizeSqliteMigrationLedgerSchema({
          db,
          migrationsTableSql: this.migrationsTableSql,
          migrationsPragmaTableIdentifier: quoteSqlIdentifier(this.migrationsTableName, 'table')
        });
        const appliedRows = db.prepare(`SELECT migration_id FROM ${this.migrationsTableSql} WHERE migration_id IS NOT NULL`).all() as SqliteMigrationRow[];
        const appliedMigrationIds = new Set(
          appliedRows
            .map((row) => (typeof row.migration_id === 'string' ? row.migration_id.trim() : ''))
            .filter((migrationId) => migrationId.length > 0)
        );
        const migrations = buildSqliteWorkspaceMigrations({
          tableSql: this.tableSql,
          workspaceTableSql: this.workspaceTableSql,
          accountTableSql: this.accountTableSql,
          workspaceMembersTableSql: this.workspaceMembersTableSql,
          workspaceRolesTableSql: this.workspaceRolesTableSql,
          workspaceAclTableSql: this.workspaceAclTableSql,
          workspaceAccessMetaTableSql: this.workspaceAccessMetaTableSql,
          workspaceApiKeysTableSql: this.workspaceApiKeysTableSql,
          serviceSettingsTableSql: this.serviceSettingsTableSql,
          migrationsTableSql: this.migrationsTableSql,
          migrationsPragmaTableIdentifier: quoteSqlIdentifier(this.migrationsTableName, 'table')
        });
        for (const migration of migrations) {
          if (appliedMigrationIds.has(migration.migrationId)) continue;
          this.applyMigration(db, migration);
          appliedMigrationIds.add(migration.migrationId);
        }
        seedSqliteWorkspaceTemplate({
          db,
          workspaceTableSql: this.workspaceTableSql,
          accountTableSql: this.accountTableSql,
          workspaceRolesTableSql: this.workspaceRolesTableSql,
          workspaceMembersTableSql: this.workspaceMembersTableSql,
          workspaceAccessMetaTableSql: this.workspaceAccessMetaTableSql,
          workspaceAclTableSql: this.workspaceAclTableSql
        });
      })();
    }
    await this.initPromise;
    return this.getDatabase();
  }

  private applyMigration(db: SqliteDatabase, migration: SqliteWorkspaceMigration): void {
    db.exec('BEGIN');
    try {
      db.exec(migration.upSql);
      db.prepare(
        `
          INSERT INTO ${this.migrationsTableSql} (migration_id, name, applied_at)
          SELECT ?, ?, ?
          WHERE NOT EXISTS (
            SELECT 1
            FROM ${this.migrationsTableSql}
            WHERE migration_id = ?
          )
        `
      ).run(migration.migrationId, migration.name, new Date().toISOString(), migration.migrationId);
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
    const db = await this.ensureInitialized();
    const normalizedQuery = normalizeServiceSearchToken(input?.q);
    const normalizedWorkspaceId = String(input?.workspaceId ?? '').trim();
    const field = input?.field ?? 'any';
    const match = input?.match ?? 'contains';
    const limit = normalizeServiceSearchLimit(input?.limit);
    const offset = normalizeServiceSearchCursorOffset(input?.cursor);
    const whereConditions: string[] = [];
    const params: unknown[] = [];

    const buildMatch = (expression: string): { sql: string; value: string } => {
      if (!normalizedQuery) {
        return { sql: '1 = 1', value: '' };
      }
      if (match === 'exact') {
        return { sql: `${expression} = ?`, value: normalizedQuery };
      }
      const escaped = escapeSqlLikePattern(normalizedQuery);
      return {
        sql: `${expression} LIKE ? ESCAPE '\\'`,
        value: match === 'prefix' ? `${escaped}%` : `%${escaped}%`
      };
    };

    if (normalizedWorkspaceId) {
      whereConditions.push(
        `EXISTS (
          SELECT 1
          FROM ${this.workspaceAccessMetaTableSql} AS access
          WHERE access.workspace_id = ?
            AND access.account_id = a.account_id
        )`
      );
      params.push(normalizedWorkspaceId);
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
        const candidates = [accountExpr, emailExpr, displayNameExpr, localLoginExpr, githubLoginExpr];
        const conditionParts: string[] = [];
        for (const candidate of candidates) {
          const built = buildMatch(candidate);
          conditionParts.push(built.sql);
          params.push(built.value);
        }
        whereConditions.push(`(${conditionParts.join(' OR ')})`);
      } else {
        const built = buildMatch(fieldExprMap[field]);
        whereConditions.push(built.sql);
        params.push(built.value);
      }
    }

    const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const countRow = db.prepare(
      `
        SELECT COUNT(*) AS count
        FROM ${this.accountTableSql} AS a
        ${whereSql}
      `
    ).get(...params) as { count?: number | string } | undefined;
    const total = Number(countRow?.count ?? 0) || 0;
    const rows = db.prepare(
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
        LIMIT ?
        OFFSET ?
      `
    ).all(...params, limit, offset) as SqliteAccountRow[];
    const nextOffset = offset + rows.length;
    return {
      users: rows.map((row) => normalizeAccountRecord(row)),
      total,
      nextCursor: nextOffset < total ? String(nextOffset) : null
    };
  }

  async searchServiceWorkspaces(input?: ServiceWorkspacesSearchInput): Promise<ServiceWorkspacesSearchResult> {
    const db = await this.ensureInitialized();
    const normalizedQuery = normalizeServiceSearchToken(input?.q);
    const normalizedMemberAccountId = String(input?.memberAccountId ?? '').trim().toLowerCase();
    const field = input?.field ?? 'any';
    const match = input?.match ?? 'contains';
    const limit = normalizeServiceSearchLimit(input?.limit);
    const offset = normalizeServiceSearchCursorOffset(input?.cursor);
    const whereConditions: string[] = [];
    const params: unknown[] = [];

    const buildMatch = (expression: string): { sql: string; value: string } => {
      if (!normalizedQuery) {
        return { sql: '1 = 1', value: '' };
      }
      if (match === 'exact') {
        return { sql: `${expression} = ?`, value: normalizedQuery };
      }
      const escaped = escapeSqlLikePattern(normalizedQuery);
      return {
        sql: `${expression} LIKE ? ESCAPE '\\'`,
        value: match === 'prefix' ? `${escaped}%` : `%${escaped}%`
      };
    };

    const buildMemberPredicate = (token: string): { sql: string; value: string } => {
      if (match === 'exact') {
        return {
          sql: `EXISTS (
            SELECT 1
            FROM ${this.workspaceAccessMetaTableSql} AS access
            WHERE access.workspace_id = w.workspace_id
              AND LOWER(access.account_id) = ?
          )`,
          value: token
        };
      }
      const escaped = escapeSqlLikePattern(token);
      return {
        sql: `EXISTS (
          SELECT 1
          FROM ${this.workspaceAccessMetaTableSql} AS access
          WHERE access.workspace_id = w.workspace_id
            AND LOWER(access.account_id) LIKE ? ESCAPE '\\'
        )`,
        value: match === 'prefix' ? `${escaped}%` : `%${escaped}%`
      };
    };

    if (normalizedMemberAccountId) {
      whereConditions.push(
        `EXISTS (
          SELECT 1
          FROM ${this.workspaceAccessMetaTableSql} AS access
          WHERE access.workspace_id = w.workspace_id
            AND LOWER(access.account_id) = ?
        )`
      );
      params.push(normalizedMemberAccountId);
    }

    if (normalizedQuery) {
      const workspaceIdExpr = `LOWER(w.workspace_id)`;
      const nameExpr = `LOWER(w.name)`;
      const createdByExpr = `LOWER(w.created_by)`;
      if (field === 'memberAccountId') {
        const memberPredicate = buildMemberPredicate(normalizedQuery);
        whereConditions.push(memberPredicate.sql);
        params.push(memberPredicate.value);
      } else if (field === 'any') {
        const candidates = [workspaceIdExpr, nameExpr, createdByExpr];
        const parts: string[] = [];
        for (const candidate of candidates) {
          const built = buildMatch(candidate);
          parts.push(built.sql);
          params.push(built.value);
        }
        const memberPredicate = buildMemberPredicate(normalizedQuery);
        parts.push(memberPredicate.sql);
        params.push(memberPredicate.value);
        whereConditions.push(`(${parts.join(' OR ')})`);
      } else {
        const expressionMap: Record<'workspaceId' | 'name' | 'createdBy', string> = {
          workspaceId: workspaceIdExpr,
          name: nameExpr,
          createdBy: createdByExpr
        };
        const built = buildMatch(expressionMap[field]);
        whereConditions.push(built.sql);
        params.push(built.value);
      }
    }

    const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const countRow = db.prepare(
      `
        SELECT COUNT(*) AS count
        FROM ${this.workspaceTableSql} AS w
        ${whereSql}
      `
    ).get(...params) as { count?: number | string } | undefined;
    const total = Number(countRow?.count ?? 0) || 0;
    const rows = db.prepare(
      `
        SELECT w.workspace_id, w.tenant_id, w.name, w.default_member_role_id, w.created_by, w.created_at, w.updated_at
        FROM ${this.workspaceTableSql} AS w
        ${whereSql}
        ORDER BY w.created_at ASC, w.workspace_id ASC
        LIMIT ?
        OFFSET ?
      `
    ).all(...params, limit, offset) as SqliteWorkspaceRow[];
    const nextOffset = offset + rows.length;
    return {
      workspaces: rows.map((row) => normalizeWorkspaceRecord(row)),
      total,
      nextCursor: nextOffset < total ? String(nextOffset) : null
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
    const db = await this.ensureInitialized();
    const row = db.prepare(
      `
        SELECT id, settings_json, created_at, updated_at
        FROM ${this.serviceSettingsTableSql}
        WHERE id = ?
        LIMIT 1
      `
    ).get('global') as SqliteServiceSettingsRow | undefined;
    if (!row) {
      return null;
    }
    const parsed = (() => {
      try {
        return JSON.parse(row.settings_json) as unknown;
      } catch {
        return null;
      }
    })();
    const normalized = normalizeServiceSettings(parsed, createDefaultServiceSettings(row.updated_at, 'system'));
    return {
      ...normalized,
      createdAt: ensureIso(row.created_at),
      updatedAt: ensureIso(row.updated_at)
    };
  }

  async upsertServiceSettings(record: ServiceSettingsRecord): Promise<void> {
    const db = await this.ensureInitialized();
    const normalized = normalizeServiceSettings(record, createDefaultServiceSettings(record.updatedAt, record.smtp.updatedBy));
    db.prepare(
      `
        INSERT INTO ${this.serviceSettingsTableSql} (
          id,
          settings_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?)
        ON CONFLICT (id)
        DO UPDATE
        SET settings_json = excluded.settings_json,
            updated_at = excluded.updated_at
      `
    ).run('global', JSON.stringify(normalized), ensureIso(normalized.createdAt), ensureIso(normalized.updatedAt));
  }

  async listAllWorkspaces(): Promise<WorkspaceRecord[]> {
    const db = await this.ensureInitialized();
    const rows = db.prepare(
      `
        SELECT workspace_id, tenant_id, name, default_member_role_id, created_by, created_at, updated_at
        FROM ${this.workspaceTableSql}
        ORDER BY created_at ASC, workspace_id ASC
      `
    ).all() as SqliteWorkspaceRow[];
    return rows.map((row) => normalizeWorkspaceRecord(row));
  }

  async listAccountWorkspaces(accountId: string): Promise<WorkspaceRecord[]> {
    const db = await this.ensureInitialized();
    const normalizedAccountId = normalizeRequiredAccountId(accountId, 'listAccountWorkspaces.accountId');

    const rows = db.prepare(
      `
        SELECT w.workspace_id, w.tenant_id, w.name, w.default_member_role_id, w.created_by, w.created_at, w.updated_at,
               access.account_id AS member_account_id
        FROM ${this.workspaceTableSql} AS w
        INNER JOIN ${this.workspaceAccessMetaTableSql} AS access
          ON access.workspace_id = w.workspace_id
         AND access.account_id = ?
        ORDER BY w.created_at ASC, w.workspace_id ASC
      `
    ).all(normalizedAccountId) as SqliteWorkspaceListRow[];

    return rows.map((row) => normalizeWorkspaceRecord(row));
  }

  async getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null> {
    const db = await this.ensureInitialized();
    const row = db.prepare(
      `
        SELECT workspace_id, tenant_id, name, default_member_role_id, created_by, created_at, updated_at
        FROM ${this.workspaceTableSql}
        WHERE workspace_id = ?
        LIMIT 1
      `
    ).get(workspaceId) as SqliteWorkspaceRow | undefined;
    return row ? normalizeWorkspaceRecord(row) : null;
  }

  async upsertWorkspace(record: WorkspaceRecord): Promise<void> {
    const db = await this.ensureInitialized();
    db.prepare(
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
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (workspace_id)
        DO UPDATE
        SET tenant_id = excluded.tenant_id,
            name = excluded.name,
            default_member_role_id = excluded.default_member_role_id,
            created_by = excluded.created_by,
            updated_at = excluded.updated_at
      `
    ).run(
      record.workspaceId,
      record.tenantId,
      record.name,
      normalizeDefaultMemberRoleId(record.defaultMemberRoleId),
      record.createdBy,
      ensureIso(record.createdAt),
      ensureIso(record.updatedAt)
    );
    const userRootAcl = createDefaultUserRootAcl(record.workspaceId, ensureIso(record.updatedAt));
    db.prepare(
      `
        INSERT INTO ${this.workspaceAclTableSql} (
          workspace_id,
          folder_id,
          role_id,
          read_effect,
          write_effect,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (workspace_id, folder_id, role_id)
        DO NOTHING
      `
    ).run(
      userRootAcl.workspaceId,
      toAclFolderKey(userRootAcl.folderId),
      userRootAcl.roleIds[0],
      userRootAcl.read,
      userRootAcl.write,
      userRootAcl.updatedAt
    );
  }

  async removeWorkspace(workspaceId: string): Promise<void> {
    const db = await this.ensureInitialized();
    removeWorkspaceCascadeSqlite(
      db,
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
    const db = await this.ensureInitialized();
    const rows = db.prepare(
      `
        SELECT workspace_id, role_id, name, builtin, created_at, updated_at
        FROM ${this.workspaceRolesTableSql}
        WHERE workspace_id = ?
        ORDER BY created_at ASC, role_id ASC
      `
    ).all(workspaceId) as SqliteWorkspaceRoleRow[];
    return rows.map((row) => ({
      workspaceId: row.workspace_id,
      roleId: row.role_id,
      name: row.name,
      builtin: parseWorkspaceBuiltinRole(row.builtin),
      createdAt: ensureIso(row.created_at),
      updatedAt: ensureIso(row.updated_at)
    }));
  }

  async upsertWorkspaceRole(record: WorkspaceRoleStorageRecord): Promise<void> {
    const db = await this.ensureInitialized();
    db.prepare(
      `
        INSERT INTO ${this.workspaceRolesTableSql} (
          workspace_id,
          role_id,
          name,
          builtin,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (workspace_id, role_id)
        DO UPDATE
        SET name = excluded.name,
            builtin = excluded.builtin,
            updated_at = excluded.updated_at
      `
    ).run(
      record.workspaceId,
      record.roleId,
      record.name,
      record.builtin,
      ensureIso(record.createdAt),
      ensureIso(record.updatedAt)
    );
  }

  async removeWorkspaceRole(workspaceId: string, roleId: string): Promise<void> {
    const db = await this.ensureInitialized();
    const members = await this.listWorkspaceMembers(workspaceId);
    const memberRoleUpdates = this.buildMemberRoleRemovalUpdates(members, roleId);
    removeWorkspaceRoleCascadeSqlite(
      db,
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
    const db = await this.ensureInitialized();
    const rows = db.prepare(
      `
        SELECT workspace_id, account_id, role_ids, joined_at
        FROM ${this.workspaceMembersTableSql}
        WHERE workspace_id = ?
        ORDER BY joined_at ASC, account_id ASC
      `
    ).all(workspaceId) as SqliteWorkspaceMemberRow[];
    return rows.map((row) => ({
      workspaceId: row.workspace_id,
      accountId: row.account_id,
      roleIds: this.normalizeMemberRoleIds(parseJsonStringArray(row.role_ids)),
      joinedAt: ensureIso(row.joined_at)
    }));
  }

  async upsertWorkspaceMember(record: WorkspaceMemberRecord): Promise<void> {
    const db = await this.ensureInitialized();
    const roleIds = this.normalizeMemberRoleIds(record.roleIds);
    const now = new Date().toISOString();
    runSyncUnitOfWork(
      {
        begin: () => {
          db.exec('BEGIN');
        },
        commit: () => {
          db.exec('COMMIT');
        },
        rollback: () => {
          db.exec('ROLLBACK');
        }
      },
      () => {
        db.prepare(
          `
            INSERT INTO ${this.workspaceMembersTableSql} (
              workspace_id,
              account_id,
              role_ids,
              joined_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (workspace_id, account_id)
            DO UPDATE
            SET role_ids = excluded.role_ids,
                updated_at = excluded.updated_at
          `
        ).run(record.workspaceId, record.accountId, JSON.stringify(roleIds), ensureIso(record.joinedAt), now);
        upsertWorkspaceAccessMetaSqlite(
          db,
          this.workspaceAccessMetaTableSql,
          record.workspaceId,
          record.accountId,
          roleIds,
          now
        );
      }
    );
  }

  async removeWorkspaceMember(workspaceId: string, accountId: string): Promise<void> {
    const db = await this.ensureInitialized();
    runSyncUnitOfWork(
      {
        begin: () => {
          db.exec('BEGIN');
        },
        commit: () => {
          db.exec('COMMIT');
        },
        rollback: () => {
          db.exec('ROLLBACK');
        }
      },
      () => {
        db.prepare(
          `
            DELETE FROM ${this.workspaceMembersTableSql}
            WHERE workspace_id = ?
              AND account_id = ?
          `
        ).run(workspaceId, accountId);
        removeWorkspaceAccessMetaSqlite(db, this.workspaceAccessMetaTableSql, workspaceId, accountId);
      }
    );
  }

  async listWorkspaceFolderAcl(workspaceId: string): Promise<WorkspaceFolderAclRecord[]> {
    const db = await this.ensureInitialized();
    const rows = db.prepare(
      `
        SELECT workspace_id, folder_id, role_id, read_effect, write_effect, updated_at
        FROM ${this.workspaceAclTableSql}
        WHERE workspace_id = ?
        ORDER BY folder_id ASC, role_id ASC
      `
    ).all(workspaceId) as SqliteWorkspaceAclRow[];
    return rows.map((row) => {
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
        updatedAt: ensureIso(row.updated_at)
      };
    });
  }

  async upsertWorkspaceFolderAcl(record: WorkspaceFolderAclRecord): Promise<void> {
    const db = await this.ensureInitialized();
    const normalizedRoleIds = normalizeAclRoleIds(record.roleIds);
    if (normalizedRoleIds.length === 0) {
      return;
    }
    const folderStorageKey = toAclStorageFolderKey(record.scope, record.folderId);
    const statement = db.prepare(
      `
        INSERT INTO ${this.workspaceAclTableSql} (
          workspace_id,
          folder_id,
          role_id,
          read_effect,
          write_effect,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (workspace_id, folder_id, role_id)
        DO UPDATE
        SET read_effect = excluded.read_effect,
            write_effect = excluded.write_effect,
            updated_at = excluded.updated_at
      `
    );
    for (const roleId of normalizedRoleIds) {
      statement.run(record.workspaceId, folderStorageKey, roleId, record.read, record.write, ensureIso(record.updatedAt));
    }
  }

  async removeWorkspaceFolderAcl(workspaceId: string, folderId: string | null, roleId: string): Promise<void> {
    const db = await this.ensureInitialized();
    db.prepare(
      `
        DELETE FROM ${this.workspaceAclTableSql}
        WHERE workspace_id = ?
          AND folder_id = ?
          AND role_id = ?
      `
    ).run(workspaceId, toAclFolderKey(folderId), roleId);
  }

  async listWorkspaceApiKeys(workspaceId: string): Promise<WorkspaceApiKeyRecord[]> {
    const db = await this.ensureInitialized();
    const rows = db.prepare(
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
        WHERE workspace_id = ?
        ORDER BY created_at DESC, key_id ASC
      `
    ).all(workspaceId) as SqliteWorkspaceApiKeyRow[];
    return rows.map((row) => ({
      workspaceId: row.workspace_id,
      keyId: row.key_id,
      name: row.name,
      keyPrefix: row.key_prefix,
      keyHash: row.key_hash,
      createdBy: row.created_by,
      createdAt: ensureIso(row.created_at),
      updatedAt: ensureIso(row.updated_at),
      lastUsedAt: row.last_used_at ? ensureIso(row.last_used_at) : null,
      expiresAt: row.expires_at ? ensureIso(row.expires_at) : null,
      revokedAt: row.revoked_at ? ensureIso(row.revoked_at) : null
    }));
  }

  async createWorkspaceApiKey(record: WorkspaceApiKeyRecord): Promise<void> {
    const db = await this.ensureInitialized();
    db.prepare(
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      record.workspaceId,
      record.keyId,
      record.name,
      record.keyPrefix,
      record.keyHash,
      record.createdBy,
      ensureIso(record.createdAt),
      ensureIso(record.updatedAt),
      record.lastUsedAt ? ensureIso(record.lastUsedAt) : null,
      record.expiresAt ? ensureIso(record.expiresAt) : null,
      record.revokedAt ? ensureIso(record.revokedAt) : null
    );
  }

  async revokeWorkspaceApiKey(workspaceId: string, keyId: string, revokedAt: string): Promise<void> {
    const db = await this.ensureInitialized();
    db.prepare(
      `
        UPDATE ${this.workspaceApiKeysTableSql}
        SET revoked_at = ?,
            updated_at = ?
        WHERE workspace_id = ?
          AND key_id = ?
      `
    ).run(ensureIso(revokedAt), ensureIso(revokedAt), workspaceId, keyId);
  }

  async updateWorkspaceApiKeyLastUsed(workspaceId: string, keyId: string, lastUsedAt: string): Promise<void> {
    const db = await this.ensureInitialized();
    db.prepare(
      `
        UPDATE ${this.workspaceApiKeysTableSql}
        SET last_used_at = ?,
            updated_at = ?
        WHERE workspace_id = ?
          AND key_id = ?
      `
    ).run(ensureIso(lastUsedAt), ensureIso(lastUsedAt), workspaceId, keyId);
  }

  async close(): Promise<void> {
    if (!this.database) return;
    const current = this.database;
    this.database = null;
    this.initPromise = null;
    current.close();
  }
}
