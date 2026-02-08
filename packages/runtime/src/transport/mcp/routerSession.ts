import type { JsonRpcMessage, JsonRpcResponse } from './types';
import { DEFAULT_PROTOCOL_VERSION, IMPLICIT_SESSION_METHODS, jsonRpcError, randomId } from './routerUtils';
import { MCP_PROTOCOL_VERSION_MISMATCH, MCP_SESSION_ID_REQUIRED } from '../../shared/messages';
import type { McpSession, SessionStore } from './session';

export const getSessionFromHeaders = (sessions: SessionStore, headers: Record<string, string>): McpSession | null => {
  const id = headers['mcp-session-id'];
  if (!id) return null;
  return sessions.get(id);
};

export const resolveSession = (
  sessions: SessionStore,
  message: JsonRpcMessage,
  id: JsonRpcResponse['id'],
  protocolHeader: string | undefined,
  headers: Record<string, string>
):
  | { ok: true; session: McpSession; newSessionId?: string }
  | { ok: false; status: number; error: JsonRpcResponse } => {
  if (message.method === 'initialize') {
    const newId = randomId();
    const session = sessions.create(newId, protocolHeader ?? DEFAULT_PROTOCOL_VERSION);
    return { ok: true, session, newSessionId: newId };
  }
  const session = getSessionFromHeaders(sessions, headers);
  if (!session) {
    if (IMPLICIT_SESSION_METHODS.has(message.method)) {
      const newId = randomId();
      const implicit = sessions.create(newId, protocolHeader ?? DEFAULT_PROTOCOL_VERSION);
      implicit.initialized = true;
      return { ok: true, session: implicit, newSessionId: newId };
    }
    return {
      ok: false,
      status: 400,
      error: jsonRpcError(id, -32000, MCP_SESSION_ID_REQUIRED)
    };
  }
  if (protocolHeader && session.protocolVersion !== protocolHeader) {
    return {
      ok: false,
      status: 400,
      error: jsonRpcError(id, -32600, MCP_PROTOCOL_VERSION_MISMATCH)
    };
  }
  return { ok: true, session };
};
