import assert from 'node:assert/strict';

import { DEFAULT_TOOL_REGISTRY } from '@ashfox/runtime/conformance';
import { GLTF_CONVERT_REQUIRED_TOOLSET } from '../src/nativeJobProcessor';

const registryToolNames = new Set(DEFAULT_TOOL_REGISTRY.tools.map((tool) => tool.name));

const requiredToolNames = Array.from(
  new Set([
    ...GLTF_CONVERT_REQUIRED_TOOLSET.base,
    ...GLTF_CONVERT_REQUIRED_TOOLSET.geometry,
    ...GLTF_CONVERT_REQUIRED_TOOLSET.animation,
    ...GLTF_CONVERT_REQUIRED_TOOLSET.texture
  ])
);

assert.equal(requiredToolNames.length > 0, true);
assert.equal(requiredToolNames.length >= GLTF_CONVERT_REQUIRED_TOOLSET.base.length, true);

for (const toolName of requiredToolNames) {
  assert.equal(
    registryToolNames.has(toolName),
    true,
    `Worker-required MCP tool must be exposed by runtime registry: ${toolName}`
  );
}

// Phase contracts: geometry always uses add_bone/add_cube, animation uses clip+pose, texture uses paint+read.
assert.deepEqual(GLTF_CONVERT_REQUIRED_TOOLSET.geometry, ['add_bone', 'add_cube']);
assert.deepEqual(GLTF_CONVERT_REQUIRED_TOOLSET.animation, ['create_animation_clip', 'set_frame_pose']);
assert.equal(GLTF_CONVERT_REQUIRED_TOOLSET.texture.includes('paint_faces'), true);
assert.equal(GLTF_CONVERT_REQUIRED_TOOLSET.texture.includes('read_texture'), true);
