import assert from 'node:assert/strict';

import { estimateUvPixelsPerBlock } from '../src/domain/uv/density';
import type { Cube, TextureUsage } from '../src/domain/model';

const dupA: Cube = {
  id: 'dup-a',
  name: 'dup',
  from: [0, 0, 0],
  to: [8, 8, 1],
  bone: 'root'
};

const dupB: Cube = {
  id: 'dup-b',
  name: 'dup',
  from: [0, 0, 0],
  to: [8, 8, 1],
  bone: 'root'
};

const usageAmbiguous: TextureUsage = {
  textures: [
    {
      name: 'tex',
      cubeCount: 1,
      faceCount: 1,
      cubes: [{ name: 'dup', faces: [{ face: 'north', uv: [0, 0, 8, 8] }] }]
    }
  ]
};

const ambiguousResult = estimateUvPixelsPerBlock(usageAmbiguous, [dupA, dupB], { modelUnitsPerBlock: 16 });
assert.equal(ambiguousResult, null);

const cubeA: Cube = {
  id: 'cube-a',
  name: 'cube-a',
  from: [0, 0, 0],
  to: [8, 8, 1],
  bone: 'root'
};

const cubeB: Cube = {
  id: 'cube-b',
  name: 'cube-b',
  from: [0, 0, 0],
  to: [8, 8, 1],
  bone: 'root'
};

const usageUnique: TextureUsage = {
  textures: [
    {
      name: 'tex',
      cubeCount: 2,
      faceCount: 2,
      cubes: [
        { id: cubeA.id, name: cubeA.name, faces: [{ face: 'north', uv: [0, 0, 8, 8] }] },
        { id: cubeB.id, name: cubeB.name, faces: [{ face: 'north', uv: [0, 0, 8, 8] }] }
      ]
    }
  ]
};

const uniqueResult = estimateUvPixelsPerBlock(usageUnique, [cubeA, cubeB], { modelUnitsPerBlock: 16 });
assert.equal(uniqueResult, 16);
