import http from 'http';
import { SidecarClient } from './transport/SidecarClient';
import { StderrLogger } from './logger';
import { errorMessage } from '../logging';
import { McpRouter } from '../mcp/router';
import { createMcpHttpServer } from '../mcp/httpServer';
import { PLUGIN_ID, PLUGIN_VERSION } from '../config';
import { BLOCK_PIPELINE_RESOURCE_TEMPLATES } from '../services/blockPipeline';
import { GUIDE_RESOURCE_TEMPLATES, GUIDE_RESOURCES } from '../services/guides';
import { InMemoryResourceStore } from '../services/resources';
import { SIDECAR_TOOL_INSTRUCTIONS } from '../services/toolInstructions';
import { ToolResponse } from '../types';
import { DEFAULT_TOOL_PROFILE } from '../mcp/tools';
import { PROXY_TOOL_NAMES } from '../shared/toolConstants';

const getArg = (args: string[], name: string, fallback?: string): string | undefined => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return args[index + 1] ?? fallback;
};

const parseToolProfile = (value: string | undefined): 'full' | 'texture_minimal' => {
  if (value === 'full' || value === 'texture_minimal') return value;
  return DEFAULT_TOOL_PROFILE;
};

const args = process.argv.slice(2);
const portValue = parseInt(getArg(args, '--port', '8787') ?? '8787', 10);
const config = {
  host: getArg(args, '--host', '127.0.0.1') ?? '127.0.0.1',
  port: Number.isFinite(portValue) ? portValue : 8787,
  path: getArg(args, '--path', '/mcp') ?? '/mcp',
  token: getArg(args, '--token'),
  toolProfile: parseToolProfile(getArg(args, '--tool-profile'))
};

const log = new StderrLogger('bbmcp-sidecar', 'info');
const client = new SidecarClient(process.stdin, process.stdout, log);
const resourceStore = new InMemoryResourceStore([
  ...BLOCK_PIPELINE_RESOURCE_TEMPLATES,
  ...GUIDE_RESOURCE_TEMPLATES
]);
GUIDE_RESOURCES.forEach((resource) => resourceStore.put(resource));
client.start();

const executor = {
  callTool: async (name: string, args: unknown): Promise<ToolResponse<unknown>> => {
    const mode = PROXY_TOOL_SET.has(name) ? 'proxy' : 'direct';
    const response = await client.request(name as Parameters<typeof client.request>[0], args, mode);
    if (name === 'generate_block_pipeline') {
      storePipelineResources(resourceStore, response);
    }
    return response;
  }
};

const PROXY_TOOL_SET = new Set<string>(PROXY_TOOL_NAMES);

const router = new McpRouter(
  {
    path: config.path,
    token: config.token,
    serverInfo: { name: PLUGIN_ID, version: PLUGIN_VERSION },
    instructions: SIDECAR_TOOL_INSTRUCTIONS,
    toolProfile: config.toolProfile
  },
  executor,
  log,
  resourceStore
);

const storePipelineResources = (store: InMemoryResourceStore, response: ToolResponse<unknown>) => {
  if (!response.ok) return;
  const data = response.data as {
    resources?: Array<{ uri: string; name: string; kind: string; mimeType?: string }>;
    assets?: {
      blockstates?: Record<string, unknown>;
      models?: Record<string, unknown>;
      items?: Record<string, unknown>;
    };
  };
  const resources = Array.isArray(data?.resources) ? data.resources : [];
  const assets = data?.assets;
  if (!assets || resources.length === 0) return;
  const blockstates = assets.blockstates ?? {};
  const models = assets.models ?? {};
  const items = assets.items ?? {};
  const resolveJson = (kind: string, name: string) => {
    if (kind === 'blockstate') return blockstates[name];
    if (kind === 'model') return models[name];
    if (kind === 'item') return items[name];
    return undefined;
  };
  resources.forEach((resource) => {
    const json = resolveJson(resource.kind, resource.name);
    if (!json) return;
    store.put({
      uri: resource.uri,
      name: resource.name,
      mimeType: resource.mimeType ?? 'application/json',
      text: JSON.stringify(json, null, 2)
    });
  });
};

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

