import type { AccountRecord, SystemRole } from '@ashfox/backend-core';
import { normalizeTimestamp, parseJsonStringArray, uniqueStrings } from '../workspace/common';

type SqliteStatement = {
  run: (...params: unknown[]) => unknown;
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
};

type SqliteDatabase = {
  prepare: (sql: string) => SqliteStatement;
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

type SqliteSystemRoleCountRow = {
  system_roles: string;
};

type PostgresQueryResult<TResult extends Record<string, unknown> = Record<string, unknown>> = {
  rows: TResult[];
};

type PostgresPool = {
  query<TResult extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<PostgresQueryResult<TResult>>;
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

type PostgresCountRow = {
  count: number | string;
};

type AccountCandidateQueryInput = {
  query?: string;
  limit?: number;
  excludeAccountIds?: readonly string[];
};

const parseSystemRoles = (value: unknown): Array<'system_admin' | 'cs_admin'> =>
  parseJsonStringArray(value).filter((role): role is 'system_admin' | 'cs_admin' => role === 'system_admin' || role === 'cs_admin');

const normalizeAccountRecord = (row: SqliteAccountRow | PostgresAccountRow): AccountRecord => ({
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

const sanitizeAccountWrite = (record: AccountRecord) => {
  const now = new Date().toISOString();
  const systemRoles = uniqueStrings(record.systemRoles).filter(
    (role): role is 'system_admin' | 'cs_admin' => role === 'system_admin' || role === 'cs_admin'
  );
  const localLoginId =
    typeof record.localLoginId === 'string' && record.localLoginId.trim().length > 0
      ? record.localLoginId.trim().toLowerCase()
      : null;
  const githubUserId =
    typeof record.githubUserId === 'string' && record.githubUserId.trim().length > 0 ? record.githubUserId.trim() : null;
  const githubLogin =
    typeof record.githubLogin === 'string' && record.githubLogin.trim().length > 0 ? record.githubLogin.trim() : null;
  const passwordHash =
    typeof record.passwordHash === 'string' && record.passwordHash.trim().length > 0 ? record.passwordHash.trim() : null;

  return {
    accountId: record.accountId.trim(),
    email: record.email.trim() || 'unknown@ashfox.local',
    displayName: record.displayName.trim() || 'User',
    systemRoles,
    localLoginId,
    passwordHash,
    githubUserId,
    githubLogin,
    createdAt: normalizeTimestamp(record.createdAt || now),
    updatedAt: normalizeTimestamp(record.updatedAt || now)
  };
};

const escapeLikePattern = (value: string): string => value.replace(/[\\%_]/g, '\\$&');

const normalizeAccountCandidateQuery = (input: AccountCandidateQueryInput | undefined) => {
  const normalizedQuery = typeof input?.query === 'string' ? input.query.trim().toLowerCase() : '';
  const requestedLimit = typeof input?.limit === 'number' && Number.isFinite(input.limit) ? Math.trunc(input.limit) : 25;
  const limit = Math.min(Math.max(requestedLimit, 1), 100);
  const excludeAccountIds = uniqueStrings(
    (input?.excludeAccountIds ?? [])
      .map((accountId) => String(accountId ?? '').trim())
      .filter((accountId) => accountId.length > 0)
  );
  return {
    normalizedQuery,
    limit,
    excludeAccountIds
  };
};

export interface SqliteWorkspaceAccountStoreDeps {
  getDatabase: () => Promise<SqliteDatabase>;
  accountTableSql: string;
}

export class SqliteWorkspaceAccountStore {
  constructor(private readonly deps: SqliteWorkspaceAccountStoreDeps) {}

  async getAccount(accountId: string): Promise<AccountRecord | null> {
    const db = await this.deps.getDatabase();
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
        FROM ${this.deps.accountTableSql}
        WHERE account_id = ?
        LIMIT 1
      `
    ).get(accountId) as SqliteAccountRow | undefined;
    return row ? normalizeAccountRecord(row) : null;
  }

  async getAccountByLocalLoginId(localLoginId: string): Promise<AccountRecord | null> {
    const normalizedLoginId = localLoginId.trim().toLowerCase();
    if (!normalizedLoginId) return null;
    const db = await this.deps.getDatabase();
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
        FROM ${this.deps.accountTableSql}
        WHERE local_login_id = ?
        LIMIT 1
      `
    ).get(normalizedLoginId) as SqliteAccountRow | undefined;
    return row ? normalizeAccountRecord(row) : null;
  }

  async getAccountByGithubUserId(githubUserId: string): Promise<AccountRecord | null> {
    const normalizedGithubUserId = githubUserId.trim();
    if (!normalizedGithubUserId) return null;
    const db = await this.deps.getDatabase();
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
        FROM ${this.deps.accountTableSql}
        WHERE github_user_id = ?
        LIMIT 1
      `
    ).get(normalizedGithubUserId) as SqliteAccountRow | undefined;
    return row ? normalizeAccountRecord(row) : null;
  }

  async countAccountsBySystemRole(role: SystemRole): Promise<number> {
    const db = await this.deps.getDatabase();
    const rows = db.prepare(`SELECT system_roles FROM ${this.deps.accountTableSql}`).all() as SqliteSystemRoleCountRow[];
    let count = 0;
    for (const row of rows) {
      if (parseSystemRoles(row.system_roles).includes(role)) {
        count += 1;
      }
    }
    return count;
  }

  async listAccounts(input?: AccountCandidateQueryInput): Promise<AccountRecord[]> {
    const { normalizedQuery, limit, excludeAccountIds } = normalizeAccountCandidateQuery(input);
    const db = await this.deps.getDatabase();
    const whereConditions: string[] = [];
    const params: unknown[] = [];

    if (normalizedQuery.length > 0) {
      const likeValue = `%${escapeLikePattern(normalizedQuery)}%`;
      whereConditions.push(
        `(LOWER(account_id) LIKE ? ESCAPE '\\' OR LOWER(email) LIKE ? ESCAPE '\\' OR LOWER(display_name) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(local_login_id, '')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(github_login, '')) LIKE ? ESCAPE '\\')`
      );
      params.push(likeValue, likeValue, likeValue, likeValue, likeValue);
    }

    if (excludeAccountIds.length > 0) {
      whereConditions.push(`account_id NOT IN (${excludeAccountIds.map(() => '?').join(', ')})`);
      params.push(...excludeAccountIds);
    }

    const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const rows = db.prepare(
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
        FROM ${this.deps.accountTableSql}
        ${whereSql}
        ORDER BY display_name ASC, account_id ASC
        LIMIT ?
      `
    ).all(...params, limit) as SqliteAccountRow[];
    return rows.map((row) => normalizeAccountRecord(row));
  }

  async upsertAccount(record: AccountRecord): Promise<void> {
    const write = sanitizeAccountWrite(record);
    const db = await this.deps.getDatabase();
    db.prepare(
      `
        INSERT INTO ${this.deps.accountTableSql} (
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
      write.accountId,
      write.email,
      write.displayName,
      JSON.stringify(write.systemRoles),
      write.localLoginId,
      write.passwordHash,
      write.githubUserId,
      write.githubLogin,
      write.createdAt,
      write.updatedAt
    );
  }

  async updateAccountSystemRoles(
    accountId: string,
    systemRoles: SystemRole[],
    updatedAt: string
  ): Promise<AccountRecord | null> {
    const normalizedAccountId = accountId.trim();
    if (!normalizedAccountId) {
      return null;
    }
    const existing = await this.getAccount(normalizedAccountId);
    if (!existing) {
      return null;
    }
    const db = await this.deps.getDatabase();
    const normalizedSystemRoles = parseSystemRoles(systemRoles);
    const normalizedUpdatedAt = normalizeTimestamp(updatedAt);
    db.prepare(
      `
        UPDATE ${this.deps.accountTableSql}
        SET system_roles = ?,
            updated_at = ?
        WHERE account_id = ?
      `
    ).run(JSON.stringify(normalizedSystemRoles), normalizedUpdatedAt, normalizedAccountId);
    return {
      ...existing,
      systemRoles: normalizedSystemRoles,
      updatedAt: normalizedUpdatedAt
    };
  }
}

export interface PostgresWorkspaceAccountStoreDeps {
  ensureInitialized: () => Promise<void>;
  getPool: () => PostgresPool;
  accountTableSql: string;
}

export class PostgresWorkspaceAccountStore {
  constructor(private readonly deps: PostgresWorkspaceAccountStoreDeps) {}

  async getAccount(accountId: string): Promise<AccountRecord | null> {
    await this.deps.ensureInitialized();
    const pool = this.deps.getPool();
    const result = await pool.query<PostgresAccountRow>(
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
        FROM ${this.deps.accountTableSql}
        WHERE account_id = $1
        LIMIT 1
      `,
      [accountId]
    );
    const row = result.rows[0];
    return row ? normalizeAccountRecord(row) : null;
  }

  async getAccountByLocalLoginId(localLoginId: string): Promise<AccountRecord | null> {
    const normalizedLoginId = localLoginId.trim().toLowerCase();
    if (!normalizedLoginId) return null;
    await this.deps.ensureInitialized();
    const pool = this.deps.getPool();
    const result = await pool.query<PostgresAccountRow>(
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
        FROM ${this.deps.accountTableSql}
        WHERE local_login_id = $1
        LIMIT 1
      `,
      [normalizedLoginId]
    );
    const row = result.rows[0];
    return row ? normalizeAccountRecord(row) : null;
  }

  async getAccountByGithubUserId(githubUserId: string): Promise<AccountRecord | null> {
    const normalizedGithubUserId = githubUserId.trim();
    if (!normalizedGithubUserId) return null;
    await this.deps.ensureInitialized();
    const pool = this.deps.getPool();
    const result = await pool.query<PostgresAccountRow>(
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
        FROM ${this.deps.accountTableSql}
        WHERE github_user_id = $1
        LIMIT 1
      `,
      [normalizedGithubUserId]
    );
    const row = result.rows[0];
    return row ? normalizeAccountRecord(row) : null;
  }

  async countAccountsBySystemRole(role: SystemRole): Promise<number> {
    await this.deps.ensureInitialized();
    const pool = this.deps.getPool();
    const result = await pool.query<PostgresCountRow>(
      `
        SELECT COUNT(*)::int AS count
        FROM ${this.deps.accountTableSql}
        WHERE system_roles @> $1::jsonb
      `,
      [JSON.stringify([role])]
    );
    const raw = result.rows[0]?.count ?? 0;
    const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  async listAccounts(input?: AccountCandidateQueryInput): Promise<AccountRecord[]> {
    const { normalizedQuery, limit, excludeAccountIds } = normalizeAccountCandidateQuery(input);
    await this.deps.ensureInitialized();
    const pool = this.deps.getPool();
    const whereConditions: string[] = [];
    const params: unknown[] = [];

    if (normalizedQuery.length > 0) {
      const likeValue = `%${escapeLikePattern(normalizedQuery)}%`;
      const startIndex = params.length + 1;
      params.push(likeValue, likeValue, likeValue, likeValue, likeValue);
      whereConditions.push(
        `(LOWER(account_id) LIKE $${startIndex} ESCAPE '\\' OR LOWER(email) LIKE $${startIndex + 1} ESCAPE '\\' OR LOWER(display_name) LIKE $${startIndex + 2} ESCAPE '\\' OR LOWER(COALESCE(local_login_id, '')) LIKE $${startIndex + 3} ESCAPE '\\' OR LOWER(COALESCE(github_login, '')) LIKE $${startIndex + 4} ESCAPE '\\')`
      );
    }

    if (excludeAccountIds.length > 0) {
      params.push(excludeAccountIds);
      whereConditions.push(`NOT (account_id = ANY($${params.length}::text[]))`);
    }

    params.push(limit);
    const limitPlaceholder = `$${params.length}`;
    const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const result = await pool.query<PostgresAccountRow>(
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
        FROM ${this.deps.accountTableSql}
        ${whereSql}
        ORDER BY display_name ASC, account_id ASC
        LIMIT ${limitPlaceholder}
      `,
      params
    );
    return result.rows.map((row) => normalizeAccountRecord(row));
  }

  async upsertAccount(record: AccountRecord): Promise<void> {
    const write = sanitizeAccountWrite(record);
    await this.deps.ensureInitialized();
    const pool = this.deps.getPool();
    await pool.query(
      `
        INSERT INTO ${this.deps.accountTableSql} (
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
        write.accountId,
        write.email,
        write.displayName,
        JSON.stringify(write.systemRoles),
        write.localLoginId,
        write.passwordHash,
        write.githubUserId,
        write.githubLogin,
        write.createdAt,
        write.updatedAt
      ]
    );
  }

  async updateAccountSystemRoles(
    accountId: string,
    systemRoles: SystemRole[],
    updatedAt: string
  ): Promise<AccountRecord | null> {
    const normalizedAccountId = accountId.trim();
    if (!normalizedAccountId) {
      return null;
    }
    await this.deps.ensureInitialized();
    const pool = this.deps.getPool();
    const normalizedSystemRoles = parseSystemRoles(systemRoles);
    const normalizedUpdatedAt = normalizeTimestamp(updatedAt);
    const result = await pool.query<PostgresAccountRow>(
      `
        UPDATE ${this.deps.accountTableSql}
        SET system_roles = $2::jsonb,
            updated_at = $3::timestamptz
        WHERE account_id = $1
        RETURNING
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
      `,
      [normalizedAccountId, JSON.stringify(normalizedSystemRoles), normalizedUpdatedAt]
    );
    const row = result.rows[0];
    return row ? normalizeAccountRecord(row) : null;
  }
}
