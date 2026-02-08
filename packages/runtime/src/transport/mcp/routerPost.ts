import type { Logger } from '../../logging';
import {
  MCP_JSONRPC_INVALID_REQUEST,
  MCP_JSONRPC_PARSE_ERROR,
  MCP_UNSUPPORTED_PROTOCOL
} from '../../shared/messages';
import type { JsonRpcMessage, JsonRpcResponse } from './types';
import { isJsonRpcMessage, jsonRpcError } from './routerUtils';

export type ParsedPostMessage =
  | { ok: true; message: JsonRpcMessage; id: JsonRpcResponse['id'] }
  | { ok: false; error: JsonRpcResponse };

export const isJsonContentType = (contentType: string | undefined): boolean =>
  typeof contentType === 'string' && contentType.toLowerCase().includes('application/json');

export const parsePostMessage = (rawBody: string, log: Logger): ParsedPostMessage => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody || '{}');
  } catch (error) {
    log.warn('mcp post parse failed', { message: String((error as { message?: unknown })?.message ?? error) });
    return { ok: false, error: jsonRpcError(null, -32700, MCP_JSONRPC_PARSE_ERROR) };
  }
  if (!isJsonRpcMessage(parsed)) {
    return { ok: false, error: jsonRpcError(null, -32600, MCP_JSONRPC_INVALID_REQUEST) };
  }
  const message = parsed as JsonRpcMessage;
  const id = 'id' in message ? message.id ?? null : null;
  return { ok: true, message, id };
};

export const validateProtocolHeader = (
  id: JsonRpcResponse['id'],
  protocolHeader: string | undefined,
  supportedProtocols: string[]
): JsonRpcResponse | null => {
  if (protocolHeader && !supportedProtocols.includes(protocolHeader)) {
    return jsonRpcError(id, -32600, MCP_UNSUPPORTED_PROTOCOL(protocolHeader));
  }
  return null;
};
