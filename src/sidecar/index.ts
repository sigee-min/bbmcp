import http from 'http';
import { SidecarClient } from './transport/SidecarClient';
import { StderrLogger } from './logger';
import { McpRouter } from '../mcp/router';
import { createMcpHttpServer } from '../mcp/httpServer';
import { PLUGIN_ID, PLUGIN_VERSION } from '../config';
import { BLOCK_PIPELINE_RESOURCE_TEMPLATES } from '../domain/blockPipeline';
import { InMemoryResourceStore } from '../services/resources';
import { ToolResponse } from '../types';

const getArg = (args: string[], name: string, fallback?: string): string | undefined => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return args[index + 1] ?? fallback;
};

const args = process.argv.slice(2);
const portValue = parseInt(getArg(args, '--port', '8787') ?? '8787', 10);
const config = {
  host: getArg(args, '--host', '127.0.0.1') ?? '127.0.0.1',
  port: Number.isFinite(portValue) ? portValue : 8787,
  path: getArg(args, '--path', '/mcp') ?? '/mcp',
  token: getArg(args, '--token')
};

const log = new StderrLogger('bbmcp-sidecar', 'info');
const client = new SidecarClient(process.stdin, process.stdout, log);
const resourceStore = new InMemoryResourceStore(BLOCK_PIPELINE_RESOURCE_TEMPLATES);
client.start();

const executor = {
  callTool: async (name: string, args: unknown): Promise<ToolResponse<unknown>> => {
    const mode =
      name === 'apply_model_spec' ||
      name === 'apply_texture_spec'
        ? 'proxy'
        : 'direct';
    const response = await client.request(name, args, mode);
    if (name === 'generate_block_pipeline') {
      storePipelineResources(resourceStore, response);
    }
    return response;
  }
};

const router = new McpRouter(
  {
    path: config.path,
    token: config.token,
    serverInfo: { name: PLUGIN_ID, version: PLUGIN_VERSION },
    instructions:
      'Use get_project_state (or includeState/includeDiff) before mutations and include ifRevision. Prefer ensure_project to create or reuse projects; use match/onMismatch/onMissing to control when a fresh project is created. Prefer apply_model_spec/apply_texture_spec and id-based updates. For <=32px textures, set_pixel ops are fine; for 64px+ use generate_texture_preset to avoid large payloads. Texture creation does not bind textures to cubes; call assign_texture explicitly, then set_face_uv for manual per-face UVs. Before painting, call preflight_texture to build a UV mapping table and verify with a checker texture. If UVs change, repaint using the updated mapping.'
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
  const message = err instanceof Error ? err.message : String(err);
  log.error('sidecar server error', { message });
  process.exit(1);
});

process.on('SIGINT', () => {
  server.close(() => {
    log.info('sidecar stopped');
    process.exit(0);
  });
});
