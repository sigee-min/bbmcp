import http from 'http';
import { SidecarClient } from './transport/SidecarClient';
import { StderrLogger } from './logger';
import { errorMessage } from '../logging';
import { McpRouter } from '../transport/mcp/router';
import { DEFAULT_TOOL_REGISTRY } from '../transport/mcp/tools';
import { createMcpHttpServer } from '../transport/mcp/httpServer';
import { DEFAULT_SERVER_HOST, DEFAULT_SERVER_PORT, DEFAULT_SERVER_PATH, PLUGIN_ID, PLUGIN_VERSION } from '../config';
import { GUIDE_RESOURCE_TEMPLATES, GUIDE_RESOURCES } from '../shared/resources/guides';
import { InMemoryResourceStore } from '../adapters/resources/resourceStore';
import { SIDECAR_TOOL_INSTRUCTIONS } from '../shared/tooling/toolInstructions';
import { ToolResponse } from '@ashfox/contracts/types/internal';

const getArg = (args: string[], name: string, fallback?: string): string | undefined => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return args[index + 1] ?? fallback;
};


const args = process.argv.slice(2);
const portValue = parseInt(getArg(args, '--port', String(DEFAULT_SERVER_PORT)) ?? String(DEFAULT_SERVER_PORT), 10);
const config = {
  host: getArg(args, '--host', DEFAULT_SERVER_HOST) ?? DEFAULT_SERVER_HOST,
  port: Number.isFinite(portValue) ? portValue : DEFAULT_SERVER_PORT,
  path: getArg(args, '--path', DEFAULT_SERVER_PATH) ?? DEFAULT_SERVER_PATH,
  token: getArg(args, '--token')
};

const log = new StderrLogger('ashfox-sidecar', 'info');
const client = new SidecarClient(process.stdin, process.stdout, log);
const resourceStore = new InMemoryResourceStore([...GUIDE_RESOURCE_TEMPLATES]);
GUIDE_RESOURCES.forEach((resource) => resourceStore.put(resource));
client.start();

const executor = {
  callTool: async (name: string, args: unknown): Promise<ToolResponse<unknown>> => {
    const response = await client.request(name as Parameters<typeof client.request>[0], args);
    return response;
  }
};

const router = new McpRouter(
  {
    path: config.path,
    token: config.token,
    serverInfo: { name: PLUGIN_ID, version: PLUGIN_VERSION },
    instructions: SIDECAR_TOOL_INSTRUCTIONS
  },
  executor,
  log,
  resourceStore,
  DEFAULT_TOOL_REGISTRY
);

const server = createMcpHttpServer(http, router, log);

if (!config.host || !Number.isFinite(config.port) || config.port < 1 || config.port > 65535) {
  log.error('invalid sidecar config', { host: config.host, port: config.port, path: config.path });
  process.exit(1);
}

server.listen(config.port, config.host, () => {
  log.info('sidecar listening', { host: config.host, port: config.port, path: config.path });
});
server.on('error', (err) => {
  const message = errorMessage(err);
  log.error('sidecar server error', { message });
  process.exit(1);
});

process.on('SIGINT', () => {
  server.close(() => {
    log.info('sidecar stopped');
    process.exit(0);
  });
});








