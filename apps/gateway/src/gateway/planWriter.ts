import { openSseConnection } from '@ashfox/runtime/transport/mcp/transport';
import type { ResponsePlan } from '@ashfox/runtime/transport/mcp/types';
import type { FastifyReply } from 'fastify';

export const applyHeaders = (reply: FastifyReply, headers: Record<string, string>): void => {
  for (const [key, value] of Object.entries(headers)) {
    reply.header(key, value);
  }
};

const applyRawHeaders = (reply: FastifyReply, headers: Record<string, string>): void => {
  for (const [key, value] of Object.entries(headers)) {
    reply.raw.setHeader(key, value);
  }
};

export const writePlan = (reply: FastifyReply, plan: ResponsePlan): void => {
  if (plan.kind === 'sse') {
    reply.hijack();
    reply.raw.statusCode = plan.status;
    applyRawHeaders(reply, plan.headers);
    for (const event of plan.events) {
      reply.raw.write(event);
    }
    if (plan.onOpen || !plan.close) {
      openSseConnection(
        {
          send: (payload) => reply.raw.write(payload),
          close: () => {
            try {
              reply.raw.end();
            } catch (_error) {
              reply.raw.destroy();
            }
          },
          onClose: (handler) => reply.raw.on('close', handler)
        },
        plan.onOpen
      );
      if (plan.close) {
        reply.raw.end();
      }
      return;
    }
    reply.raw.end();
    return;
  }

  reply.code(plan.status);
  applyHeaders(reply, plan.headers);
  if (plan.kind === 'json') {
    reply.send(plan.body);
    return;
  }
  if (plan.kind === 'binary') {
    reply.send(Buffer.from(plan.body));
    return;
  }
  reply.send();
};
