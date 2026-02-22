import { Injectable } from '@nestjs/common';
import type { Logger } from '@ashfox/runtime/logging';
import type { ResponsePlan } from '@ashfox/runtime/transport/mcp/types';
import { hashApiKeySecret, parseBearerApiKeySecret } from '../security/apiKeySecrets';
import { GatewayRuntimeService } from './gateway-runtime.service';

export interface GatewayMcpPrincipal {
  keySpace: 'workspace' | 'service';
  workspaceId?: string;
  accountId: string;
  systemRoles: string[];
  keyId: string;
}

type GatewayMcpAuthResult =
  | {
      ok: true;
      principal: GatewayMcpPrincipal;
    }
  | {
      ok: false;
      plan: ResponsePlan;
    };

const MCP_UNAUTHORIZED_HEADERS = {
  'content-type': 'application/json; charset=utf-8'
} as const;

const toUnauthorizedPlan = (code: string, message: string): ResponsePlan => ({
  kind: 'json',
  status: 401,
  headers: { ...MCP_UNAUTHORIZED_HEADERS },
  body: JSON.stringify({
    error: {
      code,
      message
    }
  })
});

const isExpiredAt = (expiresAt: string | null): boolean => {
  if (!expiresAt) {
    return false;
  }
  const expiresAtTs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtTs)) {
    return true;
  }
  return expiresAtTs <= Date.now();
};

@Injectable()
export class GatewayMcpAuthService {
  constructor(private readonly runtime: GatewayRuntimeService) {}

  async authenticate(
    headers: Record<string, string>,
    log?: Logger
  ): Promise<GatewayMcpAuthResult> {
    const secret = parseBearerApiKeySecret(headers.authorization);
    if (!secret) {
      return {
        ok: false,
        plan: toUnauthorizedPlan(
          'mcp_api_key_required',
          'MCP API key is required. Provide Authorization: Bearer <api_key>.'
        )
      };
    }

    const keyHash = hashApiKeySecret(secret);
    const repository = this.runtime.persistence.workspaceRepository;
    const workspaceKey = await repository.findWorkspaceApiKeyByHash(keyHash);
    const serviceKey = workspaceKey ? null : await repository.findServiceApiKeyByHash(keyHash);
    if (!workspaceKey && !serviceKey) {
      return {
        ok: false,
        plan: toUnauthorizedPlan('mcp_api_key_invalid', 'Invalid MCP API key.')
      };
    }
    const keyRecord = workspaceKey ?? serviceKey;
    if (!keyRecord) {
      return {
        ok: false,
        plan: toUnauthorizedPlan('mcp_api_key_invalid', 'Invalid MCP API key.')
      };
    }
    if (keyRecord.revokedAt) {
      return {
        ok: false,
        plan: toUnauthorizedPlan('mcp_api_key_revoked', 'This API key has been revoked.')
      };
    }
    if (isExpiredAt(keyRecord.expiresAt ?? null)) {
      return {
        ok: false,
        plan: toUnauthorizedPlan('mcp_api_key_expired', 'This API key has expired.')
      };
    }

    const account = await repository.getAccount(keyRecord.createdBy);
    if (!account) {
      return {
        ok: false,
        plan: toUnauthorizedPlan('mcp_account_not_found', 'Account is unavailable for this API key.')
      };
    }

    const now = new Date().toISOString();
    if (workspaceKey) {
      const workspace = await repository.getWorkspace(workspaceKey.workspaceId);
      if (!workspace) {
        return {
          ok: false,
          plan: toUnauthorizedPlan('mcp_workspace_not_found', 'Workspace is unavailable for this API key.')
        };
      }
      try {
        await repository.updateWorkspaceApiKeyLastUsed(
          workspaceKey.workspaceId,
          workspaceKey.keyId,
          now
        );
      } catch (error) {
        log?.warn('failed to update mcp api key last_used_at', {
          keySpace: 'workspace',
          workspaceId: workspaceKey.workspaceId,
          keyId: workspaceKey.keyId,
          message: error instanceof Error ? error.message : String(error)
        });
      }
      return {
        ok: true,
        principal: {
          keySpace: 'workspace',
          workspaceId: workspaceKey.workspaceId,
          accountId: workspaceKey.createdBy,
          systemRoles: [...account.systemRoles],
          keyId: workspaceKey.keyId
        }
      };
    }

    try {
      await repository.updateServiceApiKeyLastUsed(keyRecord.createdBy, keyRecord.keyId, now);
    } catch (error) {
      log?.warn('failed to update mcp api key last_used_at', {
        keySpace: 'service',
        accountId: keyRecord.createdBy,
        keyId: keyRecord.keyId,
        message: error instanceof Error ? error.message : String(error)
      });
    }

    return {
      ok: true,
      principal: {
        keySpace: 'service',
        accountId: keyRecord.createdBy,
        systemRoles: [...account.systemRoles],
        keyId: keyRecord.keyId
      }
    };
  }
}
