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

  async upsertAccount(record: AccountRecord): Promise<void> {
    this.accounts.set(record.accountId, {
      ...record,
      systemRoles: [...record.systemRoles]
    });
  }

  async listWorkspaces(accountId: string): Promise<WorkspaceRecord[]> {
    const normalizedAccountId = accountId.trim();
    if (!normalizedAccountId) {
      return Array.from(this.workspaces.values()).map((workspace) => ({ ...workspace }));
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
      .map((role) => ({
        ...role,
        permissions: [...role.permissions]
      }));
  }

  async upsertWorkspaceRole(record: WorkspaceRoleStorageRecord): Promise<void> {
    this.roles.set(`${record.workspaceId}:${record.roleId}`, {
      ...record,
      permissions: [...record.permissions]
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
}

const createNoopProjectRepository = (): ProjectRepository => ({
  find: async (_scope: ProjectRepositoryScope): Promise<PersistedProjectRecord | null> => null,
  save: async (_record: PersistedProjectRecord): Promise<void> => undefined,
  remove: async (_scope: ProjectRepositoryScope): Promise<void> => undefined
});

const createNoopBlobStore = (): BlobStore => ({
  put: async (_input: BlobWriteInput): Promise<BlobPointer> => ({ bucket: 'test', key: 'unused' }),
  get: async (_pointer: BlobPointer): Promise<BlobReadResult | null> => null,
  delete: async (_pointer: BlobPointer): Promise<void> => undefined
});

const createAuthService = (workspaceRepository: InMemoryWorkspaceRepository): AuthService => {
  const config = {
    runtime: {
      auth: {
        jwtSecret: 'test-jwt-secret',
        tokenTtlSec: 60 * 60,
        cookieName: 'ashfox_auth',
        cookieSecure: false,
        githubScopes: 'read:user user:email',
        postLoginRedirectPath: '/'
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
    const localMembers = await workspaceRepository.listWorkspaceMembers(localWorkspaceId);
    assert.equal(localMembers.some((member) => member.accountId === 'acc_local'), true);

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
  })()
);
