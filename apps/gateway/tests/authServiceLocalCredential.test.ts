import assert from 'node:assert/strict';
import type {
  AccountRecord,
  BlobPointer,
  BlobReadResult,
  BlobStore,
  BlobWriteInput,
  PersistencePorts,
  PersistedProjectRecord,
  ProjectRepository,
  ProjectRepositoryScope,
  ServiceSettingsRecord,
  WorkspaceApiKeyRecord,
  WorkspaceFolderAclRecord,
  WorkspaceMemberRecord,
  WorkspaceRecord,
  WorkspaceRepository,
  WorkspaceRoleStorageRecord
} from '@ashfox/backend-core';
import { toAutoProvisionedWorkspaceId } from '@ashfox/backend-core';
import type { ConsoleLogger } from '@ashfox/runtime/logging';
import { AuthService, AuthServiceError } from '../src/services/auth.service';
import type { GatewayConfigService } from '../src/services/gateway-config.service';
import { registerAsync } from './helpers';

class InMemoryWorkspaceRepository implements WorkspaceRepository {
  private readonly accounts = new Map<string, AccountRecord>();
  private readonly workspaces = new Map<string, WorkspaceRecord>();
  private readonly roles = new Map<string, WorkspaceRoleStorageRecord>();
  private readonly members = new Map<string, WorkspaceMemberRecord>();
  private serviceSettings: ServiceSettingsRecord | null = null;

  seedAccount(record: AccountRecord): void {
    this.accounts.set(record.accountId, {
      ...record,
      systemRoles: [...record.systemRoles]
    });
  }

  async getAccount(accountId: string): Promise<AccountRecord | null> {
    const found = this.accounts.get(accountId);
    return found ? { ...found, systemRoles: [...found.systemRoles] } : null;
  }

  async getAccountByLocalLoginId(localLoginId: string): Promise<AccountRecord | null> {
    const normalized = localLoginId.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    const found = Array.from(this.accounts.values()).find((account) => (account.localLoginId ?? '').toLowerCase() === normalized);
    return found ? { ...found, systemRoles: [...found.systemRoles] } : null;
  }

  async getAccountByGithubUserId(githubUserId: string): Promise<AccountRecord | null> {
    const normalized = githubUserId.trim();
    if (!normalized) {
      return null;
    }
    const found = Array.from(this.accounts.values()).find((account) => account.githubUserId === normalized);
    return found ? { ...found, systemRoles: [...found.systemRoles] } : null;
  }

  async listAccounts(input?: {
    query?: string;
    limit?: number;
    excludeAccountIds?: readonly string[];
  }): Promise<AccountRecord[]> {
    const normalizedQuery = typeof input?.query === 'string' ? input.query.trim().toLowerCase() : '';
    const requestedLimit = typeof input?.limit === 'number' && Number.isFinite(input.limit) ? Math.trunc(input.limit) : 25;
    const limit = Math.min(Math.max(requestedLimit, 1), 100);
    const excluded = new Set(
      (input?.excludeAccountIds ?? [])
        .map((accountId) => String(accountId ?? '').trim())
        .filter((accountId) => accountId.length > 0)
    );
    return Array.from(this.accounts.values())
      .filter((account) => {
        if (excluded.has(account.accountId)) {
          return false;
        }
        if (!normalizedQuery) {
          return true;
        }
        const haystack = [
          account.accountId,
          account.displayName,
          account.email,
          account.localLoginId ?? '',
          account.githubLogin ?? ''
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .sort((left, right) => left.displayName.localeCompare(right.displayName) || left.accountId.localeCompare(right.accountId))
      .slice(0, limit)
      .map((account) => ({
        ...account,
        systemRoles: [...account.systemRoles]
      }));
  }

  async searchServiceUsers(input?: {
    q?: string;
    field?: 'any' | 'accountId' | 'displayName' | 'email' | 'localLoginId' | 'githubLogin';
    match?: 'exact' | 'prefix' | 'contains';
    workspaceId?: string;
    limit?: number;
    cursor?: string | null;
  }): Promise<{
    users: AccountRecord[];
    total: number;
    nextCursor: string | null;
  }> {
    const q = typeof input?.q === 'string' ? input.q.trim().toLowerCase() : '';
    const field = input?.field ?? 'any';
    const match = input?.match ?? 'contains';
    const limit = Math.min(Math.max(Number.isFinite(input?.limit) ? Math.trunc(input?.limit as number) : 25, 1), 100);
    const offset = Math.max(Number.parseInt(String(input?.cursor ?? '0'), 10) || 0, 0);
    const normalizedWorkspaceId = String(input?.workspaceId ?? '').trim();
    const memberAccountIds = normalizedWorkspaceId
      ? new Set(
          Array.from(this.members.values())
            .filter((member) => member.workspaceId === normalizedWorkspaceId)
            .map((member) => member.accountId)
        )
      : null;
    const matches = (candidate: string): boolean => {
      if (!q) return true;
      const normalized = candidate.toLowerCase();
      if (match === 'exact') return normalized === q;
      if (match === 'prefix') return normalized.startsWith(q);
      return normalized.includes(q);
    };

    const filtered = Array.from(this.accounts.values())
      .filter((account) => {
        if (memberAccountIds && !memberAccountIds.has(account.accountId)) {
          return false;
        }
        const fields = {
          accountId: account.accountId,
          displayName: account.displayName,
          email: account.email,
          localLoginId: account.localLoginId ?? '',
          githubLogin: account.githubLogin ?? ''
        };
        if (!q) return true;
        if (field === 'any') {
          return Object.values(fields).some((value) => matches(value));
        }
        return matches(fields[field]);
      })
      .sort((left, right) => left.displayName.localeCompare(right.displayName) || left.accountId.localeCompare(right.accountId));
    const total = filtered.length;
    const users = filtered.slice(offset, offset + limit).map((account) => ({ ...account, systemRoles: [...account.systemRoles] }));
    return {
      users,
      total,
      nextCursor: offset + users.length < total ? String(offset + users.length) : null
    };
  }

  async upsertAccount(record: AccountRecord): Promise<void> {
    this.accounts.set(record.accountId, {
      ...record,
      systemRoles: [...record.systemRoles]
    });
  }

  async countAccountsBySystemRole(role: 'system_admin' | 'cs_admin'): Promise<number> {
    return Array.from(this.accounts.values()).filter((account) => account.systemRoles.includes(role)).length;
  }

  async updateAccountSystemRoles(
    accountId: string,
    systemRoles: Array<'system_admin' | 'cs_admin'>,
    updatedAt: string
  ): Promise<AccountRecord | null> {
    const existing = this.accounts.get(accountId);
    if (!existing) {
      return null;
    }
    const next: AccountRecord = {
      ...existing,
      systemRoles: [...new Set(systemRoles)],
      updatedAt
    };
    this.accounts.set(accountId, next);
    return {
      ...next,
      systemRoles: [...next.systemRoles]
    };
  }

  async listAllWorkspaces(): Promise<WorkspaceRecord[]> {
    return Array.from(this.workspaces.values()).map((workspace) => ({ ...workspace }));
  }

  async listAccountWorkspaces(accountId: string): Promise<WorkspaceRecord[]> {
    const normalizedAccountId = accountId.trim();
    if (!normalizedAccountId) {
      return [];
    }
    const memberWorkspaceIds = new Set(
      Array.from(this.members.values())
        .filter((member) => member.accountId === normalizedAccountId)
        .map((member) => member.workspaceId)
    );
    return Array.from(this.workspaces.values())
      .filter((workspace) => memberWorkspaceIds.has(workspace.workspaceId))
      .map((workspace) => ({ ...workspace }));
  }

  async searchServiceWorkspaces(input?: {
    q?: string;
    field?: 'any' | 'workspaceId' | 'name' | 'createdBy' | 'memberAccountId';
    match?: 'exact' | 'prefix' | 'contains';
    memberAccountId?: string;
    limit?: number;
    cursor?: string | null;
  }): Promise<{
    workspaces: WorkspaceRecord[];
    total: number;
    nextCursor: string | null;
  }> {
    const q = typeof input?.q === 'string' ? input.q.trim().toLowerCase() : '';
    const field = input?.field ?? 'any';
    const match = input?.match ?? 'contains';
    const normalizedMemberAccountId = String(input?.memberAccountId ?? '').trim().toLowerCase();
    const limit = Math.min(Math.max(Number.isFinite(input?.limit) ? Math.trunc(input?.limit as number) : 25, 1), 100);
    const offset = Math.max(Number.parseInt(String(input?.cursor ?? '0'), 10) || 0, 0);
    const membersByWorkspace = new Map<string, string[]>();
    for (const member of this.members.values()) {
      const existing = membersByWorkspace.get(member.workspaceId);
      if (existing) {
        existing.push(member.accountId);
      } else {
        membersByWorkspace.set(member.workspaceId, [member.accountId]);
      }
    }
    const matches = (candidate: string): boolean => {
      if (!q) return true;
      const normalized = candidate.toLowerCase();
      if (match === 'exact') return normalized === q;
      if (match === 'prefix') return normalized.startsWith(q);
      return normalized.includes(q);
    };

    const filtered = Array.from(this.workspaces.values())
      .filter((workspace) => {
        const members = membersByWorkspace.get(workspace.workspaceId) ?? [];
        if (normalizedMemberAccountId && !members.some((accountId) => accountId.toLowerCase() === normalizedMemberAccountId)) {
          return false;
        }
        const fields = {
          workspaceId: workspace.workspaceId,
          name: workspace.name,
          createdBy: workspace.createdBy
        };
        if (!q) return true;
        if (field === 'memberAccountId') {
          return members.some((accountId) => matches(accountId));
        }
        if (field === 'any') {
          return Object.values(fields).some((value) => matches(value)) || members.some((accountId) => matches(accountId));
        }
        return matches(fields[field]);
      })
      .sort((left, right) => left.workspaceId.localeCompare(right.workspaceId));
    const total = filtered.length;
    const workspaces = filtered.slice(offset, offset + limit).map((workspace) => ({ ...workspace }));
    return {
      workspaces,
      total,
      nextCursor: offset + workspaces.length < total ? String(offset + workspaces.length) : null
    };
  }

  async getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null> {
    const found = this.workspaces.get(workspaceId);
    return found ? { ...found } : null;
  }

  async upsertWorkspace(record: WorkspaceRecord): Promise<void> {
    this.workspaces.set(record.workspaceId, { ...record });
  }

  async removeWorkspace(workspaceId: string): Promise<void> {
    this.workspaces.delete(workspaceId);
    for (const key of Array.from(this.roles.keys())) {
      if (key.startsWith(`${workspaceId}:`)) {
        this.roles.delete(key);
      }
    }
    for (const key of Array.from(this.members.keys())) {
      if (key.startsWith(`${workspaceId}:`)) {
        this.members.delete(key);
      }
    }
  }

  async listWorkspaceRoles(workspaceId: string): Promise<WorkspaceRoleStorageRecord[]> {
    return Array.from(this.roles.values())
      .filter((role) => role.workspaceId === workspaceId)
      .map((role) => ({ ...role }));
  }

  async upsertWorkspaceRole(record: WorkspaceRoleStorageRecord): Promise<void> {
    this.roles.set(`${record.workspaceId}:${record.roleId}`, {
      ...record
    });
  }

  async removeWorkspaceRole(workspaceId: string, roleId: string): Promise<void> {
    this.roles.delete(`${workspaceId}:${roleId}`);
  }

  async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberRecord[]> {
    return Array.from(this.members.values())
      .filter((member) => member.workspaceId === workspaceId)
      .map((member) => ({
        ...member,
        roleIds: [...member.roleIds]
      }));
  }

  async upsertWorkspaceMember(record: WorkspaceMemberRecord): Promise<void> {
    this.members.set(`${record.workspaceId}:${record.accountId}`, {
      ...record,
      roleIds: [...record.roleIds]
    });
  }

  async removeWorkspaceMember(workspaceId: string, accountId: string): Promise<void> {
    this.members.delete(`${workspaceId}:${accountId}`);
  }

  async listWorkspaceFolderAcl(_workspaceId: string): Promise<WorkspaceFolderAclRecord[]> {
    return [];
  }

  async upsertWorkspaceFolderAcl(_record: WorkspaceFolderAclRecord): Promise<void> {
    // no-op for auth tests
  }

  async removeWorkspaceFolderAcl(_workspaceId: string, _folderId: string | null, _roleId: string): Promise<void> {
    // no-op for auth tests
  }

  async listWorkspaceApiKeys(_workspaceId: string): Promise<WorkspaceApiKeyRecord[]> {
    return [];
  }

  async createWorkspaceApiKey(_record: WorkspaceApiKeyRecord): Promise<void> {
    // no-op for auth tests
  }

  async revokeWorkspaceApiKey(_workspaceId: string, _keyId: string, _revokedAt: string): Promise<void> {
    // no-op for auth tests
  }

  async updateWorkspaceApiKeyLastUsed(_workspaceId: string, _keyId: string, _lastUsedAt: string): Promise<void> {
    // no-op for auth tests
  }

  async getServiceSettings(): Promise<ServiceSettingsRecord | null> {
    if (!this.serviceSettings) {
      return null;
    }
    return JSON.parse(JSON.stringify(this.serviceSettings)) as ServiceSettingsRecord;
  }

  async upsertServiceSettings(record: ServiceSettingsRecord): Promise<void> {
    this.serviceSettings = JSON.parse(JSON.stringify(record)) as ServiceSettingsRecord;
  }
}

const createNoopProjectRepository = (): ProjectRepository => ({
  find: async (_scope: ProjectRepositoryScope): Promise<PersistedProjectRecord | null> => null,
  listByScopePrefix: async (_scope: ProjectRepositoryScope): Promise<PersistedProjectRecord[]> => [],
  save: async (_record: PersistedProjectRecord): Promise<void> => undefined,
  remove: async (_scope: ProjectRepositoryScope): Promise<void> => undefined
});

const createNoopBlobStore = (): BlobStore => ({
  put: async (_input: BlobWriteInput): Promise<BlobPointer> => ({ bucket: 'test', key: 'unused' }),
  get: async (_pointer: BlobPointer): Promise<BlobReadResult | null> => null,
  delete: async (_pointer: BlobPointer): Promise<void> => undefined
});

const createAuthService = (
  workspaceRepository: InMemoryWorkspaceRepository,
  overrides: Partial<GatewayConfigService['runtime']['auth']> = {}
): AuthService => {
  const config = {
    runtime: {
      auth: {
        jwtSecret: 'test-jwt-secret',
        tokenTtlSec: 60 * 60,
        cookieName: 'ashfox_auth',
        cookieSecure: false,
        githubScopes: 'read:user user:email',
        postLoginRedirectPath: '/',
        ...overrides
      }
    }
  } as GatewayConfigService;
  const persistence: PersistencePorts = {
    workspaceRepository,
    projectRepository: createNoopProjectRepository(),
    blobStore: createNoopBlobStore(),
    health: {
      selection: {
        preset: 'local',
        databaseProvider: 'sqlite',
        storageProvider: 'db'
      },
      database: { provider: 'memory', ready: true },
      storage: { provider: 'memory', ready: true }
    }
  };
  const logger = {
    log: () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  } as ConsoleLogger;
  return new AuthService(config, persistence, logger);
};

const createAccount = (input: Partial<AccountRecord> & Pick<AccountRecord, 'accountId'>): AccountRecord => {
  const now = new Date().toISOString();
  return {
    accountId: input.accountId,
    email: input.email ?? `${input.accountId}@ashfox.local`,
    displayName: input.displayName ?? input.accountId,
    systemRoles: input.systemRoles ?? [],
    localLoginId: input.localLoginId ?? null,
    passwordHash: input.passwordHash ?? null,
    githubUserId: input.githubUserId ?? null,
    githubLogin: input.githubLogin ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now
  };
};

const seedLegacyWorkspaceFixture = async (
  repository: InMemoryWorkspaceRepository,
  workspaceId: string,
  includeNonAdminMember: boolean
): Promise<void> => {
  const now = new Date().toISOString();
  await repository.upsertWorkspace({
    workspaceId,
    tenantId: 'default-tenant',
    name: 'Current Workspace',
    defaultMemberRoleId: 'role_user',
    createdBy: 'admin',
    createdAt: now,
    updatedAt: now
  });
  await repository.upsertWorkspaceMember({
    workspaceId,
    accountId: 'admin',
    roleIds: ['role_workspace_admin'],
    joinedAt: now
  });
  if (includeNonAdminMember) {
    await repository.upsertWorkspaceMember({
      workspaceId,
      accountId: 'member-legacy',
      roleIds: ['role_user'],
      joinedAt: now
    });
  }
};

registerAsync(
  (async () => {
    const workspaceRepository = new InMemoryWorkspaceRepository();
    workspaceRepository.seedAccount(createAccount({ accountId: 'acc_local', localLoginId: 'local.old' }));
    workspaceRepository.seedAccount(createAccount({ accountId: 'acc_taken', localLoginId: 'taken.id' }));
    workspaceRepository.seedAccount(
      createAccount({
        accountId: 'acc_github',
        localLoginId: null,
        githubUserId: 'github-01',
        githubLogin: 'octocat'
      })
    );

    const authService = createAuthService(workspaceRepository);

    const updated = await authService.updateLocalCredential('acc_local', {
      loginId: 'local.new',
      password: 'password-new-01',
      passwordConfirm: 'password-new-01'
    });
    assert.equal(updated.user.localLoginId, 'local.new');
    assert.equal(updated.user.hasPassword, true);

    const login = await authService.loginWithPassword('local.new', 'password-new-01');
    assert.equal(login.user.accountId, 'acc_local');
    const localWorkspaceId = toAutoProvisionedWorkspaceId('acc_local');
    const localWorkspace = await workspaceRepository.getWorkspace(localWorkspaceId);
    assert.ok(localWorkspace);
    assert.equal(localWorkspace?.defaultMemberRoleId, 'role_user');
    const localMembers = await workspaceRepository.listWorkspaceMembers(localWorkspaceId);
    assert.equal(localMembers.some((member) => member.accountId === 'acc_local'), true);
    const localMember = localMembers.find((member) => member.accountId === 'acc_local');
    assert.ok(localMember);
    assert.equal(localMember?.roleIds.includes('role_user'), true);

    await assert.rejects(
      () =>
        authService.updateLocalCredential('acc_local', {
          loginId: 'taken.id'
        }),
      (error: unknown) => {
        assert.ok(error instanceof AuthServiceError);
        assert.equal(error.code, 'login_id_conflict');
        assert.equal(error.status, 409);
        return true;
      }
    );

    await assert.rejects(
      () =>
        authService.updateLocalCredential('acc_local', {
          loginId: 'local.third',
          password: 'password-new-02',
          passwordConfirm: 'password-mismatch'
        }),
      (error: unknown) => {
        assert.ok(error instanceof AuthServiceError);
        assert.equal(error.code, 'password_mismatch');
        assert.equal(error.status, 400);
        return true;
      }
    );

    const registered = await authService.registerLocalCredential('acc_github', 'octocat.local', 'password-new-03');
    assert.equal(registered.user.localLoginId, 'octocat.local');
    assert.equal(registered.user.hasPassword, true);
    const githubWorkspaceId = toAutoProvisionedWorkspaceId('acc_github');
    const githubWorkspace = await workspaceRepository.getWorkspace(githubWorkspaceId);
    assert.ok(githubWorkspace);
    const githubMembers = await workspaceRepository.listWorkspaceMembers(githubWorkspaceId);
    assert.equal(githubMembers.some((member) => member.accountId === 'acc_github'), true);

    await assert.rejects(
      () => authService.updateLocalCredential('acc_local', {}),
      (error: unknown) => {
        assert.ok(error instanceof AuthServiceError);
        assert.equal(error.code, 'no_changes');
        assert.equal(error.status, 400);
        return true;
      }
    );

    const removableLegacyRepository = new InMemoryWorkspaceRepository();
    await seedLegacyWorkspaceFixture(removableLegacyRepository, 'legacy-seed-removable', false);
    const removableLegacyAuth = createAuthService(removableLegacyRepository);
    await removableLegacyAuth.ensureBootstrapAdmin();
    assert.equal(await removableLegacyRepository.getWorkspace('legacy-seed-removable'), null);
    assert.ok(await removableLegacyRepository.getWorkspace(toAutoProvisionedWorkspaceId('admin')));

    const retainedLegacyRepository = new InMemoryWorkspaceRepository();
    await seedLegacyWorkspaceFixture(retainedLegacyRepository, 'legacy-seed-retained', true);
    const retainedLegacyAuth = createAuthService(retainedLegacyRepository);
    await retainedLegacyAuth.ensureBootstrapAdmin();
    assert.ok(await retainedLegacyRepository.getWorkspace('legacy-seed-retained'));

    const tokenSecurityRepository = new InMemoryWorkspaceRepository();
    tokenSecurityRepository.seedAccount(createAccount({ accountId: 'acc_token', localLoginId: 'token.user' }));
    const tokenSecurityAuth = createAuthService(tokenSecurityRepository, {
      tokenTtlSec: 1
    });
    await tokenSecurityAuth.updateLocalCredential('acc_token', {
      loginId: 'token.user',
      password: 'token-password-01',
      passwordConfirm: 'token-password-01'
    });
    const tokenLogin = await tokenSecurityAuth.loginWithPassword('token.user', 'token-password-01');
    const validUser = await tokenSecurityAuth.authenticateFromHeaders({
      authorization: `Bearer ${tokenLogin.token}`
    });
    assert.equal(validUser?.accountId, 'acc_token');

    const tamperedToken = `${tokenLogin.token.slice(0, -1)}${tokenLogin.token.endsWith('a') ? 'b' : 'a'}`;
    const tamperedUser = await tokenSecurityAuth.authenticateFromHeaders({
      authorization: `Bearer ${tamperedToken}`
    });
    assert.equal(tamperedUser, null);

    const realNow = Date.now;
    Date.now = () => realNow() + 2_000;
    try {
      const expiredUser = await tokenSecurityAuth.authenticateFromHeaders({
        authorization: `Bearer ${tokenLogin.token}`
      });
      assert.equal(expiredUser, null);
    } finally {
      Date.now = realNow;
    }
  })()
);
