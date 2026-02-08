import assert from 'node:assert/strict';

import { computeTextureUsageId } from '../src/domain/textureUsage';
import type { TextureUsage } from '../src/domain/model';

const baseUsage: TextureUsage = {
  textures: [
    {
      name: 'tex',
      width: 16,
      height: 16,
      cubeCount: 1,
      faceCount: 1,
      cubes: [{ name: 'cube', faces: [{ face: 'north', uv: [0, 0, 8, 8] }] }]
    }
  ]
};

const resizedUsage: TextureUsage = {
  textures: [
    {
      name: 'tex',
      width: 64,
      height: 64,
      cubeCount: 1,
      faceCount: 1,
      cubes: [{ name: 'cube', faces: [{ face: 'north', uv: [0, 0, 8, 8] }] }]
    }
  ]
};

const baseId = computeTextureUsageId(baseUsage);
const resizedId = computeTextureUsageId(resizedUsage);

assert.notEqual(baseId, resizedId);

