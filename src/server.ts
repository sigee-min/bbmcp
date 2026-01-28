import { Dispatcher } from './types';
import { ProxyRouter } from './proxy';
import { errorMessage, Logger } from './logging';
import { PLUGIN_ID, PLUGIN_VERSION } from './config';
import { SERVER_TOOL_INSTRUCTIONS } from './services/toolInstructions';
import { McpRouter } from './mcp/router';
import { LocalToolExecutor } from './mcp/executor';
import { createMcpHttpServer } from './mcp/httpServer';
import { startMcpNetServer } from './mcp/netServer';
import { normalizePath } from './mcp/routerUtils';
import { ResourceStore } from './ports/resources';
import type { ToolRegistry } from './mcp/tools';
import {
  CONFIG_HOST_REQUIRED,
  CONFIG_PATH_REQUIRED,
  CONFIG_PORT_RANGE,
  SERVER_HTTP_PERMISSION_MESSAGE,
  SERVER_NET_PERMISSION_DETAIL,
  SERVER_NET_PERMISSION_MESSAGE,
  SERVER_NO_TRANSPORT
} from './shared/messages';
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

const validateConfig = (config: ServerConfig): { ok: true } | { ok: false; message: string } => {
  if (!config.host || typeof config.host !== 'string') {
    return { ok: false, message: CONFIG_HOST_REQUIRED };
  }
  const port = Number(config.port);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return { ok: false, message: CONFIG_PORT_RANGE };
  }
  if (!config.path || typeof config.path !== 'string') {
    return { ok: false, message: CONFIG_PATH_REQUIRED };
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
    log.error('MCP server failed to start (http)', { message: errorMessage(err) });
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
  log: Logger,
  resources?: ResourceStore,
  toolRegistry?: ToolRegistry
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
      instructions: SERVER_TOOL_INSTRUCTIONS
    },
    executor,
    log,
    resources,
    toolRegistry
  );

  let http: HttpModule | null = null;
  try {
    const loaded = requireNativeModule?.('http', {
      message: SERVER_HTTP_PERMISSION_MESSAGE,
      optional: true
    });
    http = isHttpModule(loaded) ? loaded : null;
  } catch (err) {
    http = null;
  }
  if (http) {
    const stop = startHttpServer(http, config, router, log);
    if (stop) return stop;
  }

  let net: NetModule | null = null;
  try {
    const loaded = requireNativeModule?.('net', {
      message: SERVER_NET_PERMISSION_MESSAGE,
      detail: SERVER_NET_PERMISSION_DETAIL,
      optional: false
    });
    net = isNetModule(loaded) ? loaded : null;
  } catch (err) {
    net = null;
  }
  if (net) {
    return startMcpNetServer(net, { host: config.host, port: config.port }, router, log);
  }

  log.warn(SERVER_NO_TRANSPORT);
  return null;
}

