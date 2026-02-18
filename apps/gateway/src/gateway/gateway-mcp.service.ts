import { Injectable } from '@nestjs/common';
import { errorMessage } from '@ashfox/runtime/logging';
import { randomId } from '@ashfox/runtime/transport/mcp/routerUtils';
import type { HttpRequest, ResponsePlan } from '@ashfox/runtime/transport/mcp/types';
import type { FastifyRequest } from 'fastify';
import { GatewayRuntimeService } from './gateway-runtime.service';
import { normalizeHeaders, toBodyString } from './requestAdapter';

@Injectable()
export class GatewayMcpService {
  constructor(private readonly runtime: GatewayRuntimeService) {}

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
      return await this.runtime.router.handle(payload, { log: requestLog });
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
