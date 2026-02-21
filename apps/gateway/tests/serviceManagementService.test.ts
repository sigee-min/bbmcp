import assert from 'node:assert/strict';

import type {
  AccountRecord,
  ServiceSettingsRecord,
  WorkspaceMemberRecord,
  WorkspaceRecord
} from '@ashfox/backend-core';
import type { FastifyRequest } from 'fastify';
import { ServiceManagementService } from '../src/services/service-management.service';
import type { GatewayRuntimeService } from '../src/services/gateway-runtime.service';
import type { WorkspacePolicyService } from '../src/security/workspace-policy.service';
import type { GatewayConfigService } from '../src/services/gateway-config.service';
import { registerAsync } from './helpers';

const DEFAULT_NOW = '2026-02-21T00:00:00.000Z';

const parseJsonPlan = <T>(plan: { status: number; body?: unknown }): T => {
  const body = typeof plan.body === 'string' ? plan.body : '{}';
  return JSON.parse(body) as T;
};

const toRequest = (headers: Record<string, string>): FastifyRequest => ({ headers } as unknown as FastifyRequest);

class InMemoryServiceRepo {
  readonly accounts = new Map<string, AccountRecord>();
  readonly workspaces = new Map<string, WorkspaceRecord>();
  readonly members = new Map<string, Set<string>>();
  serviceSettings: ServiceSettingsRecord | null = null;

  async listAllWorkspaces(): Promise<WorkspaceRecord[]> {
    return Array.from(this.workspaces.values()).map((workspace) => ({ ...workspace }));
  }

  async listAccountWorkspaces(accountId: string): Promise<WorkspaceRecord[]> {
    const normalizedAccountId = accountId.trim();
    if (!normalizedAccountId) {
      return [];
    }
    const workspaceIds = new Set(
      Array.from(this.members.entries())
        .filter(([, accountIds]) => accountIds.has(normalizedAccountId))
        .map(([workspaceId]) => workspaceId)
    );
    return Array.from(this.workspaces.values())
      .filter((workspace) => workspaceIds.has(workspace.workspaceId))
      .map((workspace) => ({ ...workspace }));
  }

  async listAccounts(): Promise<AccountRecord[]> {
    return Array.from(this.accounts.values())
      .map((account) => ({ ...account, systemRoles: [...account.systemRoles] }))
      .sort((left, right) => left.accountId.localeCompare(right.accountId));
  }

  async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberRecord[]> {
    const members = this.members.get(workspaceId);
    if (!members) {
      return [];
    }
    return Array.from(members.values()).map((accountId) => ({
      workspaceId,
      accountId,
      roleIds: ['role_user'],
      joinedAt: DEFAULT_NOW
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
    const workspaceId = String(input?.workspaceId ?? '').trim();
    const workspaceMembers = workspaceId ? this.members.get(workspaceId) ?? new Set<string>() : null;
    const matches = (candidate: string): boolean => {
      if (!q) {
        return true;
      }
      const normalized = candidate.toLowerCase();
      if (match === 'exact') return normalized === q;
      if (match === 'prefix') return normalized.startsWith(q);
      return normalized.includes(q);
    };

    const users = Array.from(this.accounts.values())
      .filter((account) => {
        if (workspaceMembers && !workspaceMembers.has(account.accountId)) {
          return false;
        }
        if (!q) {
          return true;
        }
        const fields = {
          accountId: account.accountId,
          displayName: account.displayName,
          email: account.email,
          localLoginId: account.localLoginId ?? '',
          githubLogin: account.githubLogin ?? ''
        };
        if (field === 'any') {
          return Object.values(fields).some((value) => matches(value));
        }
        return matches(fields[field]);
      })
      .sort((left, right) => left.accountId.localeCompare(right.accountId));
    const total = users.length;
    const window = users.slice(offset, offset + limit).map((account) => ({ ...account, systemRoles: [...account.systemRoles] }));
    return {
      users: window,
      total,
      nextCursor: offset + window.length < total ? String(offset + window.length) : null
    };
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
    const memberAccountId = String(input?.memberAccountId ?? '').trim().toLowerCase();
    const limit = Math.min(Math.max(Number.isFinite(input?.limit) ? Math.trunc(input?.limit as number) : 25, 1), 100);
    const offset = Math.max(Number.parseInt(String(input?.cursor ?? '0'), 10) || 0, 0);
    const matches = (candidate: string): boolean => {
      if (!q) {
        return true;
      }
      const normalized = candidate.toLowerCase();
      if (match === 'exact') return normalized === q;
      if (match === 'prefix') return normalized.startsWith(q);
      return normalized.includes(q);
    };

    const workspaces = Array.from(this.workspaces.values())
      .filter((workspace) => {
        const members = this.members.get(workspace.workspaceId) ?? new Set<string>();
        if (memberAccountId && !Array.from(members).some((id) => id.toLowerCase() === memberAccountId)) {
          return false;
        }
        if (!q) {
          return true;
        }
        if (field === 'memberAccountId') {
          return Array.from(members).some((id) => matches(id));
        }
        const fields = {
          workspaceId: workspace.workspaceId,
          name: workspace.name,
          createdBy: workspace.createdBy
        };
        if (field === 'any') {
          return Object.values(fields).some((value) => matches(value)) || Array.from(members).some((id) => matches(id));
        }
        return matches(fields[field]);
      })
      .sort((left, right) => left.workspaceId.localeCompare(right.workspaceId));
    const total = workspaces.length;
    const window = workspaces.slice(offset, offset + limit).map((workspace) => ({ ...workspace }));
    return {
      workspaces: window,
      total,
      nextCursor: offset + window.length < total ? String(offset + window.length) : null
    };
  }

  async getAccount(accountId: string): Promise<AccountRecord | null> {
    const found = this.accounts.get(accountId);
    return found ? { ...found, systemRoles: [...found.systemRoles] } : null;
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
      systemRoles: Array.from(new Set(systemRoles)),
      updatedAt
    };
    this.accounts.set(accountId, next);
    return { ...next, systemRoles: [...next.systemRoles] };
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

const createService = (repo: InMemoryServiceRepo) => {
  const configOverrides: Partial<ReturnType<GatewayConfigService['getAuthConfig']>> = {};
  const config = {
    runtime: {
      auth: {
        jwtSecret: 'test-jwt-secret',
        tokenTtlSec: 3600,
        cookieName: 'ashfox_auth',
        cookieSecure: false,
        githubEnabled: true,
        githubClientId: 'env-client-id',
        githubClientSecret: 'env-client-secret',
        githubCallbackUrl: 'http://localhost:8686/api/auth/github/callback',
        githubScopes: 'read:user user:email',
        postLoginRedirectPath: '/dashboard'
      }
    },
    getAuthConfig() {
      return {
        ...this.runtime.auth,
        ...configOverrides
      };
    },
    applyAuthConfigOverrides(overrides: Partial<ReturnType<GatewayConfigService['getAuthConfig']>>) {
      Object.assign(configOverrides, overrides);
    }
  } as unknown as GatewayConfigService;

  const workspacePolicy = {
    isSystemManager(actor: { systemRoles: readonly string[] }) {
      return actor.systemRoles.includes('system_admin') || actor.systemRoles.includes('cs_admin');
    }
  } as unknown as WorkspacePolicyService;

  const runtime = {
    persistence: {
      workspaceRepository: repo
    }
  } as unknown as GatewayRuntimeService;

  return {
    service: new ServiceManagementService(runtime, workspacePolicy, config),
    config
  };
};

registerAsync(
  (async () => {
    const repo = new InMemoryServiceRepo();
    repo.workspaces.set('ws_admin', {
      workspaceId: 'ws_admin',
      tenantId: 'default-tenant',
      name: 'Administrator Workspace',
      defaultMemberRoleId: 'role_user',
      createdBy: 'system',
      createdAt: DEFAULT_NOW,
      updatedAt: DEFAULT_NOW
    });
    repo.workspaces.set('ws_ops', {
      workspaceId: 'ws_ops',
      tenantId: 'default-tenant',
      name: 'Operations Workspace',
      defaultMemberRoleId: 'role_user',
      createdBy: 'cs',
      createdAt: DEFAULT_NOW,
      updatedAt: DEFAULT_NOW
    });
    repo.accounts.set('admin', {
      accountId: 'admin',
      email: 'admin@ashfox.local',
      displayName: 'Administrator',
      systemRoles: ['system_admin'],
      localLoginId: 'admin',
      passwordHash: null,
      githubUserId: null,
      githubLogin: null,
      createdAt: DEFAULT_NOW,
      updatedAt: DEFAULT_NOW
    });
    repo.accounts.set('cs', {
      accountId: 'cs',
      email: 'cs@ashfox.local',
      displayName: 'CS Admin',
      systemRoles: ['cs_admin'],
      localLoginId: 'cs',
      passwordHash: null,
      githubUserId: null,
      githubLogin: null,
      createdAt: DEFAULT_NOW,
      updatedAt: DEFAULT_NOW
    });
    repo.accounts.set('qa1', {
      accountId: 'qa1',
      email: 'qa1@ashfox.local',
      displayName: 'QA One',
      systemRoles: [],
      localLoginId: 'qa1',
      passwordHash: null,
      githubUserId: null,
      githubLogin: null,
      createdAt: DEFAULT_NOW,
      updatedAt: DEFAULT_NOW
    });
    repo.members.set('ws_admin', new Set(['admin', 'cs']));
    repo.members.set('ws_ops', new Set(['cs', 'qa1']));

    const { service, config } = createService(repo);

    const csRequest = toRequest({
      'x-ashfox-account-id': 'cs',
      'x-ashfox-system-roles': 'cs_admin'
    });
    const listUsersPlan = await service.listServiceUsers(csRequest);
    const listUsersBody = parseJsonPlan<{
      ok: boolean;
      users: Array<{ accountId: string }>;
      guards: { currentSystemAdminCount: number };
    }>(listUsersPlan);
    assert.equal(listUsersPlan.status, 200);
    assert.equal(listUsersBody.ok, true);
    assert.equal(listUsersBody.users.length, 3);
    assert.equal(listUsersBody.guards.currentSystemAdminCount, 1);

    const listWorkspacesPlan = await service.listServiceWorkspaces(csRequest);
    const listWorkspacesBody = parseJsonPlan<{
      ok: boolean;
      workspaces: Array<Record<string, unknown>>;
    }>(listWorkspacesPlan);
    assert.equal(listWorkspacesPlan.status, 200);
    assert.equal(listWorkspacesBody.ok, true);
    assert.equal(listWorkspacesBody.workspaces.length, 2);
    assert.equal(listWorkspacesBody.workspaces[0]?.workspaceId, 'ws_admin');
    assert.equal(listWorkspacesBody.workspaces[0]?.name, 'Administrator Workspace');
    assert.equal('mode' in (listWorkspacesBody.workspaces[0] ?? {}), false);
    assert.equal('capabilities' in (listWorkspacesBody.workspaces[0] ?? {}), false);

    const listUserWorkspacesPlan = await service.listServiceUserWorkspaces(csRequest, 'admin');
    const listUserWorkspacesBody = parseJsonPlan<{
      ok: boolean;
      account: { accountId: string };
      workspaces: Array<{
        workspaceId: string;
        defaultMemberRoleId: string;
        membership: null | { accountId: string; workspaceId: string; roleIds: string[]; joinedAt: string };
      }>;
    }>(listUserWorkspacesPlan);
    assert.equal(listUserWorkspacesPlan.status, 200);
    assert.equal(listUserWorkspacesBody.ok, true);
    assert.equal(listUserWorkspacesBody.account.accountId, 'admin');
    assert.equal(listUserWorkspacesBody.workspaces.length, 1);
    assert.equal(listUserWorkspacesBody.workspaces[0]?.workspaceId, 'ws_admin');
    assert.equal(listUserWorkspacesBody.workspaces[0]?.defaultMemberRoleId, 'role_user');
    assert.equal(listUserWorkspacesBody.workspaces[0]?.membership?.accountId, 'admin');
    assert.equal(listUserWorkspacesBody.workspaces[0]?.membership?.workspaceId, 'ws_admin');

    const listQaUserWorkspacesPlan = await service.listServiceUserWorkspaces(csRequest, 'qa1');
    const listQaUserWorkspacesBody = parseJsonPlan<{
      ok: boolean;
      workspaces: Array<{ workspaceId: string; membership: null | { accountId: string } }>;
    }>(listQaUserWorkspacesPlan);
    assert.equal(listQaUserWorkspacesPlan.status, 200);
    assert.equal(listQaUserWorkspacesBody.ok, true);
    assert.equal(listQaUserWorkspacesBody.workspaces.length, 1);
    assert.equal(listQaUserWorkspacesBody.workspaces[0]?.workspaceId, 'ws_ops');
    assert.equal(listQaUserWorkspacesBody.workspaces[0]?.membership?.accountId, 'qa1');

    const listMissingUserWorkspacesPlan = await service.listServiceUserWorkspaces(csRequest, 'missing');
    const listMissingUserWorkspacesBody = parseJsonPlan<{ ok: boolean; code: string }>(listMissingUserWorkspacesPlan);
    assert.equal(listMissingUserWorkspacesPlan.status, 404);
    assert.equal(listMissingUserWorkspacesBody.code, 'service_user_not_found');

    const exactUserSearchPlan = await service.listServiceUsers(csRequest, {
      q: 'admin',
      field: 'accountId',
      match: 'exact',
      limit: 10,
      cursor: '0'
    });
    const exactUserSearchBody = parseJsonPlan<{
      ok: boolean;
      users: Array<{ accountId: string }>;
      search: { match: string; field: string; total: number };
    }>(exactUserSearchPlan);
    assert.equal(exactUserSearchPlan.status, 200);
    assert.equal(exactUserSearchBody.ok, true);
    assert.deepEqual(exactUserSearchBody.users.map((user) => user.accountId), ['admin']);
    assert.equal(exactUserSearchBody.search.field, 'accountId');
    assert.equal(exactUserSearchBody.search.match, 'exact');
    assert.equal(exactUserSearchBody.search.total, 1);

    const workspaceFilteredUsersPlan = await service.listServiceUsers(csRequest, {
      workspaceId: 'ws_ops',
      field: 'any',
      match: 'contains',
      limit: 10,
      cursor: '0'
    });
    const workspaceFilteredUsersBody = parseJsonPlan<{
      ok: boolean;
      users: Array<{ accountId: string }>;
      search: { workspaceId: string | null; total: number };
    }>(workspaceFilteredUsersPlan);
    assert.equal(workspaceFilteredUsersPlan.status, 200);
    assert.equal(workspaceFilteredUsersBody.ok, true);
    assert.deepEqual(
      workspaceFilteredUsersBody.users.map((user) => user.accountId).sort(),
      ['cs', 'qa1']
    );
    assert.equal(workspaceFilteredUsersBody.search.workspaceId, 'ws_ops');
    assert.equal(workspaceFilteredUsersBody.search.total, 2);

    const pagedUsersPage1Plan = await service.listServiceUsers(csRequest, { limit: 1, cursor: '0' });
    const pagedUsersPage1Body = parseJsonPlan<{
      ok: boolean;
      users: Array<{ accountId: string }>;
      search: { nextCursor: string | null };
    }>(pagedUsersPage1Plan);
    assert.equal(pagedUsersPage1Plan.status, 200);
    assert.equal(pagedUsersPage1Body.ok, true);
    assert.equal(pagedUsersPage1Body.users.length, 1);
    assert.ok(pagedUsersPage1Body.search.nextCursor);

    const pagedUsersPage2Plan = await service.listServiceUsers(csRequest, {
      limit: 1,
      cursor: pagedUsersPage1Body.search.nextCursor ?? '1'
    });
    const pagedUsersPage2Body = parseJsonPlan<{
      ok: boolean;
      users: Array<{ accountId: string }>;
    }>(pagedUsersPage2Plan);
    assert.equal(pagedUsersPage2Plan.status, 200);
    assert.equal(pagedUsersPage2Body.ok, true);
    assert.equal(pagedUsersPage2Body.users.length, 1);
    assert.notEqual(pagedUsersPage1Body.users[0]?.accountId, pagedUsersPage2Body.users[0]?.accountId);

    const memberIdSearchPlan = await service.listServiceWorkspaces(csRequest, {
      q: 'qa1',
      field: 'memberAccountId',
      match: 'exact',
      limit: 10,
      cursor: '0'
    });
    const memberIdSearchBody = parseJsonPlan<{
      ok: boolean;
      workspaces: Array<{ workspaceId: string }>;
      search: { field: string; match: string; total: number };
    }>(memberIdSearchPlan);
    assert.equal(memberIdSearchPlan.status, 200);
    assert.equal(memberIdSearchBody.ok, true);
    assert.deepEqual(memberIdSearchBody.workspaces.map((workspace) => workspace.workspaceId), ['ws_ops']);
    assert.equal(memberIdSearchBody.search.field, 'memberAccountId');
    assert.equal(memberIdSearchBody.search.match, 'exact');
    assert.equal(memberIdSearchBody.search.total, 1);

    const memberFilterPlan = await service.listServiceWorkspaces(csRequest, {
      memberAccountId: 'admin',
      field: 'any',
      match: 'contains',
      limit: 10,
      cursor: '0'
    });
    const memberFilterBody = parseJsonPlan<{
      ok: boolean;
      workspaces: Array<{ workspaceId: string }>;
      search: { memberAccountId: string | null; total: number };
    }>(memberFilterPlan);
    assert.equal(memberFilterPlan.status, 200);
    assert.equal(memberFilterBody.ok, true);
    assert.deepEqual(memberFilterBody.workspaces.map((workspace) => workspace.workspaceId), ['ws_admin']);
    assert.equal(memberFilterBody.search.memberAccountId, 'admin');
    assert.equal(memberFilterBody.search.total, 1);

    const normalizedUsersQueryPlan = await service.listServiceUsers(csRequest, {
      q: '  QA  ',
      field: 'any',
      match: 'invalid-match' as never,
      workspaceId: '  ws_ops  ',
      limit: 0,
      cursor: ' 0 '
    });
    const normalizedUsersQueryBody = parseJsonPlan<{
      ok: boolean;
      users: Array<{ accountId: string }>;
      search: { q: string | null; field: string; match: string; workspaceId: string | null; limit: number; cursor: string | null };
    }>(normalizedUsersQueryPlan);
    assert.equal(normalizedUsersQueryPlan.status, 200);
    assert.equal(normalizedUsersQueryBody.ok, true);
    assert.equal(normalizedUsersQueryBody.search.q, 'QA');
    assert.equal(normalizedUsersQueryBody.search.field, 'any');
    assert.equal(normalizedUsersQueryBody.search.match, 'contains');
    assert.equal(normalizedUsersQueryBody.search.workspaceId, 'ws_ops');
    assert.equal(normalizedUsersQueryBody.search.limit, 1);
    assert.equal(normalizedUsersQueryBody.search.cursor, '0');
    assert.deepEqual(normalizedUsersQueryBody.users.map((user) => user.accountId), ['qa1']);

    const normalizedWorkspacesQueryPlan = await service.listServiceWorkspaces(csRequest, {
      q: '  ws_  ',
      field: 'any',
      match: 'invalid-match' as never,
      memberAccountId: '  cs  ',
      limit: 200,
      cursor: '999'
    });
    const normalizedWorkspacesQueryBody = parseJsonPlan<{
      ok: boolean;
      workspaces: Array<{ workspaceId: string }>;
      search: {
        q: string | null;
        field: string;
        match: string;
        memberAccountId: string | null;
        limit: number;
        cursor: string | null;
        total: number;
      };
    }>(normalizedWorkspacesQueryPlan);
    assert.equal(normalizedWorkspacesQueryPlan.status, 200);
    assert.equal(normalizedWorkspacesQueryBody.ok, true);
    assert.deepEqual(normalizedWorkspacesQueryBody.workspaces, []);
    assert.equal(normalizedWorkspacesQueryBody.search.q, 'ws_');
    assert.equal(normalizedWorkspacesQueryBody.search.field, 'any');
    assert.equal(normalizedWorkspacesQueryBody.search.match, 'contains');
    assert.equal(normalizedWorkspacesQueryBody.search.memberAccountId, 'cs');
    assert.equal(normalizedWorkspacesQueryBody.search.limit, 100);
    assert.equal(normalizedWorkspacesQueryBody.search.cursor, '999');
    assert.equal(normalizedWorkspacesQueryBody.search.total, 2);

    const pagedWorkspacesPage1Plan = await service.listServiceWorkspaces(csRequest, { limit: 1, cursor: '0' });
    const pagedWorkspacesPage1Body = parseJsonPlan<{
      ok: boolean;
      workspaces: Array<{ workspaceId: string }>;
      search: { nextCursor: string | null };
    }>(pagedWorkspacesPage1Plan);
    assert.equal(pagedWorkspacesPage1Plan.status, 200);
    assert.equal(pagedWorkspacesPage1Body.ok, true);
    assert.equal(pagedWorkspacesPage1Body.workspaces.length, 1);
    assert.ok(pagedWorkspacesPage1Body.search.nextCursor);

    const pagedWorkspacesPage2Plan = await service.listServiceWorkspaces(csRequest, {
      limit: 1,
      cursor: pagedWorkspacesPage1Body.search.nextCursor ?? '1'
    });
    const pagedWorkspacesPage2Body = parseJsonPlan<{
      ok: boolean;
      workspaces: Array<{ workspaceId: string }>;
    }>(pagedWorkspacesPage2Plan);
    assert.equal(pagedWorkspacesPage2Plan.status, 200);
    assert.equal(pagedWorkspacesPage2Body.ok, true);
    assert.equal(pagedWorkspacesPage2Body.workspaces.length, 1);
    assert.notEqual(
      pagedWorkspacesPage1Body.workspaces[0]?.workspaceId,
      pagedWorkspacesPage2Body.workspaces[0]?.workspaceId
    );

    const csSetRolesPlan = await service.setServiceUserRoles(csRequest, 'admin', {
      systemRoles: ['system_admin']
    });
    const csSetRolesBody = parseJsonPlan<{ ok: boolean; code: string }>(csSetRolesPlan);
    assert.equal(csSetRolesPlan.status, 403);
    assert.equal(csSetRolesBody.code, 'forbidden_system_admin_required');

    const adminRequest = toRequest({
      'x-ashfox-account-id': 'admin',
      'x-ashfox-system-roles': 'system_admin'
    });
    const removeLastAdminPlan = await service.setServiceUserRoles(adminRequest, 'admin', {
      systemRoles: []
    });
    const removeLastAdminBody = parseJsonPlan<{ ok: boolean; code: string }>(removeLastAdminPlan);
    assert.equal(removeLastAdminPlan.status, 400);
    assert.equal(removeLastAdminBody.code, 'system_admin_last_guard');

    await service.bootstrapRuntimeSettings();
    const seeded = await repo.getServiceSettings();
    assert.ok(seeded);
    assert.equal(seeded?.githubAuth.clientId, 'env-client-id');
    assert.ok(typeof seeded?.githubAuth.clientSecretEncrypted === 'string' && seeded.githubAuth.clientSecretEncrypted.length > 0);
    assert.notEqual(seeded?.githubAuth.clientSecretEncrypted, 'env-client-secret');

    const configAfterBootstrap = config.getAuthConfig();
    assert.equal(configAfterBootstrap.githubClientId, 'env-client-id');
    assert.equal(configAfterBootstrap.githubClientSecret, 'env-client-secret');

    const saveGithubPlan = await service.upsertServiceGithubAuthSettings(adminRequest, {
      enabled: true,
      clientId: 'updated-client-id',
      clientSecret: 'updated-client-secret',
      callbackUrl: 'http://localhost:8686/api/auth/github/callback',
      scopes: 'read:user user:email'
    });
    const saveGithubBody = parseJsonPlan<{
      ok: boolean;
      settings: { githubAuth: { hasClientSecret: boolean; clientId: string | null } };
    }>(saveGithubPlan);
    assert.equal(saveGithubPlan.status, 200);
    assert.equal(saveGithubBody.ok, true);
    assert.equal(saveGithubBody.settings.githubAuth.hasClientSecret, true);
    assert.equal(saveGithubBody.settings.githubAuth.clientId, 'updated-client-id');

    const configAfterUpdate = config.getAuthConfig();
    assert.equal(configAfterUpdate.githubClientId, 'updated-client-id');
    assert.equal(configAfterUpdate.githubClientSecret, 'updated-client-secret');
  })()
);
