import assert from 'node:assert/strict';

import { TOOL_SCHEMA_VERSION } from '../../src/config';
import { DEFAULT_TOOL_REGISTRY } from '../../src/transport/mcp/tools';
import {
  TOOL_SCHEMA_VERSION as CONTRACT_TOOL_SCHEMA_VERSION,
  computeToolRegistryHash
} from '../../packages/contracts/src/mcpSchemas/policy';

assert.equal(TOOL_SCHEMA_VERSION, CONTRACT_TOOL_SCHEMA_VERSION);
assert.equal(DEFAULT_TOOL_REGISTRY.count, DEFAULT_TOOL_REGISTRY.tools.length);
assert.equal(DEFAULT_TOOL_REGISTRY.hash, computeToolRegistryHash(DEFAULT_TOOL_REGISTRY.tools));

// Contract test: tool registry signature must be stable unless intentionally changed.
assert.equal(DEFAULT_TOOL_REGISTRY.hash, '3b8593f2');




