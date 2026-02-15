import { errorMessage, Logger, withLogMeta } from '../../logging';
import { PROMETHEUS_CONTENT_TYPE, type MetricsRegistry } from '../../observability/metrics';
import { McpRouter } from './router';
import { HttpRequest, ResponsePlan } from './types';
import { openSseConnection } from './transport';
import type { IncomingMessage, Server, ServerResponse } from 'http';
import { randomId } from './routerUtils';
import {
  MCP_PAYLOAD_READ_FAILED,
  MCP_PAYLOAD_TOO_LARGE,
  MCP_REQUEST_ABORTED,
  MCP_REQUEST_CLOSED,
  MCP_REQUEST_ERROR,
  MCP_REQUEST_TIMEOUT
} from '../../shared/messages';

const MAX_BODY_BYTES = 5_000_000;
const BODY_READ_TIMEOUT_MS = 30_000;

type BodyErrorCode = 'payload_too_large' | 'request_aborted' | 'request_timeout' | 'invalid_payload';

class BodyReadError extends Error {
  readonly code: BodyErrorCode;
  readonly status: number;

  constructor(code: BodyErrorCode, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const normalizeBodyError = (err: unknown): { status: number; code: BodyErrorCode; message: string } => {
  if (err instanceof BodyReadError) {
    return { status: err.status, code: err.code, message: err.message };
  }
  const message = errorMessage(err, MCP_PAYLOAD_READ_FAILED);
  return { status: 400, code: 'invalid_payload', message };
};

const normalizeHeaders = (headers: Record<string, string | string[] | undefined>) => {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (!value) continue;
    const lower = key.toLowerCase();
    normalized[lower] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return normalized;
};

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let total = 0;
    let body = '';
    let done = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      req.removeListener('aborted', onAborted);
      req.removeListener('close', onClose);
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
    };

    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      cleanup();
      fn();
    };

    const fail = (error: BodyReadError) => finish(() => reject(error));

    const onData = (chunk: Buffer) => {
      const size = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
      total += size;
      if (total > MAX_BODY_BYTES) {
        fail(new BodyReadError('payload_too_large', 413, MCP_PAYLOAD_TOO_LARGE));
        req.destroy();
        return;
      }
      body += chunk.toString();
    };

    const onEnd = () => finish(() => resolve(body));

    const onError = (err: Error) => {
      const message = errorMessage(err, MCP_REQUEST_ERROR);
      fail(new BodyReadError('invalid_payload', 400, message));
    };

    const onAborted = () => {
      fail(new BodyReadError('request_aborted', 499, MCP_REQUEST_ABORTED));
    };

    const onClose = () => {
      if (done) return;
      if (!req.complete) {
        fail(new BodyReadError('request_aborted', 499, MCP_REQUEST_CLOSED));
      }
    };

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('aborted', onAborted);
    req.on('close', onClose);

    timeout = setTimeout(() => {
      fail(new BodyReadError('request_timeout', 408, MCP_REQUEST_TIMEOUT));
      req.destroy();
    }, BODY_READ_TIMEOUT_MS);
  });

const applyHeaders = (res: ServerResponse, headers: Record<string, string>) => {
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
};

const writePlan = (plan: ResponsePlan, res: ServerResponse) => {
  if (plan.kind === 'sse') {
    res.statusCode = plan.status;
    applyHeaders(res, plan.headers);
    for (const event of plan.events) {
      res.write(event);
    }
    if (plan.onOpen || !plan.close) {
      openSseConnection(
        {
          send: (payload) => res.write(payload),
          close: () => {
            try {
              res.end();
            } catch (err) {
              res.destroy?.();
            }
          },
          onClose: (handler) => res.on('close', handler)
        },
        plan.onOpen
      );
      if (plan.close) {
        res.end();
      }
      return;
    }
    res.end();
    return;
  }

  res.statusCode = plan.status;
  applyHeaders(res, plan.headers);
  if (plan.kind === 'json') {
    res.end(plan.body);
    return;
  }
  if (plan.kind === 'binary') {
    res.end(plan.body);
    return;
  }
  res.end();
};

type HttpModule = {
  createServer: (handler: (req: IncomingMessage, res: ServerResponse) => void) => Server;
};

type McpHttpServerOptions = {
  metrics?: MetricsRegistry;
};

const readPathname = (rawUrl: string): string => {
  try {
    return new URL(rawUrl, 'http://localhost').pathname;
  } catch (_error) {
    const normalized = String(rawUrl || '/');
    const idx = normalized.indexOf('?');
    return idx >= 0 ? normalized.slice(0, idx) : normalized;
  }
};

export const createMcpHttpServer = (http: HttpModule, router: McpRouter, log: Logger, options: McpHttpServerOptions = {}) =>
  http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';
    const headers = normalizeHeaders(req.headers ?? {});
    const pathname = readPathname(url);
    const traceId = randomId();
    const requestLog = withLogMeta(log, { traceId });
    const startedAt = Date.now();

    if (method.toUpperCase() === 'GET' && pathname === '/metrics' && options.metrics) {
      res.statusCode = 200;
      res.setHeader('Content-Type', PROMETHEUS_CONTENT_TYPE);
      res.setHeader('Cache-Control', 'no-cache');
      try {
        res.end(options.metrics.toPrometheusText());
      } catch (err) {
        res.destroy?.();
      }
      return;
    }

    let body = '';
    if (method === 'POST') {
      try {
        body = await readBody(req);
      } catch (err) {
        const info = normalizeBodyError(err);
        const durationMs = Math.max(0, Date.now() - startedAt);
        requestLog.warn('MCP HTTP payload rejected', { code: info.code, message: info.message, durationMs });
        res.statusCode = info.status;
        res.setHeader('Content-Type', 'application/json');
        try {
          res.end(JSON.stringify({ error: { code: info.code, message: info.message } }));
        } catch (err) {
          res.destroy?.();
        }
        options.metrics?.recordMcpRequest(method, info.status);
        requestLog.info('MCP HTTP request completed', {
          method: method.toUpperCase(),
          path: pathname,
          status: info.status,
          durationMs
        });
        return;
      }
    }

    let plan: ResponsePlan;
    try {
      plan = await router.handle({ method, url, headers, body } as HttpRequest, { log: requestLog });
    } catch (err) {
      const durationMs = Math.max(0, Date.now() - startedAt);
      requestLog.error('MCP HTTP request failed', { message: errorMessage(err), durationMs });
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      try {
        res.end(JSON.stringify({ error: { code: 'internal_error', message: 'Internal server error.' } }));
      } catch (writeErr) {
        res.destroy?.();
      }
      options.metrics?.recordMcpRequest(method, 500);
      requestLog.info('MCP HTTP request completed', {
        method: method.toUpperCase(),
        path: pathname,
        status: 500,
        durationMs
      });
      return;
    }
    writePlan(plan, res);
    const durationMs = Math.max(0, Date.now() - startedAt);
    options.metrics?.recordMcpRequest(method, plan.status);
    requestLog.info('MCP HTTP request completed', {
      method: method.toUpperCase(),
      path: pathname,
      status: plan.status,
      durationMs,
      kind: plan.kind
    });
  });

