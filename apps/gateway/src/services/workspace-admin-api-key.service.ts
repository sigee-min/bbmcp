import { randomBytes, randomUUID } from 'node:crypto';
import type { WorkspaceApiKeyRecord, WorkspaceRecord } from '@ashfox/backend-core';
import type { ResponsePlan } from '@ashfox/runtime/transport/mcp/types';
import type { FastifyRequest } from 'fastify';
import type { CreateWorkspaceApiKeyDto } from '../dto/create-workspace-api-key.dto';
import type { RevokeWorkspaceApiKeyDto } from '../dto/revoke-workspace-api-key.dto';
import { jsonPlan, workspaceNotFoundPlan, type GatewayActorContext } from '../gatewayDashboardHelpers';
import { hashApiKeySecret } from '../security/apiKeySecrets';

interface WorkspaceApiKeyServiceDependencies {
  resolveActor: (request: FastifyRequest) => GatewayActorContext;
  authorizeWorkspaceAccess: (
    workspaceId: string,
    actor: GatewayActorContext,
    permission: 'workspace.manage' | 'workspace.member'
  ) => Promise<
    | {
        workspace: WorkspaceRecord;
      }
    | ResponsePlan
  >;
  getWorkspace: (workspaceId: string) => Promise<WorkspaceRecord | null>;
  listWorkspaceApiKeys: (workspaceId: string) => Promise<WorkspaceApiKeyRecord[]>;
  createWorkspaceApiKey: (record: WorkspaceApiKeyRecord) => Promise<void>;
  revokeWorkspaceApiKey: (workspaceId: string, keyId: string, revokedAt: string) => Promise<void>;
}

const MAX_API_KEYS_PER_ACCOUNT_PER_WORKSPACE = 10;

const toApiKeyPayload = (record: WorkspaceApiKeyRecord) => ({
  workspaceId: record.workspaceId,
  keyId: record.keyId,
  name: record.name,
  keyPrefix: record.keyPrefix,
  createdBy: record.createdBy,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  lastUsedAt: record.lastUsedAt,
  expiresAt: record.expiresAt,
  revokedAt: record.revokedAt
});

const normalizeName = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
};

const normalizeExpiresAt = (value: unknown): string | null | 'invalid' => {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    return 'invalid';
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return 'invalid';
  }
  return parsed.toISOString();
};

const generateApiKeySecret = (): string => `ak_${randomBytes(24).toString('base64url')}`;

const generateApiKeyId = (): string => `key_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

const listActorWorkspaceApiKeys = async (
  dependencies: WorkspaceApiKeyServiceDependencies,
  workspaceId: string,
  accountId: string
): Promise<WorkspaceApiKeyRecord[]> => {
  const records = await dependencies.listWorkspaceApiKeys(workspaceId);
  return records.filter((record) => record.createdBy === accountId);
};

export const listWorkspaceApiKeys = async (
  dependencies: WorkspaceApiKeyServiceDependencies,
  request: FastifyRequest,
  workspaceId: string
): Promise<ResponsePlan> => {
  const actor = dependencies.resolveActor(request);
  const authorization = await dependencies.authorizeWorkspaceAccess(workspaceId, actor, 'workspace.member');
  if ('kind' in authorization) {
    return authorization;
  }
  const workspace = await dependencies.getWorkspace(workspaceId);
  if (!workspace) {
    return workspaceNotFoundPlan(workspaceId);
  }
  const records = await listActorWorkspaceApiKeys(dependencies, workspaceId, actor.accountId);
  return jsonPlan(200, {
    ok: true,
    apiKeys: records.map(toApiKeyPayload)
  });
};

export const createWorkspaceApiKey = async (
  dependencies: WorkspaceApiKeyServiceDependencies,
  request: FastifyRequest,
  workspaceId: string,
  body: CreateWorkspaceApiKeyDto
): Promise<ResponsePlan> => {
  const actor = dependencies.resolveActor(request);
  const authorization = await dependencies.authorizeWorkspaceAccess(workspaceId, actor, 'workspace.member');
  if ('kind' in authorization) {
    return authorization;
  }

  const workspace = await dependencies.getWorkspace(workspaceId);
  if (!workspace) {
    return workspaceNotFoundPlan(workspaceId);
  }

  const normalizedName = normalizeName(body.name);
  if (!normalizedName) {
    return jsonPlan(400, {
      ok: false,
      code: 'invalid_payload',
      message: 'name is required.'
    });
  }

  const normalizedExpiresAt = normalizeExpiresAt(body.expiresAt);
  if (normalizedExpiresAt === 'invalid') {
    return jsonPlan(400, {
      ok: false,
      code: 'invalid_payload',
      message: 'expiresAt must be an ISO-8601 datetime string.'
    });
  }

  const existing = await listActorWorkspaceApiKeys(dependencies, workspaceId, actor.accountId);
  const activeCount = existing.filter((record) => !record.revokedAt).length;
  if (activeCount >= MAX_API_KEYS_PER_ACCOUNT_PER_WORKSPACE) {
    return jsonPlan(409, {
      ok: false,
      code: 'workspace_api_key_limit_exceeded',
      message: `계정당 API 키는 최대 ${MAX_API_KEYS_PER_ACCOUNT_PER_WORKSPACE}개까지 발급할 수 있습니다.`
    });
  }

  const now = new Date().toISOString();
  const secret = generateApiKeySecret();
  const keyPrefix = secret.slice(0, Math.min(secret.length, 12));
  const keyHash = hashApiKeySecret(secret);

  const record: WorkspaceApiKeyRecord = {
    workspaceId,
    keyId: generateApiKeyId(),
    name: normalizedName,
    keyPrefix,
    keyHash,
    createdBy: actor.accountId,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
    expiresAt: normalizedExpiresAt,
    revokedAt: null
  };

  await dependencies.createWorkspaceApiKey(record);

  return jsonPlan(201, {
    ok: true,
    apiKey: toApiKeyPayload(record),
    secret
  });
};

export const revokeWorkspaceApiKey = async (
  dependencies: WorkspaceApiKeyServiceDependencies,
  request: FastifyRequest,
  workspaceId: string,
  body: RevokeWorkspaceApiKeyDto
): Promise<ResponsePlan> => {
  const actor = dependencies.resolveActor(request);
  const authorization = await dependencies.authorizeWorkspaceAccess(workspaceId, actor, 'workspace.member');
  if ('kind' in authorization) {
    return authorization;
  }

  const normalizedKeyId = body.keyId.trim();
  if (!normalizedKeyId) {
    return jsonPlan(400, {
      ok: false,
      code: 'invalid_payload',
      message: 'keyId is required.'
    });
  }

  const existing = await listActorWorkspaceApiKeys(dependencies, workspaceId, actor.accountId);
  const target = existing.find((record) => record.keyId === normalizedKeyId);
  if (!target) {
    return jsonPlan(404, {
      ok: false,
      code: 'workspace_api_key_not_found',
      message: 'API 키를 찾을 수 없습니다.'
    });
  }

  if (!target.revokedAt) {
    const now = new Date().toISOString();
    await dependencies.revokeWorkspaceApiKey(workspaceId, normalizedKeyId, now);
  }

  const next = await listActorWorkspaceApiKeys(dependencies, workspaceId, actor.accountId);
  return jsonPlan(200, {
    ok: true,
    apiKeys: next.map(toApiKeyPayload)
  });
};
