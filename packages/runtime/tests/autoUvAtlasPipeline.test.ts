import assert from 'node:assert/strict';

import type { TextureUsage, Cube } from '../src/domain/model';
import { DEFAULT_UV_POLICY } from '../src/domain/uv/policy';
import {
  buildAutoUvAtlasPlan,
  applyAutoUvAtlasPlanConfig,
  shouldReduceDensityForAtlas,
  reducePixelsPerBlockForAtlas
} from '../src/usecases/textureTools/autoUvAtlasPlan';
import type { TextureToolContext } from '../src/usecases/textureTools/context';

const usage: TextureUsage = {
  textures: [
    {
      id: 'tex1',
      name: 'atlas',
      cubeCount: 1,
      faceCount: 1,
      cubes: [{ id: 'cube1', name: 'cube', faces: [{ face: 'north' }] }]
    }
  ]
};

const cubes: Cube[] = [
  {
    id: 'cube1',
    name: 'cube',
    from: [0, 0, 0],
    to: [8, 8, 1],
    bone: 'root'
  }
];

{
  const res = buildAutoUvAtlasPlan({
    usage,
    cubes,
    resolution: { width: 16, height: 16 },
    maxEdgeSafe: 64,
    padding: 0,
    policy: DEFAULT_UV_POLICY,
    apply: false
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.plan.resolution.width, 16);
    assert.equal(res.value.plan.resolution.height, 16);
    assert.equal(res.value.pixelsPerBlock, res.value.basePixelsPerBlock);
  }
}

{
  const ctx = {
    editor: {
      setProjectTextureResolution: () => null
    }
  } as never;
  const res = applyAutoUvAtlasPlanConfig(
    ctx,
    {
      plan: {
        resolution: { width: 16, height: 16 },
        steps: 0,
        textures: [],
        assignments: []
      },
      basePixelsPerBlock: 16,
      pixelsPerBlock: 8
    },
    { width: 16, height: 16 }
  );
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_state');
}

{
  let densityUpdates = 0;
  let resizeUpdates = 0;
  const ctx = {
    setProjectUvPixelsPerBlock: () => {
      densityUpdates += 1;
      return null;
    },
    editor: {
      setProjectTextureResolution: () => {
        resizeUpdates += 1;
        return null;
      }
    }
  } as never;
  const res = applyAutoUvAtlasPlanConfig(
    ctx,
    {
      plan: {
        resolution: { width: 32, height: 32 },
        steps: 1,
        textures: [],
        assignments: []
      },
      basePixelsPerBlock: 16,
      pixelsPerBlock: 8
    },
    { width: 16, height: 16 }
  );
  assert.equal(res.ok, true);
  assert.equal(densityUpdates, 1);
  assert.equal(resizeUpdates, 1);
}

{
  const tightUsage: TextureUsage = {
    textures: [
      {
        id: 'tex-tight',
        name: 'tight',
        cubeCount: 1,
        faceCount: 1,
        cubes: [{ id: 'tight-cube', name: 'tight-cube', faces: [{ face: 'north' }] }]
      }
    ]
  };
  const tightCubes: Cube[] = [
    {
      id: 'tight-cube',
      name: 'tight-cube',
      from: [0, 0, 0],
      to: [2, 2, 1],
      bone: 'root'
    }
  ];

  const reduced = buildAutoUvAtlasPlan({
    usage: tightUsage,
    cubes: tightCubes,
    resolution: { width: 16, height: 16 },
    maxEdgeSafe: 16,
    padding: 0,
    policy: { ...DEFAULT_UV_POLICY, pixelsPerBlock: 16 },
    apply: true
  });
  assert.equal(reduced.ok, true);
  if (reduced.ok) {
    assert.equal(reduced.value.basePixelsPerBlock, 16);
    assert.equal(reduced.value.pixelsPerBlock <= reduced.value.basePixelsPerBlock, true);
  }

}

{
  assert.equal(shouldReduceDensityForAtlas({ details: { reason: 'atlas_overflow' } }), true);
  assert.equal(shouldReduceDensityForAtlas({ details: { reason: 'uv_size_exceeds' } }), true);
  assert.equal(shouldReduceDensityForAtlas({ details: { nextWidth: 32, maxWidth: 16 } }), true);
  assert.equal(shouldReduceDensityForAtlas({ details: { reason: 'other' } }), false);

  assert.equal(reducePixelsPerBlockForAtlas(16), 8);
  assert.equal(reducePixelsPerBlockForAtlas(4), 3);
  assert.equal(reducePixelsPerBlockForAtlas(2), 1);
  assert.equal(reducePixelsPerBlockForAtlas(1), null);
}

{
  const ctx = {
    setProjectUvPixelsPerBlock: () => ({ code: 'invalid_state', message: 'uv policy locked' }),
    editor: {
      setProjectTextureResolution: () => null
    }
  } as never;
  const res = applyAutoUvAtlasPlanConfig(
    ctx,
    {
      plan: {
        resolution: { width: 16, height: 16 },
        steps: 0,
        textures: [],
        assignments: []
      },
      basePixelsPerBlock: 16,
      pixelsPerBlock: 8
    },
    { width: 16, height: 16 }
  );
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_state');
}
