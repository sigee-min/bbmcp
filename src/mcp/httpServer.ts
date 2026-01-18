import { Logger } from '../logging';
import { McpRouter } from './router';
import { HttpRequest, ResponsePlan } from './types';
import { openSseConnection } from './transport';
import type { IncomingMessage, Server, ServerResponse } from 'http';

const MAX_BODY_BYTES = 5_000_000;

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
    req.on('data', (chunk: Buffer) => {
      total += chunk.length ?? 0;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      body += chunk.toString();
    });
    req.on('end', () => resolve(body));
  });

const applyHeaders = (res: ServerResponse, headers: Record<string, string>) => {
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
};

const writePlan = (plan: ResponsePlan, res: ServerResponse, log: Logger) => {
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
            } catch {
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

export const createMcpHttpServer = (http: HttpModule, router: McpRouter, log: Logger) =>
  http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';
    const headers = normalizeHeaders(req.headers ?? {});
    let body = '';
    if (method === 'POST') {
      try {
        body = await readBody(req);
      } catch (err) {
        log.warn('MCP HTTP payload rejected', { message: err instanceof Error ? err.message : String(err) });
        res.statusCode = 413;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: { code: 'payload_too_large', message: 'payload too large' } }));
        return;
      }
    }

    const plan = await router.handle({ method, url, headers, body } as HttpRequest);
    writePlan(plan, res, log);
  });
