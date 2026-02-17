import assert from 'node:assert/strict';

import {
  MCP_PROTOCOL_VERSION_MISMATCH,
  MCP_SESSION_ID_REQUIRED,
  resolveSession,
  SessionStore
} from '@ashfox/runtime/conformance';

{
  const sessions = new SessionStore();
  const resolved = resolveSession(
    sessions,
    { jsonrpc: '2.0', method: 'tools/list' },
    1,
    undefined,
    {}
  );
  assert.equal(resolved.ok, true);
  if (resolved.ok) {
    assert.equal(resolved.session.initialized, true);
    assert.equal(typeof resolved.newSessionId, 'string');
    assert.ok(resolved.newSessionId.length > 0);
  }
}

{
  const sessions = new SessionStore();
  const denied = resolveSession(
    sessions,
    { jsonrpc: '2.0', method: 'custom/method' },
    2,
    undefined,
    {}
  );
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.status, 400);
    assert.equal(denied.error.error?.message, MCP_SESSION_ID_REQUIRED);
  }
}

{
  const sessions = new SessionStore();
  sessions.create('session-1', '2025-06-18');
  const mismatch = resolveSession(
    sessions,
    { jsonrpc: '2.0', method: 'tools/list' },
    3,
    '2025-11-25',
    { 'mcp-session-id': 'session-1' }
  );
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) {
    assert.equal(mismatch.status, 400);
    assert.equal(mismatch.error.error?.message, MCP_PROTOCOL_VERSION_MISMATCH);
  }
}
