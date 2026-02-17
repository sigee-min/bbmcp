import assert from 'node:assert/strict';
import { buildAnimations } from '../src/domain/export/codecs/gltf/animation';
import { buildGeometryStreams } from '../src/domain/export/codecs/gltf/geometry';
import type { CanonicalExportModel } from '../src/domain/export/codecs/types';

const baseModel: CanonicalExportModel = {
  name: 'stage-model',
  formatId: 'geckolib_model',
  texture: { width: 16, height: 16 },
  timePolicy: {
    mode: 'round',
    fps: 24,
    frameStep: 1 / 24,
    timeEpsilon: 1e-6
  },
  bones: [
    {
      name: 'root',
      pivot: [0, 0, 0],
      cubes: []
    }
  ],
  cubes: [
    {
      name: 'cube',
      bone: 'root',
      from: [0, 0, 0],
      to: [2, 2, 2],
      uv: [0, 0]
    }
  ],
  meshes: [],
  textures: [],
  animations: [
    {
      name: 'idle',
      length: 1,
      loop: true,
      channels: [
        {
          bone: 'root',
          channel: 'pos',
          keys: [
            { time: 0, vector: [0, 0, 0], interp: 'linear' },
            { time: 0.5, vector: [1, 0, 0], interp: 'linear' }
          ]
        }
      ],
      triggers: []
    }
  ]
};

const warnings = new Set<string>();
const boneIndexByName = new Map<string, number>([['root', 0]]);

const geometry = buildGeometryStreams({
  model: baseModel,
  boneIndexByName,
  rootBoneIndex: 0,
  warnings
});
assert.equal(geometry.positions.length > 0, true);
assert.equal(geometry.normals.length > 0, true);
assert.equal(geometry.texcoords.length > 0, true);
assert.equal(geometry.joints.length > 0, true);
assert.equal(geometry.weights.length > 0, true);

const animations = buildAnimations({
  model: baseModel,
  rootBoneIndex: 0,
  boneIndexByName,
  boneLocalTranslation: () => [0, 0, 0],
  boneBaseRotationQuat: () => [0, 0, 0, 1],
  boneBaseScale: () => [1, 1, 1],
  warnings
});
assert.equal(animations.animations.length, 1);
assert.equal(animations.samplersByAnimation.length, 1);
assert.equal(animations.samplersByAnimation[0]?.length, 1);
