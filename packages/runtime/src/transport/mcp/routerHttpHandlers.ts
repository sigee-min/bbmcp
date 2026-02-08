import type { HttpRequest, ResponsePlan } from './types';
import type { McpSession, SessionStore } from './session';
import { encodeSseComment } from './sse';
import { supportsSse } from './routerUtils';
import {
  MCP_ACCEPT_SSE_REQUIRED,
  MCP_SESSION_ID_REQUIRED,
  MCP_TOO_MANY_SSE
} from '../../shared/messages';

const MAX_SSE_CONNECTIONS_PER_SESSION = 3;

type RouterHttpContext = {
  sessions: SessionStore;
  getSessionFromHeaders: (headers: Record<string, string>) => McpSession | null;
  baseHeaders: (protocolVersion?: string | null) => Record<string, string>;
  jsonResponse: (status: number, body: unknown) => ResponsePlan;
};

export const handleSseGet = (ctx: RouterHttpContext, req: HttpRequest): ResponsePlan => {
  if (!supportsSse(req.headers.accept)) {
    return ctx.jsonResponse(406, { error: { code: 'not_acceptable', message: MCP_ACCEPT_SSE_REQUIRED } });
  }
  const session = ctx.getSessionFromHeaders(req.headers);
  if (!session) {
    return ctx.jsonResponse(400, { error: { code: 'invalid_state', message: MCP_SESSION_ID_REQUIRED } });
  }

  if (session.sseConnections.size >= MAX_SSE_CONNECTIONS_PER_SESSION) {
    return ctx.jsonResponse(429, {
      error: { code: 'too_many_requests', message: MCP_TOO_MANY_SSE }
    });
  }
  ctx.sessions.touch(session);

  const headers = ctx.baseHeaders(session.protocolVersion);
  headers['Content-Type'] = 'text/event-stream';
  headers['Cache-Control'] = 'no-cache';
  headers.Connection = 'keep-alive';
  headers['X-Accel-Buffering'] = 'no';

  return {
    kind: 'sse',
    status: 200,
    headers,
    events: [encodeSseComment('stream open')],
    close: false,
    onOpen: (conn) => {
      ctx.sessions.attachSse(session, conn);
      return () => ctx.sessions.detachSse(session, conn);
    }
  };
};

export const handleSessionDelete = (ctx: RouterHttpContext, req: HttpRequest): ResponsePlan => {
  const session = ctx.getSessionFromHeaders(req.headers);
  if (!session) {
    return ctx.jsonResponse(400, { error: { code: 'invalid_state', message: MCP_SESSION_ID_REQUIRED } });
  }
  ctx.sessions.close(session);
  return ctx.jsonResponse(200, { ok: true });
};
