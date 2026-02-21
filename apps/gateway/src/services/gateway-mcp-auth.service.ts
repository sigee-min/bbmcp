import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Logger } from '@ashfox/runtime/logging';
import type { ResponsePlan } from '@ashfox/runtime/transport/mcp/types';
import { GatewayRuntimeService } from './gateway-runtime.service';

export interface GatewayMcpPrincipal {
  workspaceId: string;
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

const parseBearerSecret = (authorization: string | undefined): string | null => {
  if (typeof authorization !== 'string') {
    return null;
  }
  const trimmed = authorization.trim();
  if (!trimmed) {
    return null;
  }
  const matched = /^Bearer\s+(.+)$/i.exec(trimmed);
  if (!matched) {
    return null;
  }
  const secret = matched[1]?.trim();
  return secret && secret.length > 0 ? secret : null;
};

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
    const secret = parseBearerSecret(headers.authorization);
    if (!secret) {
      return {
        ok: false,
        plan: toUnauthorizedPlan(
          'mcp_api_key_required',
          'MCP API key is required. Provide Authorization: Bearer <api_key>.'
        )
      };
    }

    const keyHash = createHash('sha256').update(secret).digest('hex');
    const keyRecord = await this.runtime.persistence.workspaceRepository.findWorkspaceApiKeyByHash(
      keyHash
    );
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
    if (isExpiredAt(keyRecord.expiresAt)) {
      return {
        ok: false,
        plan: toUnauthorizedPlan('mcp_api_key_expired', 'This API key has expired.')
      };
    }

    const workspace = await this.runtime.persistence.workspaceRepository.getWorkspace(
      keyRecord.workspaceId
    );
    if (!workspace) {
      return {
        ok: false,
        plan: toUnauthorizedPlan('mcp_workspace_not_found', 'Workspace is unavailable for this API key.')
      };
    }

    const account = await this.runtime.persistence.workspaceRepository.getAccount(
      keyRecord.createdBy
    );
    if (!account) {
      return {
        ok: false,
        plan: toUnauthorizedPlan('mcp_account_not_found', 'Account is unavailable for this API key.')
      };
    }

    const now = new Date().toISOString();
    try {
      await this.runtime.persistence.workspaceRepository.updateWorkspaceApiKeyLastUsed(
        keyRecord.workspaceId,
        keyRecord.keyId,
        now
      );
    } catch (error) {
      log?.warn('failed to update mcp api key last_used_at', {
        workspaceId: keyRecord.workspaceId,
        keyId: keyRecord.keyId,
        message: error instanceof Error ? error.message : String(error)
      });
    }

    return {
      ok: true,
      principal: {
        workspaceId: keyRecord.workspaceId,
        accountId: keyRecord.createdBy,
        systemRoles: [...account.systemRoles],
        keyId: keyRecord.keyId
      }
    };
  }
}
