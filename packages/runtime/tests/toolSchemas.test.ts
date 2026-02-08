import assert from 'node:assert/strict';
import { DEFAULT_TOOL_REGISTRY } from '../src/transport/mcp/tools';
import { toolSchemas } from '../../contracts/src/mcpSchemas/toolSchemas';

const schemaKeys = Object.keys(toolSchemas);
assert.ok(schemaKeys.length >= DEFAULT_TOOL_REGISTRY.tools.length, 'toolSchemas should cover all exposed tools');

const schemaKeySet = new Set(schemaKeys);
for (const tool of DEFAULT_TOOL_REGISTRY.tools) {
  assert.ok(schemaKeySet.has(tool.name), `Missing schema for tool: ${tool.name}`);
}

