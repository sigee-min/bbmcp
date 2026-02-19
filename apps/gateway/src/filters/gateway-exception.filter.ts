import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { Logger } from '@ashfox/runtime/logging';
import type { FastifyReply, FastifyRequest } from 'fastify';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toMessage = (response: unknown, fallback: string): string => {
  if (typeof response === 'string' && response.trim().length > 0) {
    return response;
  }
  if (isRecord(response)) {
    const message = response.message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
    if (Array.isArray(message) && message.length > 0 && typeof message[0] === 'string') {
      return String(message[0]);
    }
  }
  return fallback;
};

const toApiCode = (status: number): string => {
  if (status === 400) return 'invalid_payload';
  if (status === 404) return 'not_found';
  if (status === 405) return 'method_not_allowed';
  if (status === 401) return 'unauthorized';
  return 'internal_error';
};

@Catch()
export class GatewayExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<FastifyRequest>();
    const reply = ctx.getResponse<FastifyReply>();
    const path = request.raw.url ?? request.url ?? '/';

    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const response = exception instanceof HttpException ? exception.getResponse() : null;
    const message = toMessage(response, 'Internal server error.');
    const code = toApiCode(status);

    if (status >= 500) {
      this.logger.error('ashfox gateway request failed', {
        path,
        status,
        message,
        error: exception instanceof Error ? exception.stack ?? exception.message : String(exception)
      });
    }

    if (reply.sent) {
      return;
    }

    if (path.startsWith('/api/')) {
      reply.code(status).send({
        ok: false,
        code,
        message
      });
      return;
    }

    if (path === '/mcp' || path.startsWith('/mcp/')) {
      reply.code(status).send({
        error: {
          code,
          message
        }
      });
      return;
    }

    reply.code(status).send({
      statusCode: status,
      message
    });
  }
}
