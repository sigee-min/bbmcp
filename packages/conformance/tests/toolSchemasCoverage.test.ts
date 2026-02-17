import assert from 'node:assert/strict';

import { toolSchemas } from '../../contracts/src/mcpSchemas/toolSchemas';
import { DEFAULT_TOOL_REGISTRY } from '@ashfox/runtime/conformance';

const schemaKeys = Object.keys(toolSchemas);
assert.ok(schemaKeys.length >= DEFAULT_TOOL_REGISTRY.tools.length, 'toolSchemas should cover all exposed tools');

const schemaKeySet = new Set(schemaKeys);
for (const tool of DEFAULT_TOOL_REGISTRY.tools) {
  assert.ok(schemaKeySet.has(tool.name), `Missing schema for tool: ${tool.name}`);
}
