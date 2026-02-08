import assert from 'node:assert/strict';
import { findUvScaleIssues } from '../src/domain/uv/scale';
import { DEFAULT_UV_POLICY } from '../src/domain/uv/policy';
import type { Cube, TextureUsage } from '../src/domain/model';

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

const usageUniform: TextureUsage = {
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

const uniformResult = findUvScaleIssues(usageUniform, [cubeA, cubeB], { width: 32, height: 32 }, DEFAULT_UV_POLICY);
assert.equal(uniformResult.mismatchedFaces, 0);

const usageMismatch: TextureUsage = {
  textures: [
    {
      name: 'tex',
      cubeCount: 2,
      faceCount: 2,
      cubes: [
        { id: cubeA.id, name: cubeA.name, faces: [{ face: 'north', uv: [0, 0, 8, 8] }] },
        { id: cubeB.id, name: cubeB.name, faces: [{ face: 'north', uv: [0, 0, 12, 8] }] }
      ]
    }
  ]
};

const mismatchResult = findUvScaleIssues(usageMismatch, [cubeA, cubeB], { width: 32, height: 32 }, DEFAULT_UV_POLICY);
assert.equal(mismatchResult.mismatchedFaces, 2);

const usagePerTextureResolution: TextureUsage = {
  textures: [
    {
      name: 'tex',
      width: 16,
      height: 16,
      cubeCount: 1,
      faceCount: 1,
      cubes: [{ id: cubeA.id, name: cubeA.name, faces: [{ face: 'north', uv: [0, 0, 8, 8] }] }]
    }
  ]
};

const perTextureResult = findUvScaleIssues(
  usagePerTextureResolution,
  [cubeA],
  { width: 32, height: 32 },
  DEFAULT_UV_POLICY
);
assert.equal(perTextureResult.mismatchedFaces, 0);

const tinyCube: Cube = {
  id: 'tiny',
  name: 'tiny',
  from: [0, 0, 0],
  to: [6, 2, 1],
  bone: 'root'
};

const usageTiny: TextureUsage = {
  textures: [
    {
      name: 'tiny-tex',
      cubeCount: 1,
      faceCount: 1,
      cubes: [{ id: tinyCube.id, name: tinyCube.name, faces: [{ face: 'north', uv: [0, 0, 6, 2] }] }]
    }
  ]
};

const tinyResult = findUvScaleIssues(usageTiny, [tinyCube], { width: 16, height: 16 }, DEFAULT_UV_POLICY);
assert.equal(tinyResult.mismatchedFaces, 0);

const oversizePolicy = { ...DEFAULT_UV_POLICY, pixelsPerBlock: 64 };
const oversizeCube: Cube = {
  id: 'oversize',
  name: 'oversize',
  from: [0, 0, 0],
  to: [16, 16, 1],
  bone: 'root'
};

const usageOversize: TextureUsage = {
  textures: [
    {
      name: 'oversize-tex',
      cubeCount: 1,
      faceCount: 1,
      cubes: [{ id: oversizeCube.id, name: oversizeCube.name, faces: [{ face: 'north', uv: [0, 0, 16, 16] }] }]
    }
  ]
};

const oversizeResult = findUvScaleIssues(usageOversize, [oversizeCube], { width: 16, height: 16 }, oversizePolicy);
assert.equal(oversizeResult.issues.length, 1);
assert.equal(oversizeResult.issues[0].example?.reason, 'exceeds');

const normalCube: Cube = {
  id: 'normal',
  name: 'normal',
  from: [0, 0, 0],
  to: [8, 8, 1],
  bone: 'root'
};

const largeCube: Cube = {
  id: 'large',
  name: 'large',
  from: [0, 0, 0],
  to: [64, 64, 1],
  bone: 'root'
};

const usageMixed: TextureUsage = {
  textures: [
    {
      name: 'mixed',
      cubeCount: 2,
      faceCount: 2,
      cubes: [
        { id: normalCube.id, name: normalCube.name, faces: [{ face: 'north', uv: [0, 0, 8, 8] }] },
        { id: largeCube.id, name: largeCube.name, faces: [{ face: 'north', uv: [0, 0, 16, 16] }] }
      ]
    }
  ]
};

const mixedResult = findUvScaleIssues(usageMixed, [normalCube, largeCube], { width: 32, height: 32 }, DEFAULT_UV_POLICY);
assert.equal(mixedResult.mismatchedFaces, 1);
assert.equal(mixedResult.issues[0].example?.reason, 'exceeds');


