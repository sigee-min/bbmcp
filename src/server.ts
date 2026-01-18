import { Dispatcher } from './types';
import { ProxyRouter } from './proxy';
import { Logger } from './logging';
import { PLUGIN_ID, PLUGIN_VERSION } from './config';
import { McpRouter } from './mcp/router';
import { LocalToolExecutor } from './mcp/executor';
import { createMcpHttpServer } from './mcp/httpServer';
import { startMcpNetServer } from './mcp/netServer';
import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'http';
import type { Server as NetServer, Socket } from 'net';

type NativeModuleLoader = (
  name: string,
  options: { message: string; detail?: string; optional?: boolean }
) => unknown;

declare const requireNativeModule: NativeModuleLoader | undefined;

export interface ServerConfig {
  host: string;
  port: number;
  path: string;
  token?: string;
}

type StopFn = () => void;

const normalizePath = (value: string) => {
  if (!value) return '/mcp';
  if (value.startsWith('/')) return value;
  return `/${value}`;
};

const validateConfig = (config: ServerConfig): { ok: true } | { ok: false; message: string } => {
  if (!config.host || typeof config.host !== 'string') {
    return { ok: false, message: 'host is required' };
  }
  const port = Number(config.port);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return { ok: false, message: 'port must be between 1 and 65535' };
  }
  if (!config.path || typeof config.path !== 'string') {
    return { ok: false, message: 'path is required' };
  }
  return { ok: true };
};

type HttpModule = {
  createServer: (handler: (req: IncomingMessage, res: ServerResponse) => void) => HttpServer;
};

type NetModule = {
  createServer: (handler: (socket: Socket) => void) => NetServer;
};

const isHttpModule = (value: unknown): value is HttpModule =>
  typeof (value as HttpModule)?.createServer === 'function';

const isNetModule = (value: unknown): value is NetModule =>
  typeof (value as NetModule)?.createServer === 'function';

const startHttpServer = (http: HttpModule, config: ServerConfig, router: McpRouter, log: Logger): StopFn | null => {
  const server = createMcpHttpServer(http, router, log);
  try {
    server.listen(config.port, config.host, () => {
      log.info('MCP server started (http)', { host: config.host, port: config.port, path: config.path });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('MCP server failed to start (http)', { message });
    return null;
  }
  return () => {
    server.close();
    log.info('MCP server stopped (http)');
  };
};

export function startServer(
  rawConfig: ServerConfig,
  dispatcher: Dispatcher,
  proxy: ProxyRouter,
  log: Logger
): StopFn | null {
  const validation = validateConfig(rawConfig);
  if (!validation.ok) {
    log.error('MCP server config invalid', { message: validation.message });
    return null;
  }

  const config: ServerConfig = { ...rawConfig, path: normalizePath(rawConfig.path) };
  const executor = new LocalToolExecutor(dispatcher, proxy);
  const router = new McpRouter(
    {
      path: config.path,
      token: config.token,
      serverInfo: { name: PLUGIN_ID, version: PLUGIN_VERSION },
      instructions:
        'Tool paths can be session-bound (e.g., /bbmcp/link_...). Do not cache tool paths; re-run tools/list if a call returns Resource not found. Use get_project_state/get_project_diff (or includeState/includeDiff) before and after edits. Prefer apply_project_spec/apply_* specs and id fields when updating or deleting items. Pass ifRevision on mutations to guard against stale state.'
    },
    executor,
    log
  );

  let http: HttpModule | null = null;
  try {
    const loaded = requireNativeModule?.('http', {
      message: 'bbmcp needs HTTP access for the local MCP server.',
      optional: true
    });
    http = isHttpModule(loaded) ? loaded : null;
  } catch {
    http = null;
  }
  if (http) {
    const stop = startHttpServer(http, config, router, log);
    if (stop) return stop;
  }

  let net: NetModule | null = null;
  try {
    const loaded = requireNativeModule?.('net', {
      message: 'bbmcp needs network permission to accept MCP connections.',
      detail: 'bbmcp opens a local server so AI assistants can connect.',
      optional: false
    });
    net = isNetModule(loaded) ? loaded : null;
  } catch {
    net = null;
  }
  if (net) {
    return startMcpNetServer(net, { host: config.host, port: config.port }, router, log);
  }

  log.warn('http/net modules not available; MCP server not started');
  return null;
}
