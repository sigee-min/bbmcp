import type { JsonRpcMessage, JsonRpcResponse } from './types';
import type { McpSession } from './session';
import type { RpcContext, RpcOutcome } from './routerRpcTypes';
import { handleToolCall } from './routerRpcToolCall';
import {
  handleResourceTemplatesList,
  handleResourcesList,
  handleResourcesRead
} from './routerRpcResources';
import {
  DEFAULT_PROTOCOL_VERSION,
  DEFAULT_SUPPORTED_PROTOCOLS,
  isJsonRpcMessage,
  isRecord,
  jsonRpcError,
  jsonRpcResult
} from './routerUtils';
import {
  MCP_INITIALIZE_REQUIRES_ID,
  MCP_JSONRPC_INVALID_REQUEST,
  MCP_METHOD_NOT_FOUND,
  MCP_SERVER_NOT_INITIALIZED,
  MCP_SESSION_UNAVAILABLE
} from '../../shared/messages';

type InitializedMethodHandler = (
  ctx: RpcContext,
  message: JsonRpcMessage,
  session: McpSession,
  id: JsonRpcResponse['id']
) => RpcOutcome | Promise<RpcOutcome>;

const pickProtocolVersion = (supported: string[], requested: string) =>
  supported.includes(requested) ? requested : DEFAULT_PROTOCOL_VERSION;

const buildInitializeResponse = (
  ctx: RpcContext,
  protocolVersion: string,
  id: JsonRpcResponse['id']
): RpcOutcome => ({
  type: 'response',
  response: jsonRpcResult(id, {
    protocolVersion,
    capabilities: { tools: { listChanged: true }, resources: { listChanged: Boolean(ctx.resources) } },
    serverInfo: ctx.config.serverInfo,
    instructions: ctx.config.instructions
  }),
  status: 200
});

const handleInitialize = (
  ctx: RpcContext,
  message: JsonRpcMessage,
  session: McpSession | null,
  id: JsonRpcResponse['id'],
  isNotification: boolean,
  supportedProtocols: string[]
): RpcOutcome => {
  if (isNotification || id === null) {
    return { type: 'response', response: jsonRpcError(id, -32600, MCP_INITIALIZE_REQUIRES_ID), status: 400 };
  }
  if (!session) {
    return { type: 'response', response: jsonRpcError(id, -32000, MCP_SESSION_UNAVAILABLE), status: 400 };
  }
  const params = isRecord(message.params) ? message.params : {};
  const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : DEFAULT_PROTOCOL_VERSION;
  const protocolVersion = pickProtocolVersion(supportedProtocols, requested);
  session.protocolVersion = protocolVersion;
  session.initialized = true;
  return buildInitializeResponse(ctx, protocolVersion, id);
};

const initializedHandlers: Record<string, InitializedMethodHandler> = {
  'tools/list': (ctx, _message, _session, id) => ({
    type: 'response',
    response: jsonRpcResult(id, { tools: ctx.toolRegistry.tools }),
    status: 200
  }),
  'tools/call': (ctx, message, session, id) => handleToolCall(ctx, message, session, id),
  'resources/list': (ctx, _message, _session, id) => handleResourcesList(ctx, id),
  'resources/read': (ctx, message, _session, id) => handleResourcesRead(ctx, message, id),
  'resources/templates/list': (ctx, _message, _session, id) => handleResourceTemplatesList(ctx, id),
  ping: (_ctx, _message, _session, id) => ({
    type: 'response',
    response: jsonRpcResult(id, {}),
    status: 200
  })
};

export const handleMessage = async (
  ctx: RpcContext,
  message: JsonRpcMessage,
  session: McpSession | null,
  id: JsonRpcResponse['id']
): Promise<RpcOutcome> => {
  const isNotification = !('id' in message);
  const supportedProtocols = ctx.supportedProtocols ?? DEFAULT_SUPPORTED_PROTOCOLS;
  if (!isJsonRpcMessage(message)) {
    return { type: 'response', response: jsonRpcError(id, -32600, MCP_JSONRPC_INVALID_REQUEST), status: 400 };
  }

  if (message.method === 'initialize') {
    return handleInitialize(ctx, message, session, id, isNotification, supportedProtocols);
  }

  if (message.method === 'notifications/initialized') {
    if (session) session.initialized = true;
    return { type: 'notification' };
  }

  if (!session || !session.initialized) {
    return { type: 'response', response: jsonRpcError(id, -32000, MCP_SERVER_NOT_INITIALIZED), status: 400 };
  }
  if (isNotification) {
    return { type: 'notification' };
  }

  const handler = initializedHandlers[message.method];
  if (!handler) {
    return {
      type: 'response',
      response: jsonRpcError(id, -32601, MCP_METHOD_NOT_FOUND(message.method)),
      status: 400
    };
  }
  return await handler(ctx, message, session, id);
};

export type { RpcContext, RpcOutcome } from './routerRpcTypes';
export { handleToolCall } from './routerRpcToolCall';
