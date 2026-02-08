import assert from 'node:assert/strict';

import { TOOL_SCHEMA_VERSION } from '../../src/config';
import { DEFAULT_TOOL_REGISTRY } from '../../src/transport/mcp/tools';

assert.equal(TOOL_SCHEMA_VERSION, '2026-02-09');
assert.equal(DEFAULT_TOOL_REGISTRY.count, DEFAULT_TOOL_REGISTRY.tools.length);

// Contract test: tool registry signature must be stable unless intentionally changed.
assert.equal(DEFAULT_TOOL_REGISTRY.hash, 'e14c8576');




