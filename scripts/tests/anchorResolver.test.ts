import assert from 'node:assert/strict';

import { applyAnchors } from '../../src/proxy/modelPipeline/anchorResolver';
import type { ModelSpec } from '../../src/spec';
import type { NormalizedBone, NormalizedCube } from '../../src/proxy/modelPipeline/types';

const createBone = (
  id: string,
  parentId: string | null,
  pivot: [number, number, number],
  options: Partial<NormalizedBone> = {}
): NormalizedBone => ({
  id,
  name: id,
  parentId,
  pivot,
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  explicit: {
    name: false,
    parentId: parentId !== undefined,
    pivot: false,
    rotation: false,
    scale: false,
    visibility: false
  },
  ...options
});

const createCube = (
  id: string,
  parentId: string,
  from: [number, number, number],
  to: [number, number, number],
  options: Partial<NormalizedCube> = {}
): NormalizedCube => ({
  id,
  name: id,
  parentId,
  from,
  to,
  origin: [0, 0, 0],
  originFromSpec: false,
  rotation: [0, 0, 0],
  explicit: {
    name: false,
    parentId: true,
    fromTo: true,
    origin: false,
    rotation: false,
    inflate: false,
    mirror: false,
    visibility: false,
    boxUv: false,
    uvOffset: false
  },
  ...options
});

// Anchor resolves bone pivot + cube center placement
{
  const boneMap = new Map<string, NormalizedBone>([
    ['root', createBone('root', null, [0, 0, 0])],
    ['child', createBone('child', 'root', [0, 0, 0], { pivotAnchorId: 'root_anchor' })]
  ]);
  const cubeMap = new Map<string, NormalizedCube>([
    [
      'box',
      createCube('box', 'child', [0, 0, 0], [2, 2, 2], { centerAnchorId: 'root_anchor' })
    ]
  ]);

  const model: ModelSpec = {
    bones: [
      { id: 'root' },
      { id: 'child', parentId: 'root', pivotAnchorId: 'root_anchor' }
    ],
    cubes: [
      { id: 'box', parentId: 'child', from: [0, 0, 0], to: [2, 2, 2], centerAnchorId: 'root_anchor' }
    ],
    anchors: [{ id: 'root_anchor', target: { boneId: 'root' }, offset: [1, 2, 3] }]
  };

  const res = applyAnchors(model, boneMap, cubeMap);
  assert.equal(res.ok, true);
  assert.deepEqual(boneMap.get('child')?.pivot, [1, 2, 3]);
  assert.deepEqual(cubeMap.get('box')?.from, [0, 1, 2]);
  assert.deepEqual(cubeMap.get('box')?.to, [2, 3, 4]);
  assert.deepEqual(cubeMap.get('box')?.origin, [1, 2, 3]);
}

// Anchor refs require anchors array
{
  const boneMap = new Map<string, NormalizedBone>([
    ['root', createBone('root', null, [0, 0, 0], { pivotAnchorId: 'missing' })]
  ]);
  const cubeMap = new Map<string, NormalizedCube>();

  const model: ModelSpec = {
    bones: [{ id: 'root', pivotAnchorId: 'missing' }]
  };

  const res = applyAnchors(model, boneMap, cubeMap);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
  }
}

// Anchor target must exist in bone/cube maps
{
  const boneMap = new Map<string, NormalizedBone>([
    ['child', createBone('child', null, [0, 0, 0], { pivotAnchorId: 'bad' })]
  ]);
  const cubeMap = new Map<string, NormalizedCube>();

  const model: ModelSpec = {
    bones: [{ id: 'child', pivotAnchorId: 'bad' }],
    anchors: [{ id: 'bad', target: { boneId: 'missing' } }]
  };

  const res = applyAnchors(model, boneMap, cubeMap);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
  }
}


