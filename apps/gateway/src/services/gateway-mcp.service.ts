import { Injectable } from '@nestjs/common';
import { errorMessage } from '@ashfox/runtime/logging';
import { randomId } from '@ashfox/runtime/transport/mcp/routerUtils';
import type { HttpRequest, ResponsePlan } from '@ashfox/runtime/transport/mcp/types';
import type { FastifyRequest } from 'fastify';
import { GatewayRuntimeService } from './gateway-runtime.service';
import { GatewayMcpAuthService } from './gateway-mcp-auth.service';
import { normalizeHeaders, toBodyString } from '../requestAdapter';

@Injectable()
export class GatewayMcpService {
  constructor(
    private readonly runtime: GatewayRuntimeService,
    private readonly mcpAuth: GatewayMcpAuthService
  ) {}

  async handle(request: FastifyRequest): Promise<ResponsePlan> {
    const traceId = randomId();
    const method = (request.method || 'GET').toUpperCase();
    const url = request.raw.url ?? request.url ?? '/';
    const payload: HttpRequest = {
      method,
      url,
      headers: normalizeHeaders(request.headers as Record<string, unknown>),
      ...(method === 'POST' ? { body: toBodyString(request.body) } : {})
    };
    const requestLog = this.runtime.withTraceLog(traceId);

    try {
      const authResult = await this.mcpAuth.authenticate(payload.headers, requestLog);
      if (!authResult.ok) {
        return authResult.plan;
      }

      const plan = await this.runtime.router.handle(payload, {
        log: requestLog,
        principal: {
          accountId: authResult.principal.accountId,
          workspaceId: authResult.principal.workspaceId,
          systemRoles: authResult.principal.systemRoles,
          apiKeyId: authResult.principal.keyId
        }
      });
      if (method === 'DELETE') {
        const sessionId = payload.headers['mcp-session-id'];
        if (typeof sessionId === 'string' && sessionId.trim().length > 0) {
          const normalizedSessionId = sessionId.trim();
          try {
            const released = await this.runtime.dashboardStore.releaseProjectLocksByOwner(
              `mcp:${normalizedSessionId}`,
              normalizedSessionId
            );
            this.runtime.metrics.recordProjectLockEvent('release_by_session', released > 0 ? 'success' : 'skipped');
          } catch (error) {
            this.runtime.metrics.recordProjectLockEvent('release_by_session', 'error');
            requestLog.warn('failed to release session project locks', {
              sessionId: normalizedSessionId,
              message: errorMessage(error)
            });
          }
        }
      }
      return plan;
    } catch (error) {
      requestLog.error('MCP HTTP request failed', { message: errorMessage(error) });
      return {
        kind: 'json',
        status: 500,
        headers: {
          'content-type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify({
          error: {
            code: 'internal_error',
            message: 'Internal server error.'
          }
        })
      };
    }
  }
}
