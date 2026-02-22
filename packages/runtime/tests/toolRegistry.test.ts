import assert from 'node:assert/strict';

import { TOOL_SCHEMA_VERSION } from '../src/config';
import { DEFAULT_TOOL_REGISTRY } from '../src/transport/mcp/tools';
import {
  TOOL_SCHEMA_VERSION as CONTRACT_TOOL_SCHEMA_VERSION,
  computeToolRegistryHash
} from '../../contracts/src/mcpSchemas/policy';

assert.equal(TOOL_SCHEMA_VERSION, CONTRACT_TOOL_SCHEMA_VERSION);
assert.equal(DEFAULT_TOOL_REGISTRY.count, DEFAULT_TOOL_REGISTRY.tools.length);
assert.equal(DEFAULT_TOOL_REGISTRY.hash, computeToolRegistryHash(DEFAULT_TOOL_REGISTRY.tools));

// Contract test: tool registry signature must be stable unless intentionally changed.
assert.equal(DEFAULT_TOOL_REGISTRY.hash, 'cb178c9d');

const requiredPipelineTools = [
  'ensure_project',
  'get_project_state',
  'export',
  'add_bone',
  'add_cube',
  'create_animation_clip',
  'set_frame_pose',
  'paint_faces',
  'preflight_texture',
  'read_texture'
] as const;
const registryTools = new Set(DEFAULT_TOOL_REGISTRY.tools.map((tool) => tool.name));
for (const toolName of requiredPipelineTools) {
  assert.equal(
    registryTools.has(toolName),
    true,
    `Pipeline completeness contract requires tool in registry: ${toolName}`
  );
}
