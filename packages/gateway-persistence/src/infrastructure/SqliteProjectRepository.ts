import { promises as fs } from 'node:fs';
import path from 'node:path';
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
import type { SqliteRepositoryConfig } from '../config';
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

type SqliteProjectRow = {
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

type SqliteWorkspaceRow = {
  workspace_id: string;
  tenant_id: string;
  name: string;
  mode: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type SqliteWorkspaceRoleRow = {
  workspace_id: string;
  role_id: string;
  name: string;
  builtin: string | null;
  permissions: string;
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

type SqliteWorkspaceListRow = SqliteWorkspaceRow & {
  member_account_id: string | null;
};

const ensureIso = normalizeTimestamp;

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

const parseSystemRoles = (value: unknown): Array<'system_admin' | 'cs_admin'> =>
  parseJsonStringArray(value).filter((role): role is 'system_admin' | 'cs_admin' => role === 'system_admin' || role === 'cs_admin');

const normalizeAccountRecord = (row: SqliteAccountRow): AccountRecord => ({
  accountId: row.account_id,
  email: row.email,
  displayName: row.display_name,
  systemRoles: parseSystemRoles(row.system_roles),
  localLoginId: row.local_login_id,
  passwordHash: row.password_hash,
  githubUserId: row.github_user_id,
  githubLogin: row.github_login,
  createdAt: ensureIso(row.created_at),
  updatedAt: ensureIso(row.updated_at)
});

const normalizeWorkspaceRecord = (row: SqliteWorkspaceRow): WorkspaceRecord => ({
  workspaceId: row.workspace_id,
  tenantId: row.tenant_id,
  name: row.name,
  mode: parseWorkspaceMode(row.mode),
  createdBy: row.created_by,
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

export class SqliteProjectRepository implements ProjectRepository, WorkspaceRepository {
  private readonly filePath: string;
  private readonly tableSql: string;
  private readonly migrationsTableSql: string;
  private readonly workspaceTableSql: string;
  private readonly accountTableSql: string;
  private readonly workspaceMembersTableSql: string;
  private readonly workspaceRolesTableSql: string;
  private readonly workspaceAclTableSql: string;
  private database: SqliteDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(config: SqliteRepositoryConfig) {
    this.filePath = path.resolve(config.filePath);
    this.tableSql = quoteSqlIdentifier(config.tableName, 'table');
    this.migrationsTableSql = quoteSqlIdentifier(config.migrationsTableName, 'table');
    this.workspaceTableSql = quoteSqlIdentifier('ashfox_workspaces', 'table');
    this.accountTableSql = quoteSqlIdentifier('ashfox_accounts', 'table');
    this.workspaceMembersTableSql = quoteSqlIdentifier('ashfox_workspace_members', 'table');
    this.workspaceRolesTableSql = quoteSqlIdentifier('ashfox_workspace_roles', 'table');
    this.workspaceAclTableSql = quoteSqlIdentifier('ashfox_workspace_folder_acl', 'table');
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
        this.seedDefaultWorkspaceTemplate(db);
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
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS ${this.accountTableSql} (
            account_id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            display_name TEXT NOT NULL,
            system_roles TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS ${this.workspaceMembersTableSql} (
            workspace_id TEXT NOT NULL,
            account_id TEXT NOT NULL,
            role_ids TEXT NOT NULL,
            joined_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (workspace_id, account_id)
          );
          CREATE TABLE IF NOT EXISTS ${this.workspaceRolesTableSql} (
            workspace_id TEXT NOT NULL,
            role_id TEXT NOT NULL,
            name TEXT NOT NULL,
            builtin TEXT NULL,
            permissions TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (workspace_id, role_id)
          );
          CREATE TABLE IF NOT EXISTS ${this.workspaceAclTableSql} (
            workspace_id TEXT NOT NULL,
            folder_id TEXT NOT NULL,
            role_id TEXT NOT NULL,
            read_effect TEXT NOT NULL,
            write_effect TEXT NOT NULL,
            updated_at TEXT NOT NULL,
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
          ALTER TABLE ${this.accountTableSql} ADD COLUMN local_login_id TEXT NULL;
          ALTER TABLE ${this.accountTableSql} ADD COLUMN password_hash TEXT NULL;
          ALTER TABLE ${this.accountTableSql} ADD COLUMN github_user_id TEXT NULL;
          ALTER TABLE ${this.accountTableSql} ADD COLUMN github_login TEXT NULL;
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

  private seedDefaultWorkspaceTemplate(db: SqliteDatabase): void {
    const now = new Date().toISOString();
    const seed = createWorkspaceSeedTemplate(now);
    db.prepare(
      `
        INSERT OR IGNORE INTO ${this.workspaceTableSql} (
          workspace_id,
          tenant_id,
          name,
          mode,
          created_by,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      seed.workspace.workspaceId,
      seed.workspace.tenantId,
      seed.workspace.name,
      seed.workspace.mode,
      seed.workspace.createdBy,
      seed.workspace.createdAt,
      seed.workspace.updatedAt
    );

    db.prepare(
      `
        INSERT OR IGNORE INTO ${this.accountTableSql} (
          account_id,
          email,
          display_name,
          system_roles,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `
    ).run(
      seed.systemAccount.accountId,
      seed.systemAccount.email,
      seed.systemAccount.displayName,
      JSON.stringify(seed.systemAccount.systemRoles),
      seed.systemAccount.createdAt,
      seed.systemAccount.updatedAt
    );

    db.prepare(
      `
        INSERT OR IGNORE INTO ${this.workspaceRolesTableSql} (
          workspace_id,
          role_id,
          name,
          builtin,
          permissions,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      seed.roles[0].workspaceId,
      seed.roles[0].roleId,
      seed.roles[0].name,
      seed.roles[0].builtin,
      JSON.stringify(seed.roles[0].permissions),
      seed.roles[0].createdAt,
      seed.roles[0].updatedAt
    );

    db.prepare(
      `
        INSERT OR IGNORE INTO ${this.workspaceRolesTableSql} (
          workspace_id,
          role_id,
          name,
          builtin,
          permissions,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      seed.roles[1].workspaceId,
      seed.roles[1].roleId,
      seed.roles[1].name,
      seed.roles[1].builtin,
      JSON.stringify(seed.roles[1].permissions),
      seed.roles[1].createdAt,
      seed.roles[1].updatedAt
    );

    db.prepare(
      `
        INSERT OR IGNORE INTO ${this.workspaceMembersTableSql} (
          workspace_id,
          account_id,
          role_ids,
          joined_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?)
      `
    ).run(
      seed.member.workspaceId,
      seed.member.accountId,
      JSON.stringify(seed.member.roleIds),
      seed.member.joinedAt,
      now
    );
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
      .get(scope.tenantId, scope.projectId) as SqliteProjectRow | undefined;
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

  async getAccount(accountId: string): Promise<AccountRecord | null> {
    const db = await this.ensureInitialized();
    const row = db.prepare(
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
        WHERE account_id = ?
        LIMIT 1
      `
    ).get(accountId) as SqliteAccountRow | undefined;
    return row ? normalizeAccountRecord(row) : null;
  }

  async getAccountByLocalLoginId(localLoginId: string): Promise<AccountRecord | null> {
    const db = await this.ensureInitialized();
    const normalizedLoginId = localLoginId.trim().toLowerCase();
    if (!normalizedLoginId) {
      return null;
    }
    const row = db.prepare(
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
        WHERE local_login_id = ?
        LIMIT 1
      `
    ).get(normalizedLoginId) as SqliteAccountRow | undefined;
    return row ? normalizeAccountRecord(row) : null;
  }

  async getAccountByGithubUserId(githubUserId: string): Promise<AccountRecord | null> {
    const db = await this.ensureInitialized();
    const normalizedGithubUserId = githubUserId.trim();
    if (!normalizedGithubUserId) {
      return null;
    }
    const row = db.prepare(
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
        WHERE github_user_id = ?
        LIMIT 1
      `
    ).get(normalizedGithubUserId) as SqliteAccountRow | undefined;
    return row ? normalizeAccountRecord(row) : null;
  }

  async upsertAccount(record: AccountRecord): Promise<void> {
    const db = await this.ensureInitialized();
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

    db.prepare(
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (account_id)
        DO UPDATE
        SET email = excluded.email,
            display_name = excluded.display_name,
            system_roles = excluded.system_roles,
            local_login_id = excluded.local_login_id,
            password_hash = excluded.password_hash,
            github_user_id = excluded.github_user_id,
            github_login = excluded.github_login,
            updated_at = excluded.updated_at
      `
    ).run(
      record.accountId.trim(),
      record.email.trim() || 'unknown@ashfox.local',
      record.displayName.trim() || 'User',
      JSON.stringify(systemRoles),
      localLoginId,
      passwordHash,
      githubUserId,
      githubLogin,
      ensureIso(record.createdAt || now),
      ensureIso(record.updatedAt || now)
    );
  }

  async listWorkspaces(accountId: string): Promise<WorkspaceRecord[]> {
    const db = await this.ensureInitialized();
    const normalizedAccountId = String(accountId ?? '').trim();
    if (!normalizedAccountId) {
      const rows = db.prepare(
        `
          SELECT workspace_id, tenant_id, name, mode, created_by, created_at, updated_at
          FROM ${this.workspaceTableSql}
          ORDER BY created_at ASC, workspace_id ASC
        `
      ).all() as SqliteWorkspaceRow[];
      return rows.map((row) => normalizeWorkspaceRecord(row));
    }

    const rows = db.prepare(
      `
        SELECT w.workspace_id, w.tenant_id, w.name, w.mode, w.created_by, w.created_at, w.updated_at,
               m.account_id AS member_account_id
        FROM ${this.workspaceTableSql} AS w
        LEFT JOIN ${this.workspaceMembersTableSql} AS m
          ON m.workspace_id = w.workspace_id
         AND m.account_id = ?
        ORDER BY w.created_at ASC, w.workspace_id ASC
      `
    ).all(normalizedAccountId) as SqliteWorkspaceListRow[];

    return rows.filter((row) => row.member_account_id === normalizedAccountId).map((row) => normalizeWorkspaceRecord(row));
  }

  async getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null> {
    const db = await this.ensureInitialized();
    const row = db.prepare(
      `
        SELECT workspace_id, tenant_id, name, mode, created_by, created_at, updated_at
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
          mode,
          created_by,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (workspace_id)
        DO UPDATE
        SET tenant_id = excluded.tenant_id,
            name = excluded.name,
            mode = excluded.mode,
            created_by = excluded.created_by,
            updated_at = excluded.updated_at
      `
    ).run(
      record.workspaceId,
      record.tenantId,
      record.name,
      record.mode,
      record.createdBy,
      ensureIso(record.createdAt),
      ensureIso(record.updatedAt)
    );
  }

  async removeWorkspace(workspaceId: string): Promise<void> {
    const db = await this.ensureInitialized();
    db.exec('BEGIN');
    try {
      db.prepare(
        `
          DELETE FROM ${this.workspaceAclTableSql}
          WHERE workspace_id = ?
        `
      ).run(workspaceId);
      db.prepare(
        `
          DELETE FROM ${this.workspaceMembersTableSql}
          WHERE workspace_id = ?
        `
      ).run(workspaceId);
      db.prepare(
        `
          DELETE FROM ${this.workspaceRolesTableSql}
          WHERE workspace_id = ?
        `
      ).run(workspaceId);
      db.prepare(
        `
          DELETE FROM ${this.workspaceTableSql}
          WHERE workspace_id = ?
        `
      ).run(workspaceId);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  async listWorkspaceRoles(workspaceId: string): Promise<WorkspaceRoleStorageRecord[]> {
    const db = await this.ensureInitialized();
    const rows = db.prepare(
      `
        SELECT workspace_id, role_id, name, builtin, permissions, created_at, updated_at
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
      permissions: parseWorkspacePermissionArray(row.permissions),
      createdAt: ensureIso(row.created_at),
      updatedAt: ensureIso(row.updated_at)
    }));
  }

  async upsertWorkspaceRole(record: WorkspaceRoleStorageRecord): Promise<void> {
    const db = await this.ensureInitialized();
    const permissions = uniqueStrings(record.permissions).filter(isWorkspacePermission);
    db.prepare(
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
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (workspace_id, role_id)
        DO UPDATE
        SET name = excluded.name,
            builtin = excluded.builtin,
            permissions = excluded.permissions,
            updated_at = excluded.updated_at
      `
    ).run(
      record.workspaceId,
      record.roleId,
      record.name,
      record.builtin,
      JSON.stringify(permissions),
      ensureIso(record.createdAt),
      ensureIso(record.updatedAt)
    );
  }

  async removeWorkspaceRole(workspaceId: string, roleId: string): Promise<void> {
    const db = await this.ensureInitialized();
    const members = await this.listWorkspaceMembers(workspaceId);
    db.exec('BEGIN');
    try {
      db.prepare(
        `
          DELETE FROM ${this.workspaceRolesTableSql}
          WHERE workspace_id = ?
            AND role_id = ?
        `
      ).run(workspaceId, roleId);
      db.prepare(
        `
          DELETE FROM ${this.workspaceAclTableSql}
          WHERE workspace_id = ?
            AND role_id = ?
        `
      ).run(workspaceId, roleId);
      for (const member of members) {
        const roleIds = member.roleIds.filter((existingRoleId) => existingRoleId !== roleId);
        db.prepare(
          `
            UPDATE ${this.workspaceMembersTableSql}
            SET role_ids = ?,
                updated_at = ?
            WHERE workspace_id = ?
              AND account_id = ?
          `
        ).run(JSON.stringify(roleIds), new Date().toISOString(), workspaceId, member.accountId);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
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
      roleIds: uniqueStrings(parseJsonStringArray(row.role_ids)),
      joinedAt: ensureIso(row.joined_at)
    }));
  }

  async upsertWorkspaceMember(record: WorkspaceMemberRecord): Promise<void> {
    const db = await this.ensureInitialized();
    const roleIds = uniqueStrings(record.roleIds);
    const now = new Date().toISOString();
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
  }

  async removeWorkspaceMember(workspaceId: string, accountId: string): Promise<void> {
    const db = await this.ensureInitialized();
    db.prepare(
      `
        DELETE FROM ${this.workspaceMembersTableSql}
        WHERE workspace_id = ?
          AND account_id = ?
      `
    ).run(workspaceId, accountId);
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
    return rows.map((row) => ({
      workspaceId: row.workspace_id,
      folderId: fromAclFolderKey(row.folder_id),
      roleId: row.role_id,
      read: parseWorkspaceAclEffect(row.read_effect),
      write: parseWorkspaceAclEffect(row.write_effect),
      updatedAt: ensureIso(row.updated_at)
    }));
  }

  async upsertWorkspaceFolderAcl(record: WorkspaceFolderAclRecord): Promise<void> {
    const db = await this.ensureInitialized();
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
        DO UPDATE
        SET read_effect = excluded.read_effect,
            write_effect = excluded.write_effect,
            updated_at = excluded.updated_at
      `
    ).run(
      record.workspaceId,
      toAclFolderKey(record.folderId),
      record.roleId,
      record.read,
      record.write,
      ensureIso(record.updatedAt)
    );
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

  async close(): Promise<void> {
    if (!this.database) return;
    const current = this.database;
    this.database = null;
    this.initPromise = null;
    current.close();
  }
}
