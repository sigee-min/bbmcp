import { createWorkspaceSeedTemplate, DEFAULT_MEMBER_ROLE_ID, toAclFolderKey } from '../workspace/common';
import { upsertWorkspaceAccessMetaPostgres } from './workspaceRbacStore';
import {
  buildLegacyMigrationIdCaseExpression,
  WORKSPACE_MIGRATION_PLAN,
  workspaceMigrationNameById
} from './workspaceMigrationPlan';

export interface PostgresBootstrapPool {
  query<TResult extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<{ rows: TResult[] }>;
}

export type PostgresWorkspaceMigration = {
  migrationId: string;
  name: string;
  upSql: string;
};

export type PostgresWorkspaceBootstrapSql = {
  tableSql: string;
  workspaceTableSql: string;
  accountTableSql: string;
  workspaceMembersTableSql: string;
  workspaceRolesTableSql: string;
  workspaceAclTableSql: string;
  workspaceAccessMetaTableSql: string;
  workspaceApiKeysTableSql: string;
  serviceSettingsTableSql: string;
};

const createPostgresMigrationSqlById = (sql: PostgresWorkspaceBootstrapSql): Record<string, string> => ({
  'create-projects-table': `
          CREATE TABLE IF NOT EXISTS ${sql.tableSql} (
            tenant_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            revision TEXT NOT NULL,
            state JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (tenant_id, project_id)
          )
        `,
  'create-workspace-rbac-tables': `
          CREATE TABLE IF NOT EXISTS ${sql.workspaceTableSql} (
            workspace_id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL,
            name TEXT NOT NULL,
            created_by TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL
          );
          CREATE TABLE IF NOT EXISTS ${sql.accountTableSql} (
            account_id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            display_name TEXT NOT NULL,
            system_roles JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL
          );
          CREATE TABLE IF NOT EXISTS ${sql.workspaceMembersTableSql} (
            workspace_id TEXT NOT NULL,
            account_id TEXT NOT NULL,
            role_ids JSONB NOT NULL,
            joined_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (workspace_id, account_id)
          );
          CREATE TABLE IF NOT EXISTS ${sql.workspaceRolesTableSql} (
            workspace_id TEXT NOT NULL,
            role_id TEXT NOT NULL,
            name TEXT NOT NULL,
            builtin TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (workspace_id, role_id)
          );
          CREATE TABLE IF NOT EXISTS ${sql.workspaceAclTableSql} (
            workspace_id TEXT NOT NULL,
            folder_id TEXT NOT NULL,
            role_id TEXT NOT NULL,
            read_effect TEXT NOT NULL,
            write_effect TEXT NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
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
          ALTER TABLE ${sql.accountTableSql}
            ADD COLUMN IF NOT EXISTS local_login_id TEXT NULL;
          ALTER TABLE ${sql.accountTableSql}
            ADD COLUMN IF NOT EXISTS password_hash TEXT NULL;
          ALTER TABLE ${sql.accountTableSql}
            ADD COLUMN IF NOT EXISTS github_user_id TEXT NULL;
          ALTER TABLE ${sql.accountTableSql}
            ADD COLUMN IF NOT EXISTS github_login TEXT NULL;
          CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_local_login_id
            ON ${sql.accountTableSql}(local_login_id)
            WHERE local_login_id IS NOT NULL;
          CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_github_user_id
            ON ${sql.accountTableSql}(github_user_id)
            WHERE github_user_id IS NOT NULL;
        `,
  'add-workspace-and-scope-performance-indexes': `
          CREATE INDEX IF NOT EXISTS idx_projects_tenant_project_pattern
            ON ${sql.tableSql}(tenant_id, project_id text_pattern_ops);
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
            updated_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (workspace_id, account_id)
          );
          CREATE INDEX IF NOT EXISTS idx_workspace_access_meta_account_workspace
            ON ${sql.workspaceAccessMetaTableSql}(account_id, workspace_id);
          INSERT INTO ${sql.workspaceAccessMetaTableSql} (
            workspace_id,
            account_id,
            role_hash,
            updated_at
          )
          SELECT workspace_id, account_id, role_ids::text, updated_at
          FROM ${sql.workspaceMembersTableSql}
          ON CONFLICT (workspace_id, account_id) DO NOTHING;
        `,
  'add-workspace-default-member-role': `
          ALTER TABLE ${sql.workspaceTableSql}
            ADD COLUMN IF NOT EXISTS default_member_role_id TEXT;
          UPDATE ${sql.workspaceTableSql}
          SET default_member_role_id = '${DEFAULT_MEMBER_ROLE_ID}'
          WHERE default_member_role_id IS NULL
             OR BTRIM(default_member_role_id) = '';
        `,
  'create-workspace-api-keys-table': `
          CREATE TABLE IF NOT EXISTS ${sql.workspaceApiKeysTableSql} (
            workspace_id TEXT NOT NULL,
            key_id TEXT NOT NULL,
            name TEXT NOT NULL,
            key_prefix TEXT NOT NULL,
            key_hash TEXT NOT NULL,
            created_by TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            last_used_at TIMESTAMPTZ NULL,
            expires_at TIMESTAMPTZ NULL,
            revoked_at TIMESTAMPTZ NULL,
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
            settings_json JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL
          );
        `
});

export const buildPostgresWorkspaceMigrations = (sql: PostgresWorkspaceBootstrapSql): PostgresWorkspaceMigration[] => {
  const migrationSqlById = createPostgresMigrationSqlById(sql);
  return WORKSPACE_MIGRATION_PLAN.map((planEntry) => ({
    migrationId: planEntry.migrationId,
    name: workspaceMigrationNameById(planEntry.migrationId),
    upSql: migrationSqlById[planEntry.migrationId]
  }));
};

export const normalizePostgresMigrationLedgerSchema = async (input: {
  pool: PostgresBootstrapPool;
  schema: string;
  migrationsTableName: string;
  migrationsTableSql: string;
}): Promise<void> => {
  const columns = await input.pool.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
    `,
    [input.schema, input.migrationsTableName]
  );
  const columnNames = new Set(
    columns.rows
      .map((row) => String(row.column_name ?? '').trim())
      .filter((columnName) => columnName.length > 0)
  );
  if (!columnNames.has('migration_id')) {
    await input.pool.query(`ALTER TABLE ${input.migrationsTableSql} ADD COLUMN migration_id TEXT`);
  }
  if (columnNames.has('version')) {
    await input.pool.query(`
      UPDATE ${input.migrationsTableSql}
      SET migration_id = ${buildLegacyMigrationIdCaseExpression('version')}
      WHERE migration_id IS NULL
    `);
  }
};

export const seedPostgresWorkspaceTemplate = async (input: {
  pool: PostgresBootstrapPool;
  workspaceTableSql: string;
  accountTableSql: string;
  workspaceRolesTableSql: string;
  workspaceMembersTableSql: string;
  workspaceAccessMetaTableSql: string;
  workspaceAclTableSql: string;
}): Promise<void> => {
  const seed = createWorkspaceSeedTemplate();
  await input.pool.query(
    `
      INSERT INTO ${input.workspaceTableSql} (
        workspace_id,
        tenant_id,
        name,
        default_member_role_id,
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
      seed.workspace.defaultMemberRoleId,
      seed.workspace.createdBy
    ]
  );

  await input.pool.query(
    `
      INSERT INTO ${input.accountTableSql} (
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
    [seed.systemAccount.accountId, seed.systemAccount.email, seed.systemAccount.displayName, JSON.stringify(seed.systemAccount.systemRoles)]
  );

  for (const role of seed.roles) {
    await input.pool.query(
      `
        INSERT INTO ${input.workspaceRolesTableSql} (
          workspace_id,
          role_id,
          name,
          builtin,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (workspace_id, role_id) DO NOTHING
      `,
      [role.workspaceId, role.roleId, role.name, role.builtin]
    );
  }

  await input.pool.query(
    `
      INSERT INTO ${input.workspaceMembersTableSql} (
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
  await upsertWorkspaceAccessMetaPostgres(
    input.pool,
    input.workspaceAccessMetaTableSql,
    seed.member.workspaceId,
    seed.member.accountId,
    seed.member.roleIds
  );

  const rootAcl = seed.folderAcl[0];
  await input.pool.query(
    `
      INSERT INTO ${input.workspaceAclTableSql} (
        workspace_id,
        folder_id,
        role_id,
        read_effect,
        write_effect,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (workspace_id, folder_id, role_id) DO NOTHING
    `,
    [rootAcl.workspaceId, toAclFolderKey(rootAcl.folderId), rootAcl.roleIds[0], rootAcl.read, rootAcl.write]
  );
};
