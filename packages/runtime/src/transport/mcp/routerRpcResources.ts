import { MCP_RESOURCE_NOT_FOUND, MCP_URI_REQUIRED } from '../../shared/messages';
import type { JsonRpcMessage, JsonRpcResponse } from './types';
import type { RpcContext, RpcOutcome } from './routerRpcTypes';
import { isRecord, jsonRpcError, jsonRpcResult } from './routerUtils';

export const handleResourcesList = (
  ctx: RpcContext,
  id: JsonRpcResponse['id']
): RpcOutcome => {
  const list = ctx.resources?.list() ?? [];
  return {
    type: 'response',
    response: jsonRpcResult(id, { resources: list, nextCursor: null }),
    status: 200
  };
};

export const handleResourcesRead = (
  ctx: RpcContext,
  message: JsonRpcMessage,
  id: JsonRpcResponse['id']
): RpcOutcome => {
  const params = isRecord(message.params) ? message.params : {};
  const uri = typeof params.uri === 'string' ? params.uri : '';
  if (!uri) {
    return { type: 'response', response: jsonRpcError(id, -32602, MCP_URI_REQUIRED), status: 400 };
  }
  const entry = ctx.resources?.read(uri) ?? null;
  if (!entry) {
    return { type: 'response', response: jsonRpcError(id, -32602, MCP_RESOURCE_NOT_FOUND), status: 404 };
  }
  return {
    type: 'response',
    response: jsonRpcResult(id, {
      contents: [
        {
          uri: entry.uri,
          mimeType: entry.mimeType,
          text: entry.text
        }
      ]
    }),
    status: 200
  };
};

export const handleResourceTemplatesList = (
  ctx: RpcContext,
  id: JsonRpcResponse['id']
): RpcOutcome => {
  const templates = ctx.resources?.listTemplates() ?? [];
  return {
    type: 'response',
    response: jsonRpcResult(id, { resourceTemplates: templates, nextCursor: null }),
    status: 200
  };
};
