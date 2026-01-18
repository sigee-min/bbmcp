import http from 'http';
import { SidecarClient } from './transport/SidecarClient';
import { StderrLogger } from './logger';
import { McpRouter } from '../mcp/router';
import { createMcpHttpServer } from '../mcp/httpServer';
import { PLUGIN_ID, PLUGIN_VERSION } from '../config';

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
client.start();

const executor = {
  callTool: (name: string, args: unknown) => {
    const mode =
      name === 'apply_model_spec' ||
      name === 'apply_texture_spec' ||
      name === 'apply_anim_spec' ||
      name === 'apply_project_spec'
        ? 'proxy'
        : 'direct';
    return client.request(name, args, mode);
  }
};

const router = new McpRouter(
  {
    path: config.path,
    token: config.token,
    serverInfo: { name: PLUGIN_ID, version: PLUGIN_VERSION },
    instructions:
      'Use get_project_state/get_project_diff (or includeState/includeDiff) before mutations and include ifRevision. Prefer apply_project_spec/apply_* specs and id-based updates.'
  },
  executor,
  log
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
