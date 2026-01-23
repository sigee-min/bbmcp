import { Logger } from '../logging';
import { ToolResponse } from '../types';
import { ToolExecutor } from './executor';
import {
  HttpRequest,
  JsonRpcMessage,
  JsonRpcResponse,
  McpServerConfig,
  ResponsePlan
} from './types';
import { MCP_TOOLS, getToolSchema, isKnownTool } from './tools';
import { validateSchema } from './validation';
import { McpSession, SessionStore } from './session';
import { encodeSseComment, encodeSseEvent } from './sse';
import { ResourceStore } from '../ports/resources';

const DEFAULT_PROTOCOL_VERSION = '2025-06-18';
const DEFAULT_SUPPORTED_PROTOCOLS = ['2025-11-25', '2025-06-18', '2024-11-05'];
const DEFAULT_SESSION_TTL_MS = 30 * 60_000;
const SESSION_PRUNE_INTERVAL_MS = 60_000;
const IMPLICIT_SESSION_METHODS = new Set([
  'tools/list',
  'tools/call',
  'resources/list',
  'resources/read',
  'resources/templates/list',
  'ping'
]);

type RpcOutcome =
  | { type: 'notification' }
  | { type: 'response'; response: JsonRpcResponse; status: number };

const jsonRpcError = (id: JsonRpcResponse['id'], code: number, message: string, data?: unknown): JsonRpcResponse => ({
  jsonrpc: '2.0',
  id,
  error: { code, message, data }
});

const jsonRpcResult = (id: JsonRpcResponse['id'], result: unknown): JsonRpcResponse => ({
  jsonrpc: '2.0',
  id,
  result
});

const isJsonRpcMessage = (value: unknown): value is JsonRpcMessage => {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return obj.jsonrpc === '2.0' && typeof obj.method === 'string';
};

const normalizePath = (value: string) => {
  if (!value) return '/mcp';
  const trimmed = value.startsWith('/') ? value : `/${value}`;
  return trimmed.length > 1 && trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
};

const matchesPath = (url: string, basePath: string) => {
  try {
    const requestPath = new URL(url, 'http://localhost').pathname;
    return requestPath === basePath || requestPath.startsWith(`${basePath}/`);
  } catch {
    return false;
  }
};

const supportsSse = (acceptHeader: string | undefined) =>
  typeof acceptHeader === 'string' && acceptHeader.toLowerCase().includes('text/event-stream');

const makeTextContent = (text: string) => [{ type: 'text', text }];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeSessionTtl = (value?: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_SESSION_TTL_MS;
  if (!value || value <= 0) return 0;
  return Math.trunc(value);
};

const toCallToolResult = (response: ToolResponse<unknown>) => {
  if (response.ok) {
    if (response.content) {
      const result: Record<string, unknown> = { content: response.content };
      if (response.structuredContent !== undefined) {
        result.structuredContent = response.structuredContent;
      }
      return result;
    }
    const json = JSON.stringify(response.structuredContent ?? response.data);
    return { content: makeTextContent(json), structuredContent: response.structuredContent ?? response.data };
  }
  const error = response.error ?? { code: 'unknown', message: 'tool error' };
  if (response.content) {
    const result: Record<string, unknown> = { isError: true, content: response.content };
    if (response.structuredContent !== undefined) {
      result.structuredContent = response.structuredContent;
    }
    return result;
  }
  return { isError: true, content: makeTextContent(error.message), structuredContent: error };
};

const randomId = () => {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
};

export class McpRouter {
  private readonly config: McpServerConfig;
  private readonly executor: ToolExecutor;
  private readonly log: Logger;
  private readonly resources?: ResourceStore;
  private readonly sessions = new SessionStore();
  private readonly supportedProtocols: string[];
  private readonly sessionTtlMs: number;
  private lastPruneAt = 0;

  constructor(config: McpServerConfig, executor: ToolExecutor, log: Logger, resources?: ResourceStore) {
    this.config = { ...config, path: normalizePath(config.path) };
    this.executor = executor;
    this.log = log;
    this.resources = resources;
    this.supportedProtocols = config.supportedProtocols ?? DEFAULT_SUPPORTED_PROTOCOLS;
    this.sessionTtlMs = normalizeSessionTtl(config.sessionTtlMs);
  }

  async handle(req: HttpRequest): Promise<ResponsePlan> {
    this.pruneSessions();
    const method = (req.method || 'GET').toUpperCase();
    const url = req.url || '/';
    if (!matchesPath(url, this.config.path)) {
      return this.jsonResponse(404, { error: { code: 'not_found', message: 'not found' } });
    }

    if (this.config.token) {
      const auth = req.headers.authorization ?? '';
      if (auth !== `Bearer ${this.config.token}`) {
        return this.jsonResponse(401, { error: { code: 'unauthorized', message: 'unauthorized' } });
      }
    }

    if (method === 'GET') {
      return this.handleGet(req);
    }
    if (method === 'DELETE') {
      return this.handleDelete(req);
    }
    if (method !== 'POST') {
      return this.jsonResponse(405, { error: { code: 'method_not_allowed', message: 'method not allowed' } });
    }
    return this.handlePost(req);
  }

  private handleGet(req: HttpRequest): ResponsePlan {
    if (!supportsSse(req.headers.accept)) {
      return this.jsonResponse(406, { error: { code: 'not_acceptable', message: 'accept text/event-stream required' } });
    }
    const session = this.getSessionFromHeaders(req.headers);
    if (!session) {
      return this.jsonResponse(400, { error: { code: 'invalid_state', message: 'Mcp-Session-Id required' } });
    }
    this.sessions.touch(session);

    const headers = this.baseHeaders(session.protocolVersion);
    headers['Content-Type'] = 'text/event-stream';
    headers['Cache-Control'] = 'no-cache';
    headers.Connection = 'keep-alive';

    return {
      kind: 'sse',
      status: 200,
      headers,
      events: [encodeSseComment('stream open')],
      close: false,
      onOpen: (conn) => {
        this.sessions.attachSse(session, conn);
        return () => this.sessions.detachSse(session, conn);
      }
    };
  }

  private handleDelete(req: HttpRequest): ResponsePlan {
    const session = this.getSessionFromHeaders(req.headers);
    if (!session) {
      return this.jsonResponse(400, { error: { code: 'invalid_state', message: 'Mcp-Session-Id required' } });
    }
    this.sessions.close(session);
    return this.jsonResponse(200, { ok: true });
  }

  private async handlePost(req: HttpRequest): Promise<ResponsePlan> {
    const contentType = (req.headers['content-type'] ?? '').toLowerCase();
    if (!contentType.includes('application/json')) {
      return this.jsonResponse(415, { error: { code: 'invalid_payload', message: 'content-type must be application/json' } });
    }
    const rawBody = req.body ?? '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody || '{}');
    } catch {
      const error = jsonRpcError(null, -32700, 'Parse error');
      return this.jsonResponse(400, error);
    }

    if (!isJsonRpcMessage(parsed)) {
      const error = jsonRpcError(null, -32600, 'Invalid Request');
      return this.jsonResponse(400, error);
    }

    const message = parsed as JsonRpcMessage;
    const id = 'id' in message ? message.id ?? null : null;

    const protocolHeader = req.headers['mcp-protocol-version'];
    if (protocolHeader && !this.supportedProtocols.includes(protocolHeader)) {
      const error = jsonRpcError(id, -32600, `Unsupported protocol version: ${protocolHeader}`);
      return this.jsonResponse(400, error);
    }

    const sessionResult = this.resolveSession(message, id, protocolHeader, req.headers);
    if (!sessionResult.ok) {
      return this.jsonResponse(sessionResult.status, sessionResult.error);
    }
    this.sessions.touch(sessionResult.session);

    const outcome = await this.handleMessage(message, sessionResult.session, id);
    if (outcome.type === 'notification') {
      return this.emptyResponse(202, this.baseHeaders(sessionResult.session?.protocolVersion));
    }

    const headers = this.baseHeaders(sessionResult.session?.protocolVersion);
    if (sessionResult.newSessionId) {
      headers['Mcp-Session-Id'] = sessionResult.newSessionId;
    }

    const acceptSse = supportsSse(req.headers.accept);
    if (acceptSse) {
      return {
        kind: 'sse',
        status: outcome.status,
        headers: {
          ...headers,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        },
        events: [encodeSseEvent(JSON.stringify(outcome.response))],
        close: true
      };
    }

    return {
      kind: 'json',
      status: outcome.status,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(outcome.response)
    };
  }

  private async handleMessage(
    message: JsonRpcMessage,
    session: McpSession | null,
    id: JsonRpcResponse['id']
  ): Promise<RpcOutcome> {
    const isNotification = !('id' in message);

    if (message.method === 'initialize') {
      if (isNotification || id === null) {
        return { type: 'response', response: jsonRpcError(id, -32600, 'initialize requires id'), status: 400 };
      }
      if (!session) {
        return { type: 'response', response: jsonRpcError(id, -32000, 'Session unavailable'), status: 400 };
      }
      const params = isRecord(message.params) ? message.params : {};
      const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : DEFAULT_PROTOCOL_VERSION;
      const protocolVersion = this.pickProtocolVersion(requested);
      session.protocolVersion = protocolVersion;
      session.initialized = true;
      const result = {
        protocolVersion,
        capabilities: { tools: { listChanged: true }, resources: { listChanged: Boolean(this.resources) } },
        serverInfo: this.config.serverInfo,
        instructions: this.config.instructions
      };
      return { type: 'response', response: jsonRpcResult(id, result), status: 200 };
    }

    if (message.method === 'notifications/initialized') {
      if (session) session.initialized = true;
      return { type: 'notification' };
    }

    if (!session || !session.initialized) {
      return { type: 'response', response: jsonRpcError(id, -32000, 'Server not initialized'), status: 400 };
    }

    if (isNotification) {
      return { type: 'notification' };
    }

    if (message.method === 'tools/list') {
      const result = { tools: MCP_TOOLS };
      return { type: 'response', response: jsonRpcResult(id, result), status: 200 };
    }

    if (message.method === 'tools/call') {
      return this.handleToolCall(message, session, id);
    }

    if (message.method === 'resources/list') {
      const list = this.resources?.list() ?? [];
      const result = { resources: list, nextCursor: null };
      return { type: 'response', response: jsonRpcResult(id, result), status: 200 };
    }

    if (message.method === 'resources/read') {
      const params = isRecord(message.params) ? message.params : {};
      const uri = typeof params.uri === 'string' ? params.uri : '';
      if (!uri) {
        return { type: 'response', response: jsonRpcError(id, -32602, 'uri is required'), status: 400 };
      }
      const entry = this.resources?.read(uri) ?? null;
      if (!entry) {
        return {
          type: 'response',
          response: jsonRpcError(id, -32602, 'Resource not found'),
          status: 404
        };
      }
      const result = {
        contents: [
          {
            uri: entry.uri,
            mimeType: entry.mimeType,
            text: entry.text
          }
        ]
      };
      return { type: 'response', response: jsonRpcResult(id, result), status: 200 };
    }

    if (message.method === 'resources/templates/list') {
      const templates = this.resources?.listTemplates() ?? [];
      const result = { resourceTemplates: templates, nextCursor: null };
      return { type: 'response', response: jsonRpcResult(id, result), status: 200 };
    }

    if (message.method === 'ping') {
      return { type: 'response', response: jsonRpcResult(id, {}), status: 200 };
    }

    return {
      type: 'response',
      response: jsonRpcError(id, -32601, `Method not found: ${message.method}`),
      status: 400
    };
  }

  private async handleToolCall(
    message: JsonRpcMessage,
    session: McpSession,
    id: JsonRpcResponse['id']
  ): Promise<RpcOutcome> {
    const params = isRecord(message.params) ? message.params : {};
    const name = typeof params.name === 'string' ? params.name : null;
    if (!name) {
      return { type: 'response', response: jsonRpcError(id, -32602, 'Tool name is required'), status: 400 };
    }
    if (!isKnownTool(name)) {
      return { type: 'response', response: jsonRpcError(id, -32602, `Unknown tool: ${name}`), status: 400 };
    }
    const args = isRecord(params.arguments) ? params.arguments : {};
    const schema = getToolSchema(name);
    if (schema) {
      const validation = validateSchema(schema, args);
      if (!validation.ok) {
        return { type: 'response', response: jsonRpcError(id, -32602, validation.message), status: 400 };
      }
    }

    this.sessions.touch(session);
    try {
      const response = await this.executor.callTool(name, args);
      const result = toCallToolResult(response);
      return { type: 'response', response: jsonRpcResult(id, result), status: 200 };
    } catch (err) {
      const messageText = err instanceof Error ? err.message : 'tool execution failed';
      const result = { isError: true, content: makeTextContent(messageText) };
      return { type: 'response', response: jsonRpcResult(id, result), status: 200 };
    }
  }

  private pickProtocolVersion(requested: string) {
    return this.supportedProtocols.includes(requested) ? requested : DEFAULT_PROTOCOL_VERSION;
  }

  private resolveSession(
    message: JsonRpcMessage,
    id: JsonRpcResponse['id'],
    protocolHeader: string | undefined,
    headers: Record<string, string>
  ):
    | { ok: true; session: McpSession; newSessionId?: string }
    | { ok: false; status: number; error: JsonRpcResponse } {
    if (message.method === 'initialize') {
      const newId = randomId();
      const session = this.sessions.create(newId, protocolHeader ?? DEFAULT_PROTOCOL_VERSION);
      return { ok: true, session, newSessionId: newId };
    }
    const session = this.getSessionFromHeaders(headers);
    if (!session) {
      if (IMPLICIT_SESSION_METHODS.has(message.method)) {
        const newId = randomId();
        const implicit = this.sessions.create(newId, protocolHeader ?? DEFAULT_PROTOCOL_VERSION);
        implicit.initialized = true;
        return { ok: true, session: implicit, newSessionId: newId };
      }
      return {
        ok: false,
        status: 400,
        error: jsonRpcError(id, -32000, 'Mcp-Session-Id required')
      };
    }
    if (protocolHeader && session.protocolVersion !== protocolHeader) {
      return {
        ok: false,
        status: 400,
        error: jsonRpcError(id, -32600, 'MCP-Protocol-Version mismatch')
      };
    }
    return { ok: true, session };
  }

  private getSessionFromHeaders(headers: Record<string, string>) {
    const id = headers['mcp-session-id'];
    if (!id) return null;
    return this.sessions.get(id);
  }

  private baseHeaders(protocolVersion?: string | null) {
    const headers: Record<string, string> = {};
    if (protocolVersion) headers['Mcp-Protocol-Version'] = protocolVersion;
    return headers;
  }

  private pruneSessions() {
    if (this.sessionTtlMs <= 0) return;
    const now = Date.now();
    if (now - this.lastPruneAt < SESSION_PRUNE_INTERVAL_MS) return;
    this.lastPruneAt = now;
    this.sessions.pruneStale(this.sessionTtlMs, now);
  }

  private jsonResponse(status: number, body: unknown): ResponsePlan {
    return {
      kind: 'json',
      status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    };
  }

  private emptyResponse(status: number, headers: Record<string, string>): ResponsePlan {
    return { kind: 'empty', status, headers };
  }
}
