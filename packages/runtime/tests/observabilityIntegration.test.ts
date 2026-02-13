import assert from 'node:assert/strict';
import * as nodeHttp from 'node:http';

import type { Logger, LogLevel } from '../src/logging';
import { createMcpHttpServer } from '../src/transport/mcp/httpServer';
import { McpRouter } from '../src/transport/mcp/router';
import type { ToolExecutor } from '../src/transport/mcp/executor';
import { buildToolRegistry } from '../src/transport/mcp/tools';
import { InMemoryMetricsRegistry } from '../src/observability/metrics';
import { registerAsync } from './helpers';

type LogEntry = {
  level: LogLevel;
  message: string;
  meta?: Record<string, unknown>;
};

class CaptureLogger implements Logger {
  readonly entries: LogEntry[] = [];

  log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    this.entries.push({ level, message, meta });
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta);
  }
  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }
  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }
  error(message: string, meta?: Record<string, unknown>): void {
    this.log('error', message, meta);
  }
}

const listenEphemeral = (server: nodeHttp.Server): Promise<number> =>
  new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unexpected server address.'));
        return;
      }
      resolve(address.port);
    });
  });

const httpRequest = async (args: {
  port: number;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<{ status: number; headers: nodeHttp.IncomingHttpHeaders; body: string }> =>
  await new Promise((resolve, reject) => {
    const req = nodeHttp.request(
      {
        hostname: '127.0.0.1',
        port: args.port,
        path: args.path,
        method: args.method,
        headers: args.headers
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8')
          });
        });
      }
    );
    req.on('error', reject);
    if (args.body) req.write(args.body);
    req.end();
  });

registerAsync(
  (async () => {
    const metrics = new InMemoryMetricsRegistry();
    metrics.setPersistenceReady('database', true);
    metrics.setPersistenceReady('storage', false);

    const logger = new CaptureLogger();
    let calls = 0;
    const executor: ToolExecutor = {
      callTool: async () => {
        calls += 1;
        if (calls === 1) return { ok: true, data: { ok: true } };
        return {
          ok: false,
          error: { code: 'invalid_state', message: 'unit failure', details: { reason: 'unit_test' } }
        };
      }
    };

    const toolRegistry = buildToolRegistry({ includeLowLevel: false });
    const router = new McpRouter({ path: '/mcp' }, executor, logger, undefined, toolRegistry, metrics);
    const server = createMcpHttpServer(nodeHttp, router, logger, { metrics });
    const port = await listenEphemeral(server);

    try {
      const callPayload = (id: number) =>
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          method: 'tools/call',
          params: { name: 'list_capabilities', arguments: {} }
        });

      const res1 = await httpRequest({
        port,
        method: 'POST',
        path: '/mcp',
        headers: { 'content-type': 'application/json' },
        body: callPayload(1)
      });
      assert.equal(res1.status, 200);

      const res2 = await httpRequest({
        port,
        method: 'POST',
        path: '/mcp',
        headers: { 'content-type': 'application/json' },
        body: callPayload(2)
      });
      assert.equal(res2.status, 200);

      const metricsRes = await httpRequest({ port, method: 'GET', path: '/metrics' });
      assert.equal(metricsRes.status, 200);
      assert.equal(String(metricsRes.headers['content-type'] ?? '').includes('text/plain'), true);
      assert.match(metricsRes.body, /# TYPE ashfox_mcp_requests_total counter/);
      assert.match(metricsRes.body, /ashfox_mcp_requests_total\{status="200",method="POST"\} 2/);
      assert.match(metricsRes.body, /# TYPE ashfox_tool_calls_total counter/);
      assert.match(metricsRes.body, /ashfox_tool_calls_total\{tool="list_capabilities",ok="true"\} 1/);
      assert.match(metricsRes.body, /ashfox_tool_calls_total\{tool="list_capabilities",ok="false"\} 1/);
      assert.match(metricsRes.body, /# TYPE ashfox_tool_duration_seconds histogram/);
      assert.match(metricsRes.body, /ashfox_tool_duration_seconds_count\{tool="list_capabilities"\} 2/);
      assert.match(metricsRes.body, /# TYPE ashfox_persistence_ready gauge/);
      assert.match(metricsRes.body, /ashfox_persistence_ready\{component="database"\} 1/);
      assert.match(metricsRes.body, /ashfox_persistence_ready\{component="storage"\} 0/);
      assert.equal(metricsRes.body.includes('traceId'), false);
      assert.equal(metricsRes.body.includes('projectId'), false);
    } finally {
      server.close();
    }

    const toolCompletions = logger.entries.filter((entry) => entry.message === 'tool call completed');
    assert.equal(toolCompletions.length, 2);

    const requestCompletions = logger.entries.filter((entry) => entry.message === 'MCP HTTP request completed');
    assert.equal(requestCompletions.length, 2);

    const toolTraceIds = toolCompletions.map((entry) => String(entry.meta?.traceId ?? '')).filter(Boolean);
    assert.equal(toolTraceIds.length, 2);
    assert.notEqual(toolTraceIds[0], toolTraceIds[1]);

    for (const completion of toolCompletions) {
      assert.equal(typeof completion.meta?.tool, 'string');
      assert.equal(typeof completion.meta?.ok, 'boolean');
      assert.equal(typeof completion.meta?.durationMs, 'number');
      assert.equal(typeof completion.meta?.traceId, 'string');
      const traceId = String(completion.meta?.traceId ?? '');
      const correlated = requestCompletions.find((entry) => entry.meta?.traceId === traceId);
      assert.ok(correlated, `Expected correlated request completion log for traceId=${traceId}.`);
    }

    const failure = toolCompletions.find((entry) => entry.meta?.ok === false);
    assert.ok(failure);
    const error = failure?.meta?.error as { code?: unknown; reason?: unknown } | undefined;
    assert.equal(typeof error?.code, 'string');
    assert.equal(typeof error?.reason, 'string');
  })()
);

