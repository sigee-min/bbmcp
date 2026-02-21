import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type {
  AccountRecord,
  WorkspaceApiKeyRecord,
  WorkspaceRecord
} from '@ashfox/backend-core';
import type { Logger } from '@ashfox/runtime/logging';
import type { GatewayRuntimeService } from '../src/services/gateway-runtime.service';
import { GatewayMcpAuthService } from '../src/services/gateway-mcp-auth.service';
import { registerAsync } from './helpers';

type WorkspaceRepositoryPort = {
  findWorkspaceApiKeyByHash: (keyHash: string) => Promise<WorkspaceApiKeyRecord | null>;
  getWorkspace: (workspaceId: string) => Promise<WorkspaceRecord | null>;
  getAccount: (accountId: string) => Promise<AccountRecord | null>;
  updateWorkspaceApiKeyLastUsed: (workspaceId: string, keyId: string, lastUsedAt: string) => Promise<void>;
};

const createNoopLogger = (): Logger => ({
  log: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
});

const createService = (workspaceRepository: WorkspaceRepositoryPort): GatewayMcpAuthService => {
  const runtime = {
    persistence: {
      workspaceRepository
    }
  } as unknown as GatewayRuntimeService;
  return new GatewayMcpAuthService(runtime);
};

const parsePlanBody = (body: string): Record<string, unknown> =>
  JSON.parse(body) as Record<string, unknown>;

registerAsync(
  (async () => {
    const now = new Date().toISOString();
    const secret = 'ak_test_token';
    const keyHash = createHash('sha256').update(secret).digest('hex');
    const keyRecord: WorkspaceApiKeyRecord = {
      workspaceId: 'ws_alpha',
      keyId: 'key_alpha',
      name: 'alpha',
      keyPrefix: 'ak_test',
      keyHash,
      createdBy: 'account_alpha',
      createdAt: now,
      updatedAt: now,
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null
    };
    const workspace: WorkspaceRecord = {
      workspaceId: 'ws_alpha',
      tenantId: 'tenant',
      name: 'Alpha',
      defaultMemberRoleId: 'role_user',
      createdBy: 'system',
      createdAt: now,
      updatedAt: now
    };
    const account: AccountRecord = {
      accountId: 'account_alpha',
      email: 'alpha@ashfox.local',
      displayName: 'Alpha',
      systemRoles: ['system_admin'],
      localLoginId: null,
      passwordHash: null,
      githubUserId: null,
      githubLogin: null,
      createdAt: now,
      updatedAt: now
    };

    {
      const service = createService({
        findWorkspaceApiKeyByHash: async () => null,
        getWorkspace: async () => workspace,
        getAccount: async () => account,
        updateWorkspaceApiKeyLastUsed: async () => undefined
      });
      const result = await service.authenticate({}, createNoopLogger());
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.plan.status, 401);
      if (result.plan.kind !== 'json') return;
      const body = parsePlanBody(result.plan.body);
      assert.equal((body.error as { code?: string }).code, 'mcp_api_key_required');
    }

    {
      const service = createService({
        findWorkspaceApiKeyByHash: async () => null,
        getWorkspace: async () => workspace,
        getAccount: async () => account,
        updateWorkspaceApiKeyLastUsed: async () => undefined
      });
      const result = await service.authenticate(
        { authorization: 'Bearer ak_invalid' },
        createNoopLogger()
      );
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.plan.status, 401);
      if (result.plan.kind !== 'json') return;
      const body = parsePlanBody(result.plan.body);
      assert.equal((body.error as { code?: string }).code, 'mcp_api_key_invalid');
    }

    {
      const service = createService({
        findWorkspaceApiKeyByHash: async () => ({ ...keyRecord, revokedAt: now }),
        getWorkspace: async () => workspace,
        getAccount: async () => account,
        updateWorkspaceApiKeyLastUsed: async () => undefined
      });
      const result = await service.authenticate(
        { authorization: `Bearer ${secret}` },
        createNoopLogger()
      );
      assert.equal(result.ok, false);
      if (result.ok) return;
      if (result.plan.kind !== 'json') return;
      const body = parsePlanBody(result.plan.body);
      assert.equal((body.error as { code?: string }).code, 'mcp_api_key_revoked');
    }

    {
      const service = createService({
        findWorkspaceApiKeyByHash: async () => ({
          ...keyRecord,
          expiresAt: new Date(Date.now() - 60_000).toISOString()
        }),
        getWorkspace: async () => workspace,
        getAccount: async () => account,
        updateWorkspaceApiKeyLastUsed: async () => undefined
      });
      const result = await service.authenticate(
        { authorization: `Bearer ${secret}` },
        createNoopLogger()
      );
      assert.equal(result.ok, false);
      if (result.ok) return;
      if (result.plan.kind !== 'json') return;
      const body = parsePlanBody(result.plan.body);
      assert.equal((body.error as { code?: string }).code, 'mcp_api_key_expired');
    }

    {
      let updatedKeyId = '';
      const service = createService({
        findWorkspaceApiKeyByHash: async (hash) =>
          hash === keyHash ? { ...keyRecord } : null,
        getWorkspace: async () => ({ ...workspace }),
        getAccount: async () => ({ ...account }),
        updateWorkspaceApiKeyLastUsed: async (_workspaceId, keyId) => {
          updatedKeyId = keyId;
        }
      });
      const result = await service.authenticate(
        { authorization: `Bearer ${secret}` },
        createNoopLogger()
      );
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.principal.workspaceId, keyRecord.workspaceId);
      assert.equal(result.principal.accountId, keyRecord.createdBy);
      assert.deepEqual(result.principal.systemRoles, ['system_admin']);
      assert.equal(result.principal.keyId, keyRecord.keyId);
      assert.equal(updatedKeyId, keyRecord.keyId);
    }
  })()
);
