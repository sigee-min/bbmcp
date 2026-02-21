import { createWorkspaceSeedTemplate, DEFAULT_MEMBER_ROLE_ID, toAclFolderKey } from '../workspace/common';
import { upsertWorkspaceAccessMetaSqlite } from './workspaceRbacStore';
import {
  buildLegacyMigrationIdCaseExpression,
  WORKSPACE_MIGRATION_PLAN,
  workspaceMigrationNameById
} from './workspaceMigrationPlan';

export type SqliteStatement = {
  run: (...params: unknown[]) => unknown;
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
};

export type SqliteDatabase = {
  exec: (sql: string) => unknown;
  prepare: (sql: string) => SqliteStatement;
  close: () => void;
};

export type SqliteWorkspaceMigration = {
  migrationId: string;
  name: string;
  upSql: string;
};

export type SqliteWorkspaceBootstrapSql = {
  tableSql: string;
  workspaceTableSql: string;
  accountTableSql: string;
  workspaceMembersTableSql: string;
  workspaceRolesTableSql: string;
  workspaceAclTableSql: string;
  workspaceAccessMetaTableSql: string;
  workspaceApiKeysTableSql: string;
  serviceSettingsTableSql: string;
  migrationsTableSql: string;
  migrationsPragmaTableIdentifier: string;
};

type SqliteTableInfoRow = {
  name: string;
};

const createSqliteMigrationSqlById = (sql: SqliteWorkspaceBootstrapSql): Record<string, string> => ({
  'create-projects-table': `
          CREATE TABLE IF NOT EXISTS ${sql.tableSql} (
            tenant_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            revision TEXT NOT NULL,
            state TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (tenant_id, project_id)
          )
        `,
  'create-workspace-rbac-tables': `
          CREATE TABLE IF NOT EXISTS ${sql.workspaceTableSql} (
            workspace_id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            name TEXT NOT NULL,
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS ${sql.accountTableSql} (
            account_id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            display_name TEXT NOT NULL,
            system_roles TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS ${sql.workspaceMembersTableSql} (
            workspace_id TEXT NOT NULL,
            account_id TEXT NOT NULL,
            role_ids TEXT NOT NULL,
            joined_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (workspace_id, account_id)
          );
          CREATE TABLE IF NOT EXISTS ${sql.workspaceRolesTableSql} (
            workspace_id TEXT NOT NULL,
            role_id TEXT NOT NULL,
            name TEXT NOT NULL,
            builtin TEXT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (workspace_id, role_id)
          );
          CREATE TABLE IF NOT EXISTS ${sql.workspaceAclTableSql} (
            workspace_id TEXT NOT NULL,
            folder_id TEXT NOT NULL,
            role_id TEXT NOT NULL,
            read_effect TEXT NOT NULL,
            write_effect TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (workspace_id, folder_id, role_id)
          );
          CREATE INDEX IF NOT EXISTS idx_workspace_members_account_id
            ON ${sql.workspaceMembersTableSql}(account_id);
          CREATE INDEX IF NOT EXISTS idx_workspace_roles_workspace_id
            ON ${sql.workspaceRolesTableSql}(workspace_id);
          CREATE INDEX IF NOT EXISTS idx_workspace_acl_workspace_id
            ON ${sql.workspaceAclTableSql}(workspace_id);
        `,
  'add-account-auth-columns': `
          ALTER TABLE ${sql.accountTableSql} ADD COLUMN local_login_id TEXT NULL;
          ALTER TABLE ${sql.accountTableSql} ADD COLUMN password_hash TEXT NULL;
          ALTER TABLE ${sql.accountTableSql} ADD COLUMN github_user_id TEXT NULL;
          ALTER TABLE ${sql.accountTableSql} ADD COLUMN github_login TEXT NULL;
          CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_local_login_id
            ON ${sql.accountTableSql}(local_login_id)
            WHERE local_login_id IS NOT NULL;
          CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_github_user_id
            ON ${sql.accountTableSql}(github_user_id)
            WHERE github_user_id IS NOT NULL;
        `,
  'add-workspace-and-scope-performance-indexes': `
          CREATE INDEX IF NOT EXISTS idx_projects_tenant_project
            ON ${sql.tableSql}(tenant_id, project_id);
          CREATE INDEX IF NOT EXISTS idx_workspace_members_account_workspace
            ON ${sql.workspaceMembersTableSql}(account_id, workspace_id);
          CREATE INDEX IF NOT EXISTS idx_workspaces_created_at_workspace_id
            ON ${sql.workspaceTableSql}(created_at, workspace_id);
        `,
  'create-workspace-access-meta-projection': `
          CREATE TABLE IF NOT EXISTS ${sql.workspaceAccessMetaTableSql} (
            workspace_id TEXT NOT NULL,
            account_id TEXT NOT NULL,
            role_hash TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (workspace_id, account_id)
          );
          CREATE INDEX IF NOT EXISTS idx_workspace_access_meta_account_workspace
            ON ${sql.workspaceAccessMetaTableSql}(account_id, workspace_id);
          INSERT OR IGNORE INTO ${sql.workspaceAccessMetaTableSql} (
            workspace_id,
            account_id,
            role_hash,
            updated_at
          )
          SELECT workspace_id, account_id, role_ids, updated_at
          FROM ${sql.workspaceMembersTableSql};
        `,
  'add-workspace-default-member-role': `
          ALTER TABLE ${sql.workspaceTableSql}
            ADD COLUMN default_member_role_id TEXT NULL;
          UPDATE ${sql.workspaceTableSql}
          SET default_member_role_id = '${DEFAULT_MEMBER_ROLE_ID}'
          WHERE default_member_role_id IS NULL
             OR TRIM(default_member_role_id) = '';
        `,
  'create-workspace-api-keys-table': `
          CREATE TABLE IF NOT EXISTS ${sql.workspaceApiKeysTableSql} (
            workspace_id TEXT NOT NULL,
            key_id TEXT NOT NULL,
            name TEXT NOT NULL,
            key_prefix TEXT NOT NULL,
            key_hash TEXT NOT NULL,
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_used_at TEXT NULL,
            expires_at TEXT NULL,
            revoked_at TEXT NULL,
            PRIMARY KEY (workspace_id, key_id)
          );
          CREATE INDEX IF NOT EXISTS idx_workspace_api_keys_workspace
            ON ${sql.workspaceApiKeysTableSql}(workspace_id, created_at);
          CREATE INDEX IF NOT EXISTS idx_workspace_api_keys_workspace_revoked
            ON ${sql.workspaceApiKeysTableSql}(workspace_id, revoked_at);
          CREATE INDEX IF NOT EXISTS idx_workspace_api_keys_key_hash
            ON ${sql.workspaceApiKeysTableSql}(key_hash);
        `,
  'create-service-settings-table': `
          CREATE TABLE IF NOT EXISTS ${sql.serviceSettingsTableSql} (
            id TEXT PRIMARY KEY,
            settings_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
        `
});

export const buildSqliteWorkspaceMigrations = (sql: SqliteWorkspaceBootstrapSql): SqliteWorkspaceMigration[] => {
  const migrationSqlById = createSqliteMigrationSqlById(sql);
  return WORKSPACE_MIGRATION_PLAN.map((planEntry) => ({
    migrationId: planEntry.migrationId,
    name: workspaceMigrationNameById(planEntry.migrationId),
    upSql: migrationSqlById[planEntry.migrationId]
  }));
};

export const normalizeSqliteMigrationLedgerSchema = (input: {
  db: SqliteDatabase;
  migrationsTableSql: string;
  migrationsPragmaTableIdentifier: string;
}): void => {
  const tableInfoRows = input.db
    .prepare(`PRAGMA table_info(${input.migrationsPragmaTableIdentifier})`)
    .all() as SqliteTableInfoRow[];
  const columnNames = new Set(
    tableInfoRows
      .map((row) => String(row.name ?? '').trim())
      .filter((columnName) => columnName.length > 0)
  );
  if (!columnNames.has('migration_id')) {
    input.db.exec(`ALTER TABLE ${input.migrationsTableSql} ADD COLUMN migration_id TEXT`);
  }
  if (columnNames.has('version')) {
    input.db.exec(`
      UPDATE ${input.migrationsTableSql}
      SET migration_id = ${buildLegacyMigrationIdCaseExpression('version')}
      WHERE migration_id IS NULL
    `);
  }
};

export const seedSqliteWorkspaceTemplate = (input: {
  db: SqliteDatabase;
  workspaceTableSql: string;
  accountTableSql: string;
  workspaceRolesTableSql: string;
  workspaceMembersTableSql: string;
  workspaceAccessMetaTableSql: string;
  workspaceAclTableSql: string;
}): void => {
  const now = new Date().toISOString();
  const seed = createWorkspaceSeedTemplate(now);

  input.db
    .prepare(
      `
        INSERT OR IGNORE INTO ${input.workspaceTableSql} (
          workspace_id,
          tenant_id,
          name,
          default_member_role_id,
          created_by,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      seed.workspace.workspaceId,
      seed.workspace.tenantId,
      seed.workspace.name,
      seed.workspace.defaultMemberRoleId,
      seed.workspace.createdBy,
      seed.workspace.createdAt,
      seed.workspace.updatedAt
    );

  input.db
    .prepare(
      `
        INSERT OR IGNORE INTO ${input.accountTableSql} (
          account_id,
          email,
          display_name,
          system_roles,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      seed.systemAccount.accountId,
      seed.systemAccount.email,
      seed.systemAccount.displayName,
      JSON.stringify(seed.systemAccount.systemRoles),
      seed.systemAccount.createdAt,
      seed.systemAccount.updatedAt
    );

  for (const role of seed.roles) {
    input.db
      .prepare(
        `
          INSERT OR IGNORE INTO ${input.workspaceRolesTableSql} (
            workspace_id,
            role_id,
            name,
            builtin,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `
      )
      .run(role.workspaceId, role.roleId, role.name, role.builtin, role.createdAt, role.updatedAt);
  }

  input.db
    .prepare(
      `
        INSERT OR IGNORE INTO ${input.workspaceMembersTableSql} (
          workspace_id,
          account_id,
          role_ids,
          joined_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?)
      `
    )
    .run(seed.member.workspaceId, seed.member.accountId, JSON.stringify(seed.member.roleIds), seed.member.joinedAt, now);
  upsertWorkspaceAccessMetaSqlite(
    input.db,
    input.workspaceAccessMetaTableSql,
    seed.member.workspaceId,
    seed.member.accountId,
    seed.member.roleIds,
    now
  );

  const rootAcl = seed.folderAcl[0];
  input.db
    .prepare(
      `
        INSERT OR IGNORE INTO ${input.workspaceAclTableSql} (
          workspace_id,
          folder_id,
          role_id,
          read_effect,
          write_effect,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      rootAcl.workspaceId,
      toAclFolderKey(rootAcl.folderId),
      rootAcl.roleIds[0],
      rootAcl.read,
      rootAcl.write,
      rootAcl.updatedAt
    );
};
