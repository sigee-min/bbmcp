import type { WorkspaceMemberRoleUpdate } from '../workspace/sqlWorkspaceRepositoryBase';
import { runAsyncUnitOfWork, runSyncUnitOfWork } from './unitOfWork';

type SqliteStatement = {
  run: (...params: unknown[]) => unknown;
};

type SqliteDatabase = {
  exec: (sql: string) => unknown;
  prepare: (sql: string) => SqliteStatement;
};

type PostgresPool = {
  query<TResult extends Record<string, unknown> = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{
    rows: TResult[];
    rowCount?: number | null;
  }>;
};

export interface WorkspaceRbacTableSql {
  workspaceTableSql: string;
  workspaceMembersTableSql: string;
  workspaceRolesTableSql: string;
  workspaceAclTableSql: string;
  workspaceAccessMetaTableSql?: string;
  workspaceApiKeysTableSql?: string;
}

const toRoleHash = (roleIds: readonly string[]): string => JSON.stringify([...new Set(roleIds)].sort());

export const upsertWorkspaceAccessMetaSqlite = (
  db: SqliteDatabase,
  tableSql: string,
  workspaceId: string,
  accountId: string,
  roleIds: readonly string[],
  updatedAt: string
): void => {
  db.prepare(
    `
      INSERT INTO ${tableSql} (workspace_id, account_id, role_hash, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (workspace_id, account_id)
      DO UPDATE
      SET role_hash = excluded.role_hash,
          updated_at = excluded.updated_at
    `
  ).run(workspaceId, accountId, toRoleHash(roleIds), updatedAt);
};

export const removeWorkspaceAccessMetaSqlite = (
  db: SqliteDatabase,
  tableSql: string,
  workspaceId: string,
  accountId: string
): void => {
  db.prepare(
    `
      DELETE FROM ${tableSql}
      WHERE workspace_id = ?
        AND account_id = ?
    `
  ).run(workspaceId, accountId);
};

export const upsertWorkspaceAccessMetaPostgres = async (
  pool: PostgresPool,
  tableSql: string,
  workspaceId: string,
  accountId: string,
  roleIds: readonly string[],
  updatedAt?: string
): Promise<void> => {
  await pool.query(
    `
      INSERT INTO ${tableSql} (workspace_id, account_id, role_hash, updated_at)
      VALUES ($1, $2, $3, COALESCE($4::timestamptz, NOW()))
      ON CONFLICT (workspace_id, account_id)
      DO UPDATE
      SET role_hash = EXCLUDED.role_hash,
          updated_at = EXCLUDED.updated_at
    `,
    [workspaceId, accountId, toRoleHash(roleIds), updatedAt ?? null]
  );
};

export const removeWorkspaceAccessMetaPostgres = async (
  pool: PostgresPool,
  tableSql: string,
  workspaceId: string,
  accountId: string
): Promise<void> => {
  await pool.query(
    `
      DELETE FROM ${tableSql}
      WHERE workspace_id = $1
        AND account_id = $2
    `,
    [workspaceId, accountId]
  );
};

export const removeWorkspaceCascadeSqlite = (
  db: SqliteDatabase,
  tables: WorkspaceRbacTableSql,
  workspaceId: string
): void => {
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
          DELETE FROM ${tables.workspaceAclTableSql}
          WHERE workspace_id = ?
        `
      ).run(workspaceId);

      db.prepare(
        `
          DELETE FROM ${tables.workspaceMembersTableSql}
          WHERE workspace_id = ?
        `
      ).run(workspaceId);

      db.prepare(
        `
          DELETE FROM ${tables.workspaceRolesTableSql}
          WHERE workspace_id = ?
        `
      ).run(workspaceId);

      db.prepare(
        `
          DELETE FROM ${tables.workspaceTableSql}
          WHERE workspace_id = ?
        `
      ).run(workspaceId);

      if (tables.workspaceAccessMetaTableSql) {
        db.prepare(
          `
            DELETE FROM ${tables.workspaceAccessMetaTableSql}
            WHERE workspace_id = ?
          `
        ).run(workspaceId);
      }

      if (tables.workspaceApiKeysTableSql) {
        db.prepare(
          `
            DELETE FROM ${tables.workspaceApiKeysTableSql}
            WHERE workspace_id = ?
          `
        ).run(workspaceId);
      }
    }
  );
};

export const removeWorkspaceRoleCascadeSqlite = (
  db: SqliteDatabase,
  tables: WorkspaceRbacTableSql,
  workspaceId: string,
  roleId: string,
  memberRoleUpdates: readonly WorkspaceMemberRoleUpdate[]
): void => {
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
          DELETE FROM ${tables.workspaceRolesTableSql}
          WHERE workspace_id = ?
            AND role_id = ?
        `
      ).run(workspaceId, roleId);

      db.prepare(
        `
          DELETE FROM ${tables.workspaceAclTableSql}
          WHERE workspace_id = ?
            AND role_id = ?
        `
      ).run(workspaceId, roleId);

      for (const memberUpdate of memberRoleUpdates) {
        db.prepare(
          `
            UPDATE ${tables.workspaceMembersTableSql}
            SET role_ids = ?,
                updated_at = ?
            WHERE workspace_id = ?
              AND account_id = ?
          `
        ).run(JSON.stringify(memberUpdate.roleIds), new Date().toISOString(), workspaceId, memberUpdate.accountId);

        if (tables.workspaceAccessMetaTableSql) {
          if (memberUpdate.roleIds.length === 0) {
            removeWorkspaceAccessMetaSqlite(db, tables.workspaceAccessMetaTableSql, workspaceId, memberUpdate.accountId);
          } else {
            upsertWorkspaceAccessMetaSqlite(
              db,
              tables.workspaceAccessMetaTableSql,
              workspaceId,
              memberUpdate.accountId,
              memberUpdate.roleIds,
              new Date().toISOString()
            );
          }
        }
      }
    }
  );
};

export const removeWorkspaceCascadePostgres = async (
  pool: PostgresPool,
  tables: WorkspaceRbacTableSql,
  workspaceId: string
): Promise<void> => {
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
          DELETE FROM ${tables.workspaceAclTableSql}
          WHERE workspace_id = $1
        `,
        [workspaceId]
      );

      await pool.query(
        `
          DELETE FROM ${tables.workspaceMembersTableSql}
          WHERE workspace_id = $1
        `,
        [workspaceId]
      );

      await pool.query(
        `
          DELETE FROM ${tables.workspaceRolesTableSql}
          WHERE workspace_id = $1
        `,
        [workspaceId]
      );

      await pool.query(
        `
          DELETE FROM ${tables.workspaceTableSql}
          WHERE workspace_id = $1
        `,
        [workspaceId]
      );

      if (tables.workspaceAccessMetaTableSql) {
        await pool.query(
          `
            DELETE FROM ${tables.workspaceAccessMetaTableSql}
            WHERE workspace_id = $1
          `,
          [workspaceId]
        );
      }

      if (tables.workspaceApiKeysTableSql) {
        await pool.query(
          `
            DELETE FROM ${tables.workspaceApiKeysTableSql}
            WHERE workspace_id = $1
          `,
          [workspaceId]
        );
      }
    }
  );
};

export const removeWorkspaceRoleCascadePostgres = async (
  pool: PostgresPool,
  tables: WorkspaceRbacTableSql,
  workspaceId: string,
  roleId: string,
  memberRoleUpdates: readonly WorkspaceMemberRoleUpdate[]
): Promise<void> => {
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
          DELETE FROM ${tables.workspaceRolesTableSql}
          WHERE workspace_id = $1
            AND role_id = $2
        `,
        [workspaceId, roleId]
      );

      await pool.query(
        `
          DELETE FROM ${tables.workspaceAclTableSql}
          WHERE workspace_id = $1
            AND role_id = $2
        `,
        [workspaceId, roleId]
      );

      for (const memberUpdate of memberRoleUpdates) {
        await pool.query(
          `
            UPDATE ${tables.workspaceMembersTableSql}
            SET role_ids = $1::jsonb,
                updated_at = NOW()
            WHERE workspace_id = $2
              AND account_id = $3
          `,
          [JSON.stringify(memberUpdate.roleIds), workspaceId, memberUpdate.accountId]
        );

        if (tables.workspaceAccessMetaTableSql) {
          if (memberUpdate.roleIds.length === 0) {
            await removeWorkspaceAccessMetaPostgres(
              pool,
              tables.workspaceAccessMetaTableSql,
              workspaceId,
              memberUpdate.accountId
            );
          } else {
            await upsertWorkspaceAccessMetaPostgres(
              pool,
              tables.workspaceAccessMetaTableSql,
              workspaceId,
              memberUpdate.accountId,
              memberUpdate.roleIds
            );
          }
        }
      }
    }
  );
};
