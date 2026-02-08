import assert from 'node:assert/strict';

import { TOOL_SCHEMA_VERSION as RUNTIME_SCHEMA_VERSION } from '../../../src/config';
import { DEFAULT_TOOL_REGISTRY } from '../../../src/transport/mcp/tools';
import {
  TOOL_SCHEMA_VERSION as CONTRACT_SCHEMA_VERSION,
  computeToolRegistryHash
} from '../../contracts/src/mcpSchemas/policy';

assert.match(CONTRACT_SCHEMA_VERSION, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(RUNTIME_SCHEMA_VERSION, CONTRACT_SCHEMA_VERSION);

assert.equal(DEFAULT_TOOL_REGISTRY.hash, computeToolRegistryHash(DEFAULT_TOOL_REGISTRY.tools));
