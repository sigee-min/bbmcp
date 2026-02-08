import assert from 'node:assert/strict';

import { buildUvAtlasPlan } from '../src/domain/uv/atlas';
import { DEFAULT_UV_POLICY } from '../src/domain/uv/policy';
import { buildUvAtlasMessages } from '../src/shared/messages';
import type { TrackedCube } from '../src/session';
import type { TextureUsageResult } from '../src/ports/editor';

const messages = buildUvAtlasMessages();

const cubeSmall: TrackedCube = {
  id: 'cube-small',
  name: 'cube-small',
  from: [0, 0, 0],
  to: [8, 8, 1],
  bone: 'root'
};

const cubeMedium: TrackedCube = {
  id: 'cube-medium',
  name: 'cube-medium',
  from: [0, 0, 0],
  to: [12, 12, 1],
  bone: 'root'
};

const buildUsage = (entry: TextureUsageResult['textures'][number]): TextureUsageResult => ({
  textures: [entry]
});

// invalid start resolution should fail.
{
  const plan = buildUvAtlasPlan({
    usage: buildUsage({
      id: 'tex1',
      name: 'atlas',
      cubeCount: 1,
      faceCount: 1,
      cubes: [{ id: cubeSmall.id, name: cubeSmall.name, faces: [{ face: 'north' }] }]
    }),
    cubes: [cubeSmall],
    resolution: { width: 0, height: 16 },
    maxResolution: { width: 64, height: 64 },
    padding: 0,
    policy: DEFAULT_UV_POLICY,
    messages
  });
  assert.equal(plan.ok, false);
  if (!plan.ok) assert.equal(plan.error.code, 'invalid_payload');
}

// invalid base resolution should fail.
{
  const plan = buildUvAtlasPlan({
    usage: buildUsage({
      id: 'tex1',
      name: 'atlas',
      cubeCount: 1,
      faceCount: 1,
      cubes: [{ id: cubeSmall.id, name: cubeSmall.name, faces: [{ face: 'north' }] }]
    }),
    cubes: [cubeSmall],
    resolution: { width: 16, height: 16 },
    baseResolution: { width: Number.NaN, height: 16 },
    maxResolution: { width: 64, height: 64 },
    padding: 0,
    policy: DEFAULT_UV_POLICY,
    messages
  });
  assert.equal(plan.ok, false);
  if (!plan.ok) assert.equal(plan.error.code, 'invalid_payload');
}

// invalid max resolution should fail.
{
  const plan = buildUvAtlasPlan({
    usage: buildUsage({
      id: 'tex1',
      name: 'atlas',
      cubeCount: 1,
      faceCount: 1,
      cubes: [{ id: cubeSmall.id, name: cubeSmall.name, faces: [{ face: 'north' }] }]
    }),
    cubes: [cubeSmall],
    resolution: { width: 16, height: 16 },
    maxResolution: { width: 0, height: 64 },
    padding: 0,
    policy: DEFAULT_UV_POLICY,
    messages
  });
  assert.equal(plan.ok, false);
  if (!plan.ok) assert.equal(plan.error.code, 'invalid_payload');
}

// atlas overflow beyond max resolution should include sizing details.
{
  const usage: TextureUsageResult = {
    textures: [
      {
        id: 'tex-packed',
        name: 'tex-packed',
        cubeCount: 2,
        faceCount: 2,
        cubes: [
          { id: cubeMedium.id, name: cubeMedium.name, faces: [{ face: 'north' }] },
          { id: cubeSmall.id, name: cubeSmall.name, faces: [{ face: 'north' }] }
        ]
      }
    ]
  };
  const plan = buildUvAtlasPlan({
    usage,
    cubes: [cubeMedium, cubeSmall],
    resolution: { width: 16, height: 16 },
    maxResolution: { width: 16, height: 16 },
    padding: 0,
    policy: DEFAULT_UV_POLICY,
    messages
  });
  assert.equal(plan.ok, false);
  if (!plan.ok) {
    assert.equal(plan.error.code, 'invalid_state');
    assert.equal(plan.error.details?.nextWidth, 32);
    assert.equal(plan.error.details?.maxWidth, 16);
  }
}

// textures with faceCount=0 should be skipped.
{
  const usage: TextureUsageResult = {
    textures: [
      {
        id: 'empty',
        name: 'empty',
        cubeCount: 1,
        faceCount: 0,
        cubes: [{ id: cubeSmall.id, name: cubeSmall.name, faces: [] }]
      },
      {
        name: 'atlas-no-id',
        cubeCount: 1,
        faceCount: 1,
        cubes: [{ id: cubeSmall.id, name: cubeSmall.name, faces: [{ face: 'north' }] }]
      }
    ]
  };
  const plan = buildUvAtlasPlan({
    usage,
    cubes: [cubeSmall],
    resolution: { width: 16, height: 16 },
    maxResolution: { width: 64, height: 64 },
    padding: 0,
    policy: DEFAULT_UV_POLICY,
    messages
  });
  assert.equal(plan.ok, true);
  if (plan.ok) {
    assert.equal(plan.data.textures.length, 1);
    assert.equal(plan.data.textures[0].textureName, 'atlas-no-id');
    assert.equal(plan.data.textures[0].textureId, undefined);
  }
}

