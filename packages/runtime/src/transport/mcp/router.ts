import { Logger } from '../../logging';
import { ToolExecutor } from './executor';
import {
  HttpRequest,
  McpServerConfig,
  ResponsePlan
} from './types';
import { DEFAULT_TOOL_REGISTRY, ToolRegistry } from './tools';
import { SessionStore } from './session';
import { encodeSseEvent } from './sse';
import { handleSessionDelete, handleSseGet } from './routerHttpHandlers';
import { handleMessage } from './routerRpcHandlers';
import { getSessionFromHeaders, resolveSession } from './routerSession';
import { ResourceStore } from '../../ports/resources';
import {
  MCP_CONTENT_TYPE_REQUIRED,
  MCP_METHOD_NOT_ALLOWED,
  MCP_ROUTE_NOT_FOUND,
  MCP_UNAUTHORIZED
} from '../../shared/messages';
import {
  DEFAULT_SUPPORTED_PROTOCOLS,
  SESSION_PRUNE_INTERVAL_MS,
  matchesPath,
  normalizePath,
  normalizeSessionTtl,
  supportsSse
} from './routerUtils';
import { isJsonContentType, parsePostMessage, validateProtocolHeader } from './routerPost';

export class McpRouter {
  private readonly config: McpServerConfig;
  private readonly executor: ToolExecutor;
  private readonly log: Logger;
  private readonly resources?: ResourceStore;
  private readonly toolRegistry: ToolRegistry;
  private readonly sessions = new SessionStore();
  private readonly supportedProtocols: string[];
  private readonly sessionTtlMs: number;
  private lastPruneAt = 0;

  constructor(
    config: McpServerConfig,
    executor: ToolExecutor,
    log: Logger,
    resources?: ResourceStore,
    toolRegistry: ToolRegistry = DEFAULT_TOOL_REGISTRY
  ) {
    this.config = { ...config, path: normalizePath(config.path) };
    this.executor = executor;
    this.log = log;
    this.resources = resources;
    this.toolRegistry = toolRegistry;
    this.supportedProtocols = config.supportedProtocols ?? DEFAULT_SUPPORTED_PROTOCOLS;
    this.sessionTtlMs = normalizeSessionTtl(config.sessionTtlMs);
  }

  async handle(req: HttpRequest): Promise<ResponsePlan> {
    this.pruneSessions();
    const method = (req.method || 'GET').toUpperCase();
    const url = req.url || '/';
    if (!matchesPath(url, this.config.path)) {
      return this.jsonResponse(404, { error: { code: 'not_found', message: MCP_ROUTE_NOT_FOUND } });
    }

    const authFailure = this.authorize(req);
    if (authFailure) return authFailure;

    if (method === 'GET') {
      return handleSseGet(this.getHttpContext(), req);
    }
    if (method === 'DELETE') {
      return handleSessionDelete(this.getHttpContext(), req);
    }
    if (method === 'POST') {
      return this.handlePost(req);
    }
    return this.jsonResponse(405, { error: { code: 'method_not_allowed', message: MCP_METHOD_NOT_ALLOWED } });
  }

  private authorize(req: HttpRequest): ResponsePlan | null {
    if (!this.config.token) return null;
    const auth = req.headers.authorization ?? '';
    if (auth !== `Bearer ${this.config.token}`) {
      return this.jsonResponse(401, { error: { code: 'unauthorized', message: MCP_UNAUTHORIZED } });
    }
    return null;
  }

  private validatePostRequest(req: HttpRequest): ResponsePlan | null {
    if (!isJsonContentType(req.headers['content-type'])) {
      return this.jsonResponse(415, { error: { code: 'invalid_payload', message: MCP_CONTENT_TYPE_REQUIRED } });
    }
    return null;
  }

  private createRpcContext() {
    return {
      executor: this.executor,
      log: this.log,
      resources: this.resources,
      toolRegistry: this.toolRegistry,
      sessions: this.sessions,
      supportedProtocols: this.supportedProtocols,
      config: this.config
    };
  }

  private toPostResponse(
    req: HttpRequest,
    outcome: Awaited<ReturnType<typeof handleMessage>>,
    sessionResult: Extract<ReturnType<typeof resolveSession>, { ok: true }>
  ): ResponsePlan {
    if (outcome.type === 'notification') {
      return this.emptyResponse(202, this.baseHeaders(sessionResult.session?.protocolVersion));
    }

    const headers = this.baseHeaders(sessionResult.session?.protocolVersion);
    if (sessionResult.newSessionId) {
      headers['Mcp-Session-Id'] = sessionResult.newSessionId;
    }
    if (supportsSse(req.headers.accept)) {
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

  private async handlePost(req: HttpRequest): Promise<ResponsePlan> {
    const validationFailure = this.validatePostRequest(req);
    if (validationFailure) return validationFailure;

    const parsed = parsePostMessage(req.body ?? '', this.log);
    if (!parsed.ok) return this.jsonResponse(400, parsed.error);

    const protocolHeader = req.headers['mcp-protocol-version'];
    const protocolError = validateProtocolHeader(parsed.id, protocolHeader, this.supportedProtocols);
    if (protocolError) return this.jsonResponse(400, protocolError);

    const sessionResult = resolveSession(this.sessions, parsed.message, parsed.id, protocolHeader, req.headers);
    if (!sessionResult.ok) {
      return this.jsonResponse(sessionResult.status, sessionResult.error);
    }
    this.sessions.touch(sessionResult.session);

    const outcome = await handleMessage(this.createRpcContext(), parsed.message, sessionResult.session, parsed.id);
    return this.toPostResponse(req, outcome, sessionResult);
  }

  private getHttpContext() {
    return {
      sessions: this.sessions,
      getSessionFromHeaders: (headers: Record<string, string>) => getSessionFromHeaders(this.sessions, headers),
      baseHeaders: (protocolVersion?: string | null) => this.baseHeaders(protocolVersion),
      jsonResponse: (status: number, body: unknown) => this.jsonResponse(status, body)
    };
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



