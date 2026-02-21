export type WorkspaceMigrationPlanEntry = {
  migrationId: string;
  legacyVersion: number;
  name: string;
};

export const WORKSPACE_MIGRATION_PLAN: readonly WorkspaceMigrationPlanEntry[] = Object.freeze([
  {
    migrationId: 'create-projects-table',
    legacyVersion: 1,
    name: 'create_projects_table'
  },
  {
    migrationId: 'create-workspace-rbac-tables',
    legacyVersion: 2,
    name: 'create_workspace_rbac_tables'
  },
  {
    migrationId: 'add-account-auth-columns',
    legacyVersion: 3,
    name: 'add_account_auth_columns'
  },
  {
    migrationId: 'add-workspace-and-scope-performance-indexes',
    legacyVersion: 4,
    name: 'add_workspace_and_scope_performance_indexes'
  },
  {
    migrationId: 'create-workspace-access-meta-projection',
    legacyVersion: 5,
    name: 'create_workspace_access_meta_projection'
  },
  {
    migrationId: 'add-workspace-default-member-role',
    legacyVersion: 6,
    name: 'add_workspace_default_member_role'
  },
  {
    migrationId: 'create-workspace-api-keys-table',
    legacyVersion: 7,
    name: 'create_workspace_api_keys_table'
  },
  {
    migrationId: 'create-service-settings-table',
    legacyVersion: 8,
    name: 'create_service_settings_table'
  }
]);

export const buildLegacyMigrationIdCaseExpression = (versionExpression = 'version'): string => {
  const lines = WORKSPACE_MIGRATION_PLAN.map(
    (entry) => `WHEN ${entry.legacyVersion} THEN '${entry.migrationId}'`
  );
  return ['CASE ' + versionExpression, ...lines, `ELSE 'legacy-version-' || CAST(${versionExpression} AS TEXT)`, 'END'].join('\n          ');
};

export const workspaceMigrationNameById = (migrationId: string): string => {
  const found = WORKSPACE_MIGRATION_PLAN.find((entry) => entry.migrationId === migrationId);
  if (!found) {
    throw new Error(`Unknown workspace migration id: ${migrationId}`);
  }
  return found.name;
};
