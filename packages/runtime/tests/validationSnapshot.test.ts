import assert from 'node:assert/strict';

import { validateSnapshot } from '../src/domain/validation';
import type { Snapshot, TextureUsage, TextureStat } from '../src/domain/model';
import { DEFAULT_UV_POLICY } from '../src/domain/uv/policy';
import { buildValidationMessages } from '../src/shared/messages';

const validationMessages = buildValidationMessages();

const empty: Snapshot = { bones: [], cubes: [], meshes: [], animations: [] };
const emptyFindings = validateSnapshot(
  empty,
  {
    limits: { maxCubes: 1, maxTextureSize: 32, maxAnimationSeconds: 1 }
  },
  validationMessages
);
assert.ok(emptyFindings.some((f) => f.code === 'no_bones'));

const snapshot: Snapshot = {
  bones: [
    { name: 'bone', pivot: [0, 0, 0] },
    { name: 'bone', pivot: [0, 0, 0] }
  ],
  cubes: [
    { name: 'cubeA', bone: 'bone', from: [0, 0, 0], to: [16, 16, 16] },
    { name: 'cubeB', bone: 'bone', from: [1, 1, 1], to: [2, 2, 2] },
    { name: 'cubeA', bone: 'ghost', from: [0, 0, 0], to: [1, 1, 1], uv: [20, 20] }
  ],
  meshes: [
    {
      name: 'wing',
      vertices: [
        { id: 'v0', pos: [0, 0, 0] },
        { id: 'v1', pos: [1, 0, 0] },
        { id: 'v1', pos: [1, 1, 0] }
      ],
      faces: [{ id: 'f0', vertices: ['v0', 'v1', 'v2'] }]
    },
    {
      name: 'wing',
      vertices: [
        { id: 'a', pos: [0, 0, 0] },
        { id: 'b', pos: [1, 0, 0] },
        { id: 'c', pos: [2, 0, 0] }
      ],
      faces: [
        {
          id: 'flat',
          vertices: ['a', 'b', 'c'],
          uv: [{ vertexId: 'missing', uv: [0, 0] }]
        }
      ]
    }
  ],
  animations: [{ name: 'anim', length: 2, loop: true }]
};

const textures: TextureStat[] = [
  { name: 'texLarge', width: 128, height: 128 },
  { name: 'texMismatch', width: 8, height: 8 }
];

const usage: TextureUsage = {
  textures: [
    {
      id: 't1',
      name: 'texLarge',
      cubeCount: 1,
      faceCount: 4,
      cubes: [
        {
          id: 'cubeA',
          name: 'cubeA',
          faces: [
            { face: 'north', uv: [0, 0, 8, 16] },
            { face: 'south', uv: [0, 0, 16, 16] },
            { face: 'east', uv: [0, 0, 8, 16] },
            { face: 'west', uv: [0, 0, 32, 32] }
          ]
        }
      ]
    },
    {
      id: 't2',
      name: 'unused',
      cubeCount: 0,
      faceCount: 0,
      cubes: []
    }
  ],
  unresolved: [{ textureRef: 'missing', cubeName: 'ghost', face: 'up' }]
};

const findings = validateSnapshot(
  snapshot,
  {
    limits: { maxCubes: 1, maxTextureSize: 64, maxAnimationSeconds: 1 },
    textures,
    textureResolution: { width: 16, height: 16 },
    textureUsage: usage,
    uvPolicy: DEFAULT_UV_POLICY
  },
  validationMessages
);

const codes = new Set(findings.map((f) => f.code));
assert.ok(codes.has('duplicate_bone'));
assert.ok(codes.has('duplicate_cube'));
assert.ok(codes.has('orphan_cube'));
assert.ok(codes.has('cube_containment'));
assert.ok(codes.has('max_cubes_exceeded'));
assert.ok(codes.has('animation_too_long'));
assert.ok(codes.has('duplicate_mesh'));
assert.ok(codes.has('mesh_vertex_duplicate'));
assert.ok(codes.has('mesh_face_vertex_unknown'));
assert.ok(codes.has('mesh_face_degenerate'));
assert.ok(codes.has('mesh_face_uv_vertex_unknown'));
assert.ok(codes.has('texture_too_large'));
assert.ok(codes.has('texture_size_mismatch'));
assert.ok(codes.has('uv_out_of_bounds'));
assert.ok(codes.has('texture_unresolved_refs'));
assert.ok(codes.has('texture_unassigned'));
assert.ok(codes.has('face_uv_out_of_bounds'));
assert.ok(codes.has('uv_overlap'));
assert.ok(codes.has('uv_scale_mismatch'));


