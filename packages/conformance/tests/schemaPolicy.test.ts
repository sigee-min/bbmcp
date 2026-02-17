import assert from 'node:assert/strict';

import {
  callWithAutoRetry,
  DEFAULT_TOOL_REGISTRY,
  handleResourcesList,
  resolveSession,
  TOOL_SCHEMA_VERSION as RUNTIME_SCHEMA_VERSION
} from '@ashfox/runtime/conformance';
import {
  TOOL_SCHEMA_VERSION as CONTRACT_SCHEMA_VERSION,
  computeToolRegistryHash
} from '../../contracts/src/mcpSchemas/policy';

assert.match(CONTRACT_SCHEMA_VERSION, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(RUNTIME_SCHEMA_VERSION, CONTRACT_SCHEMA_VERSION);
assert.equal(typeof require.resolve('@ashfox/runtime/conformance'), 'string');
assert.equal(typeof callWithAutoRetry, 'function');
assert.equal(typeof handleResourcesList, 'function');
assert.equal(typeof resolveSession, 'function');

assert.equal(DEFAULT_TOOL_REGISTRY.hash, computeToolRegistryHash(DEFAULT_TOOL_REGISTRY.tools));
