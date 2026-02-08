import assert from 'node:assert/strict';

import { normalizeHost, normalizePath, normalizePort } from '../src/shared/endpoint';

{
  assert.equal(normalizeHost(undefined), null);
  assert.equal(normalizeHost('   '), null);
  assert.equal(normalizeHost(' 127.0.0.1 '), '127.0.0.1');
}

{
  assert.equal(normalizePort(undefined), null);
  assert.equal(normalizePort(null), null);
  assert.equal(normalizePort('abc'), null);
  assert.equal(normalizePort(0), null);
  assert.equal(normalizePort(65536), null);
  assert.equal(normalizePort('8787'), 8787);
  assert.equal(normalizePort(443), 443);
}

{
  assert.equal(normalizePath(undefined), '/mcp');
  assert.equal(normalizePath(''), '/mcp');
  assert.equal(normalizePath('  /mcp  '), '/mcp');
  assert.equal(normalizePath('mcp'), '/mcp');
  assert.equal(normalizePath('/mcp/'), '/mcp');
  assert.equal(normalizePath('/nested/path/'), '/nested/path');
  assert.equal(normalizePath(' ', '/custom'), '/custom');
}
