import assert from 'node:assert/strict';

import type { Cube, TextureUsage } from '../src/domain/model';
import { computeTextureUsageId } from '../src/domain/textureUsage';
import { DEFAULT_UV_POLICY } from '../src/domain/uv/policy';
import {
  guardUvOverlaps,
  guardUvScale,
  guardUvUsage,
  guardUvUsageId,
  type UvGuardMessages
} from '../src/domain/uv/guards';
import { collectSingleTarget } from '../src/domain/uv/targets';

const messages: UvGuardMessages = {
  usageChangedMessage: 'usage changed',
  usageChangedFix: 'refresh usage id',
  overlapMessage: (names, suffix, example) => `overlap ${names}${suffix}${example}`,
  overlapFix: 'fix overlap',
  scaleMessage: (names, suffix, example) => `scale ${names}${suffix}${example}`,
  scaleFix: 'fix scale'
};

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

const overlapUsage: TextureUsage = {
  textures: [
    {
      id: 'tex1',
      name: 'atlas',
      cubeCount: 2,
      faceCount: 2,
      cubes: [
        { id: cubeA.id, name: cubeA.name, faces: [{ face: 'north', uv: [0, 0, 8, 8] }] },
        { id: cubeB.id, name: cubeB.name, faces: [{ face: 'north', uv: [4, 4, 12, 12] }] }
      ]
    }
  ]
};

const scaleMismatchUsage: TextureUsage = {
  textures: [
    {
      id: 'tex1',
      name: 'atlas',
      cubeCount: 2,
      faceCount: 2,
      cubes: [
        { id: cubeA.id, name: cubeA.name, faces: [{ face: 'north', uv: [0, 0, 8, 8] }] },
        { id: cubeB.id, name: cubeB.name, faces: [{ face: 'north', uv: [0, 0, 12, 8] }] }
      ]
    }
  ]
};

{
  const expected = computeTextureUsageId(overlapUsage, { width: 16, height: 16 });
  assert.equal(guardUvUsageId(overlapUsage, expected, { width: 16, height: 16 }, messages), null);
}

{
  const err = guardUvUsageId(overlapUsage, 'wrong', { width: 16, height: 16 }, messages);
  assert.equal(err?.details?.reason, 'uv_usage_mismatch');
}

{
  const nonTarget = collectSingleTarget({ name: 'other' });
  assert.equal(guardUvOverlaps(overlapUsage, nonTarget, messages), null);
}

{
  const target = collectSingleTarget({ id: 'tex1', name: 'atlas' });
  const err = guardUvOverlaps(overlapUsage, target, messages);
  assert.equal(err?.details?.reason, 'uv_overlap');
}

{
  const target = collectSingleTarget({ id: 'tex1', name: 'atlas' });
  assert.equal(
    guardUvScale({
      usage: scaleMismatchUsage,
      cubes: [cubeA, cubeB],
      policy: DEFAULT_UV_POLICY,
      resolution: undefined,
      targets: target,
      messages
    }),
    null
  );
}

{
  const target = collectSingleTarget({ id: 'tex1', name: 'atlas' });
  const err = guardUvScale({
    usage: scaleMismatchUsage,
    cubes: [cubeA, cubeB],
    policy: DEFAULT_UV_POLICY,
    resolution: { width: 32, height: 32 },
    targets: target,
    messages
  });
  assert.equal(err?.details?.reason, 'uv_scale_mismatch');
}

{
  const target = collectSingleTarget({ id: 'tex1', name: 'atlas' });
  const err = guardUvUsage({
    usage: overlapUsage,
    cubes: [cubeA, cubeB],
    expectedUsageId: 'stale-id',
    resolution: { width: 16, height: 16 },
    policy: DEFAULT_UV_POLICY,
    targets: target,
    messages
  });
  assert.equal(err?.details?.reason, 'uv_usage_mismatch');
}
