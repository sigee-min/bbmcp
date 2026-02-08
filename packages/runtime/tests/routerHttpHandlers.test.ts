import assert from 'node:assert/strict';

import { handleSessionDelete, handleSseGet } from '../src/transport/mcp/routerHttpHandlers';
import { SessionStore } from '../src/transport/mcp/session';
import type { SseConnection } from '../src/transport/mcp/types';
import { MCP_ACCEPT_SSE_REQUIRED, MCP_SESSION_ID_REQUIRED, MCP_TOO_MANY_SSE } from '../src/shared/messages';

const createContext = (sessions: SessionStore) => ({
  sessions,
  getSessionFromHeaders: (headers: Record<string, string>) =>
    headers['mcp-session-id'] ? sessions.get(headers['mcp-session-id']) : null,
  baseHeaders: (protocolVersion?: string | null) => (protocolVersion ? { 'Mcp-Protocol-Version': protocolVersion } : {}),
  jsonResponse: (status: number, body: unknown) => ({
    kind: 'json' as const,
    status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
});

{
  const sessions = new SessionStore();
  const res = handleSseGet(createContext(sessions), {
    method: 'GET',
    url: 'http://localhost/mcp',
    headers: {},
    body: ''
  });
  assert.equal(res.kind, 'json');
  assert.equal(res.status, 406);
  if (res.kind === 'json') {
    const body = JSON.parse(res.body);
    assert.equal(body.error.message, MCP_ACCEPT_SSE_REQUIRED);
  }
}

{
  const sessions = new SessionStore();
  const res = handleSseGet(createContext(sessions), {
    method: 'GET',
    url: 'http://localhost/mcp',
    headers: { accept: 'text/event-stream' },
    body: ''
  });
  assert.equal(res.kind, 'json');
  assert.equal(res.status, 400);
  if (res.kind === 'json') {
    const body = JSON.parse(res.body);
    assert.equal(body.error.message, MCP_SESSION_ID_REQUIRED);
  }
}

{
  const sessions = new SessionStore();
  const session = sessions.create('s1', '2025-06-18');
  for (let i = 0; i < 3; i += 1) {
    session.sseConnections.add({
      send: () => undefined,
      close: () => undefined,
      isClosed: () => false
    });
  }
  const res = handleSseGet(createContext(sessions), {
    method: 'GET',
    url: 'http://localhost/mcp',
    headers: { accept: 'text/event-stream', 'mcp-session-id': 's1' },
    body: ''
  });
  assert.equal(res.kind, 'json');
  assert.equal(res.status, 429);
  if (res.kind === 'json') {
    const body = JSON.parse(res.body);
    assert.equal(body.error.message, MCP_TOO_MANY_SSE);
  }
}

{
  const sessions = new SessionStore();
  const session = sessions.create('s1', '2025-06-18');
  const res = handleSseGet(createContext(sessions), {
    method: 'GET',
    url: 'http://localhost/mcp',
    headers: { accept: 'text/event-stream', 'mcp-session-id': 's1' },
    body: ''
  });
  assert.equal(res.kind, 'sse');
  if (res.kind === 'sse') {
    assert.equal(res.status, 200);
    assert.equal(res.close, false);
    assert.ok(typeof res.onOpen === 'function');
    const conn: SseConnection = {
      send: () => undefined,
      close: () => undefined,
      isClosed: () => false
    };
    const dispose = res.onOpen?.(conn);
    assert.equal(session.sseConnections.size, 1);
    if (typeof dispose === 'function') dispose();
    assert.equal(session.sseConnections.size, 0);
  }
}

{
  const sessions = new SessionStore();
  const missing = handleSessionDelete(createContext(sessions), {
    method: 'DELETE',
    url: 'http://localhost/mcp',
    headers: {},
    body: ''
  });
  assert.equal(missing.kind, 'json');
  assert.equal(missing.status, 400);
  if (missing.kind === 'json') {
    const body = JSON.parse(missing.body);
    assert.equal(body.error.message, MCP_SESSION_ID_REQUIRED);
  }

  sessions.create('s1', '2025-06-18');
  const ok = handleSessionDelete(createContext(sessions), {
    method: 'DELETE',
    url: 'http://localhost/mcp',
    headers: { 'mcp-session-id': 's1' },
    body: ''
  });
  assert.equal(ok.kind, 'json');
  assert.equal(ok.status, 200);
}
