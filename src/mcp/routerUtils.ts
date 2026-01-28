import type { ToolResponse } from '../types';
import type { JsonRpcMessage, JsonRpcResponse } from './types';
export { isRecord } from '../domain/guards';
import { toolError } from '../services/toolResponse';
import { normalizeToolResponse } from '../services/toolResponseGuard';
import { TOOL_ERROR_GENERIC } from '../shared/messages';

export const DEFAULT_PROTOCOL_VERSION = '2025-06-18';
export const DEFAULT_SUPPORTED_PROTOCOLS = ['2025-11-25', '2025-06-18', '2024-11-05'];
export const DEFAULT_SESSION_TTL_MS = 30 * 60_000;
export const SESSION_PRUNE_INTERVAL_MS = 60_000;
export const IMPLICIT_SESSION_METHODS = new Set([
  'tools/list',
  'tools/call',
  'resources/list',
  'resources/read',
  'resources/templates/list',
  'ping'
]);

export const jsonRpcError = (
  id: JsonRpcResponse['id'],
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse => ({
  jsonrpc: '2.0',
  id,
  error: { code, message, data }
});

export const jsonRpcResult = (id: JsonRpcResponse['id'], result: unknown): JsonRpcResponse => ({
  jsonrpc: '2.0',
  id,
  result
});

export const isJsonRpcMessage = (value: unknown): value is JsonRpcMessage => {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return obj.jsonrpc === '2.0' && typeof obj.method === 'string';
};

export const normalizePath = (value: string) => {
  if (!value) return '/mcp';
  const trimmed = value.startsWith('/') ? value : `/${value}`;
  return trimmed.length > 1 && trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
};

export const matchesPath = (url: string, basePath: string) => {
  try {
    const requestPath = new URL(url, 'http://localhost').pathname;
    return requestPath === basePath || requestPath.startsWith(`${basePath}/`);
  } catch (err) {
    return false;
  }
};

export const supportsSse = (acceptHeader: string | undefined) =>
  typeof acceptHeader === 'string' && acceptHeader.toLowerCase().includes('text/event-stream');

export const makeTextContent = (text: string) => [{ type: 'text', text }];

export const normalizeSessionTtl = (value?: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_SESSION_TTL_MS;
  if (!value || value <= 0) return 0;
  return Math.trunc(value);
};

export const toCallToolResult = (response: ToolResponse<unknown>) => {
  const normalized = normalizeToolResponse(response, { source: 'mcp_router', preserveContent: true });
  const nextActions = normalized.nextActions;
  const meta = Array.isArray(nextActions) && nextActions.length > 0 ? { nextActions } : null;
  if (normalized.ok) {
    if (normalized.content) {
      const result: Record<string, unknown> = { content: normalized.content };
      if (normalized.structuredContent !== undefined) {
        result.structuredContent = normalized.structuredContent;
      }
      if (meta) result._meta = meta;
      return result;
    }
    const structured = normalized.structuredContent ?? normalized.data;
    const json = JSON.stringify(structured);
    const result: Record<string, unknown> = {
      content: makeTextContent(json),
      structuredContent: structured
    };
    if (meta) result._meta = meta;
    return result;
  }
  const error = normalized.error ?? toolError('unknown', TOOL_ERROR_GENERIC);
  if (normalized.content) {
    const result: Record<string, unknown> = { isError: true, content: normalized.content };
    if (normalized.structuredContent !== undefined) {
      result.structuredContent = normalized.structuredContent;
    }
    if (meta) result._meta = meta;
    return result;
  }
  const result: Record<string, unknown> = { isError: true, content: makeTextContent(error.message), structuredContent: error };
  if (meta) result._meta = meta;
  return result;
};

export const randomId = () => {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
};
