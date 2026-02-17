import { Dispatcher } from '@ashfox/contracts/types/internal';
import { errorMessage, Logger } from './logging';
import { PLUGIN_ID, PLUGIN_VERSION } from './config';
import { SERVER_TOOL_INSTRUCTIONS } from './shared/tooling/toolInstructions';
import { McpRouter } from './transport/mcp/router';
import { LocalToolExecutor } from './transport/mcp/executor';
import { createMcpHttpServer } from './transport/mcp/httpServer';
import { startMcpNetServer } from './transport/mcp/netServer';
import { normalizePath } from './transport/mcp/routerUtils';
import { ResourceStore } from './ports/resources';
import type { MetricsRegistry } from './observability';
import type { ToolRegistry } from './transport/mcp/tools';
import {
  CONFIG_HOST_REQUIRED,
  CONFIG_PATH_REQUIRED,
  CONFIG_PORT_RANGE,
  SERVER_HTTP_PERMISSION_MESSAGE,
  SERVER_NET_PERMISSION_DETAIL,
  SERVER_NET_PERMISSION_MESSAGE,
  SERVER_NO_TRANSPORT
} from './shared/messages';
import { loadNativeModule } from './shared/nativeModules';
import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'http';
import type { Server as NetServer, Socket } from 'net';

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

const startHttpServer = (
  http: HttpModule,
  config: ServerConfig,
  router: McpRouter,
  log: Logger,
  metrics?: MetricsRegistry
): StopFn | null => {
  const server = createMcpHttpServer(http, router, log, { metrics });
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

export type StartServerOptions = {
  resources?: ResourceStore;
  toolRegistry?: ToolRegistry;
  metrics?: MetricsRegistry;
};

export function startServer(
  rawConfig: ServerConfig,
  dispatcher: Dispatcher,
  log: Logger,
  options: StartServerOptions = {}
): StopFn | null {
  const validation = validateConfig(rawConfig);
  if (!validation.ok) {
    log.error('MCP server config invalid', { message: validation.message });
    return null;
  }

  const config: ServerConfig = { ...rawConfig, path: normalizePath(rawConfig.path) };
  const executor = new LocalToolExecutor(dispatcher);
  const router = new McpRouter(
    {
      path: config.path,
      token: config.token,
      serverInfo: { name: PLUGIN_ID, version: PLUGIN_VERSION },
      instructions: SERVER_TOOL_INSTRUCTIONS
    },
    executor,
    log,
    options.resources,
    options.toolRegistry,
    options.metrics
  );

  const http = loadNativeModule<HttpModule>('http', {
    message: SERVER_HTTP_PERMISSION_MESSAGE,
    optional: true
  });
  if (http && typeof http.createServer === 'function') {
    const stop = startHttpServer(http, config, router, log, options.metrics);
    if (stop) return stop;
  }

  const net = loadNativeModule<NetModule>('net', {
    message: SERVER_NET_PERMISSION_MESSAGE,
    detail: SERVER_NET_PERMISSION_DETAIL,
    optional: false
  });
  if (net && typeof net.createServer === 'function') {
    return startMcpNetServer(net, { host: config.host, port: config.port }, router, log);
  }

  log.warn(SERVER_NO_TRANSPORT);
  return null;
}


