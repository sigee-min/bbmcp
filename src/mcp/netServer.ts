import { Logger } from '../logging';
import { McpRouter } from './router';
import { ResponsePlan, SseConnection } from './types';
import { openSseConnection } from './transport';
import type { Server, Socket } from 'net';

const MAX_BODY_BYTES = 5_000_000;
const MAX_HEADER_BYTES = 16 * 1024;

const STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  202: 'Accepted',
  400: 'Bad Request',
  401: 'Unauthorized',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  500: 'Internal Server Error'
};

type ParsedHead = {
  method: string;
  url: string;
  version: string;
  headers: Record<string, string>;
  contentLength: number;
  shouldClose: boolean;
};

const parseRequestHead = (head: string): { ok: true; value: ParsedHead } | { ok: false; message: string } => {
  const lines = head.split('\r\n');
  const [method, url, version] = lines[0].split(' ');
  if (!method || !url || !version) {
    return { ok: false, message: 'invalid request line' };
  }
  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const index = line.indexOf(':');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim().toLowerCase();
    const value = line.slice(index + 1).trim();
    if (!key) continue;
    headers[key] = headers[key] ? `${headers[key]}, ${value}` : value;
  }
  const lengthRaw = headers['content-length'];
  let contentLength = 0;
  if (lengthRaw) {
    const parsed = parseInt(lengthRaw, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { ok: false, message: 'invalid content-length' };
    }
    contentLength = parsed;
  }
  const connection = headers.connection?.toLowerCase();
  const shouldClose = connection === 'close' || (version === 'HTTP/1.0' && connection !== 'keep-alive');
  return { ok: true, value: { method, url, version, headers, contentLength, shouldClose } };
};

const writeHeaders = (socket: Socket, status: number, headers: Record<string, string>, hasBody: boolean) => {
  const statusText = STATUS_TEXT[status] ?? 'OK';
  const base = [`HTTP/1.1 ${status} ${statusText}`];
  for (const [key, value] of Object.entries(headers)) {
    base.push(`${key}: ${value}`);
  }
  if (!hasBody) {
    base.push('Content-Length: 0');
  }
  base.push('', '');
  socket.write(base.join('\r\n'));
};

const writePlan = (
  socket: Socket,
  plan: ResponsePlan,
  closeAfter: boolean,
  log: Logger,
  onOpen?: (conn: SseConnection) => void | (() => void)
) => {
  if (plan.kind === 'sse') {
    writeHeaders(socket, plan.status, plan.headers, true);
    for (const event of plan.events) {
      socket.write(event);
    }
    if (plan.onOpen || !plan.close) {
      openSseConnection(
        {
          send: (payload) => socket.write(payload),
          close: () => socket.end(),
          onClose: (handler) => socket.on('close', handler)
        },
        plan.onOpen ?? onOpen
      );
      if (plan.close || closeAfter) {
        socket.end();
      }
      return;
    }
    socket.end();
    return;
  }

  if (plan.kind === 'json') {
    const body = plan.body ?? '';
    const headers = { ...plan.headers, 'Content-Length': Buffer.byteLength(body).toString() };
    writeHeaders(socket, plan.status, headers, true);
    socket.write(body);
    if (closeAfter) socket.end();
    return;
  }

  if (plan.kind === 'binary') {
    const body = plan.body ?? new Uint8Array();
    const headers = { ...plan.headers, 'Content-Length': body.length.toString() };
    writeHeaders(socket, plan.status, headers, true);
    socket.write(body);
    if (closeAfter) socket.end();
    return;
  }

  writeHeaders(socket, plan.status, plan.headers, false);
  if (closeAfter) socket.end();
};

const jsonPlan = (status: number, body: unknown): ResponsePlan => ({
  kind: 'json',
  status,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

export type NetServerConfig = {
  host: string;
  port: number;
};

type NetModule = {
  createServer: (handler: (socket: Socket) => void) => Server;
};

export const startMcpNetServer = (net: NetModule, config: NetServerConfig, router: McpRouter, log: Logger) => {
  const server = net.createServer((socket: Socket) => {
    let buffer = Buffer.alloc(0);
    let closed = false;
    let processing = false;

    const closeSocket = () => {
      if (closed) return;
      closed = true;
      try {
        socket.end();
      } catch {
        socket.destroy?.();
      }
    };

    const processBuffer = async () => {
      if (processing || closed) return;
      processing = true;
      try {
        while (!closed) {
          const headerEnd = buffer.indexOf('\r\n\r\n');
          if (headerEnd < 0) return;
          const headText = buffer.slice(0, headerEnd).toString();
          const parsed = parseRequestHead(headText);
          if (!parsed.ok) {
            const plan = jsonPlan(400, { error: { code: 'invalid_payload', message: parsed.message } });
            writePlan(socket, plan, true, log);
            closeSocket();
            return;
          }

          const { contentLength, shouldClose } = parsed.value;
          if (contentLength > MAX_BODY_BYTES) {
            const plan = jsonPlan(413, { error: { code: 'payload_too_large', message: 'payload too large' } });
            writePlan(socket, plan, true, log);
            closeSocket();
            return;
          }

          const totalLength = headerEnd + 4 + contentLength;
          if (buffer.length < totalLength) return;
          const body = buffer.slice(headerEnd + 4, totalLength).toString();
          buffer = buffer.slice(totalLength);

          const plan = await router.handle({
            method: parsed.value.method,
            url: parsed.value.url,
            headers: parsed.value.headers,
            body
          });
          writePlan(socket, plan, shouldClose, log);
          if (shouldClose || (plan.kind === 'sse' && !plan.close)) {
            if (plan.kind === 'sse' && !plan.close) {
              return;
            }
            closeSocket();
            return;
          }
        }
      } finally {
        processing = false;
      }
    };

    socket.on('data', (chunk: Buffer) => {
      if (closed) return;
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > MAX_BODY_BYTES + MAX_HEADER_BYTES) {
        closeSocket();
        return;
      }
      processBuffer();
    });

    socket.on('error', (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      log.warn('MCP net socket error', { message });
      closeSocket();
    });

    socket.on('close', () => {
      closed = true;
      buffer = Buffer.alloc(0);
    });
  });

  server.on('error', (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    log.error('MCP net server error', { message });
  });

  server.listen(config.port, config.host, () => {
    log.info('MCP server started (net)', { host: config.host, port: config.port });
  });

  return () => {
    server.close();
    log.info('MCP server stopped (net)');
  };
};
