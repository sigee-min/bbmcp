import assert from 'node:assert/strict';

import { getSessionFromHeaders, resolveSession } from '../src/transport/mcp/routerSession';
import { SessionStore } from '../src/transport/mcp/session';
import { MCP_PROTOCOL_VERSION_MISMATCH, MCP_SESSION_ID_REQUIRED } from '../src/shared/messages';

{
  const sessions = new SessionStore();
  const session = sessions.create('s1', '2025-06-18');
  assert.equal(getSessionFromHeaders(sessions, { 'mcp-session-id': 's1' }), session);
  assert.equal(getSessionFromHeaders(sessions, {}), null);
}

{
  const sessions = new SessionStore();
  const res = resolveSession(
    sessions,
    { jsonrpc: '2.0', method: 'initialize' },
    1,
    '2025-11-25',
    {}
  );
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.ok(typeof res.newSessionId === 'string');
    assert.equal(res.session.protocolVersion, '2025-11-25');
  }
}

{
  const sessions = new SessionStore();
  const res = resolveSession(
    sessions,
    { jsonrpc: '2.0', method: 'tools/list' },
    2,
    undefined,
    {}
  );
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.ok(typeof res.newSessionId === 'string');
    assert.equal(res.session.initialized, true);
  }
}

{
  const sessions = new SessionStore();
  const res = resolveSession(
    sessions,
    { jsonrpc: '2.0', method: 'custom/method' },
    3,
    undefined,
    {}
  );
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.status, 400);
    assert.equal(res.error.error?.message, MCP_SESSION_ID_REQUIRED);
  }
}

{
  const sessions = new SessionStore();
  const session = sessions.create('s1', '2025-06-18');
  const okRes = resolveSession(
    sessions,
    { jsonrpc: '2.0', method: 'tools/list' },
    4,
    '2025-06-18',
    { 'mcp-session-id': 's1' }
  );
  assert.equal(okRes.ok, true);
  if (okRes.ok) assert.equal(okRes.session, session);

  const mismatch = resolveSession(
    sessions,
    { jsonrpc: '2.0', method: 'tools/list' },
    5,
    '2025-11-25',
    { 'mcp-session-id': 's1' }
  );
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) {
    assert.equal(mismatch.status, 400);
    assert.equal(mismatch.error.error?.message, MCP_PROTOCOL_VERSION_MISMATCH);
  }
}
