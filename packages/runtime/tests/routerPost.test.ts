import assert from 'node:assert/strict';

import { isJsonContentType, parsePostMessage, validateProtocolHeader } from '../src/transport/mcp/routerPost';
import { noopLog } from './helpers';
import { MCP_UNSUPPORTED_PROTOCOL } from '../src/shared/messages';

{
  assert.equal(isJsonContentType('application/json'), true);
  assert.equal(isJsonContentType('APPLICATION/JSON; charset=utf-8'), true);
  assert.equal(isJsonContentType('text/plain'), false);
  assert.equal(isJsonContentType(undefined), false);
}

{
  const parsed = parsePostMessage('{not-json}', noopLog);
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.error.error?.code, -32700);
}

{
  const parsed = parsePostMessage(JSON.stringify({ foo: 'bar' }), noopLog);
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.error.error?.code, -32600);
}

{
  const parsed = parsePostMessage(JSON.stringify({ jsonrpc: '2.0', method: 'ping' }), noopLog);
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.id, null);
}

{
  const parsed = parsePostMessage(
    JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 42, params: {} }),
    noopLog
  );
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.id, 42);
    assert.equal(parsed.message.method, 'tools/list');
  }
}

{
  assert.equal(validateProtocolHeader(1, undefined, ['2025-06-18']), null);
  assert.equal(validateProtocolHeader(1, '2025-06-18', ['2025-06-18']), null);
  const err = validateProtocolHeader(1, '2024-11-05', ['2025-06-18']);
  assert.notEqual(err, null);
  if (err) {
    assert.equal(err.error?.code, -32600);
    assert.equal(err.error?.message, MCP_UNSUPPORTED_PROTOCOL('2024-11-05'));
  }
}
