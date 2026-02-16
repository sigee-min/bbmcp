import assert from 'node:assert/strict';

import { buildTextureUsageResult } from '../src/adapters/blockbench/BlockbenchTextureUsage';

type TextureUsageDeps = Parameters<typeof buildTextureUsageResult>[1];

{
  const res = buildTextureUsageResult(
    { textureName: 'missing' },
    {
      textures: [{ id: 'tex1', name: 'atlas' }] as TextureUsageDeps['textures'],
      cubes: [] as TextureUsageDeps['cubes']
    }
  );
  assert.equal(Boolean(res.error), true);
  assert.equal(res.error?.code, 'invalid_payload');
}

{
  const res = buildTextureUsageResult(
    {},
    {
      textures: [
        { id: 'tex1', name: 'atlas', width: 16, height: 16 },
        { uuid: 'tex2', name: 'extra', width: 32, height: 32 }
      ] as TextureUsageDeps['textures'],
      cubes: [
        {
          id: 'cube1',
          name: 'body',
          faces: {
            north: { texture: 'tex1', uv: [0, 0, 8, 8] },
            south: { texture: 'atlas', uv: [8, 0, 16, 8] },
            west: { texture: 'unknown-ref', uv: [0, 8, 8, 16] }
          }
        }
      ] as TextureUsageDeps['cubes']
    }
  );
  assert.equal(Boolean(res.error), false);
  assert.equal(Boolean(res.result), true);
  const result = res.result!;
  const atlas = result.textures.find((entry) => entry.name === 'atlas');
  assert.ok(atlas);
  assert.equal(atlas?.faceCount, 2);
  assert.equal(atlas?.cubeCount, 1);
  assert.equal(atlas?.cubes[0]?.faces.length, 2);
  assert.equal(result.unresolved?.length, 1);
  assert.equal(result.unresolved?.[0]?.textureRef, 'unknown-ref');
}

{
  const res = buildTextureUsageResult(
    { textureId: 'alias-tex1' },
    {
      textures: [
        { id: 'tex1', uuid: 'alias-tex1', name: 'atlas', width: 16, height: 16 },
        { id: 'tex2', name: 'extra', width: 32, height: 32 }
      ] as TextureUsageDeps['textures'],
      cubes: [
        {
          id: 'cube1',
          name: 'body',
          faces: {
            north: { texture: 'tex1', uv: [0, 0, 8, 8] },
            east: { texture: 'tex2', uv: [0, 0, 8, 8] }
          }
        }
      ] as TextureUsageDeps['cubes']
    }
  );
  assert.equal(Boolean(res.error), false);
  assert.equal(res.result?.textures.length, 1);
  assert.equal(res.result?.textures[0]?.name, 'atlas');
  assert.equal(res.result?.textures[0]?.faceCount, 1);
}

{
  const res = buildTextureUsageResult(
    {},
    {
      textures: [{ id: 'tex1', name: 'atlas' }] as TextureUsageDeps['textures'],
      cubes: [
        {
          id: 'cube1',
          name: 'body',
          faces: {
            north: { texture: 'tex1' },
            custom: { texture: 'tex1', uv: [0, 0, 8, 8] }
          }
        },
        {
          id: 'cube1',
          name: 'body',
          faces: {
            north: { texture: 'tex1', uv: [0, 0, 8, 8] }
          }
        }
      ] as TextureUsageDeps['cubes']
    }
  );
  assert.equal(Boolean(res.error), false);
  const atlas = res.result?.textures[0];
  assert.ok(atlas);
  assert.equal(atlas?.cubeCount, 1);
  assert.equal(atlas?.cubes[0]?.faces.length, 1);
  assert.deepEqual(atlas?.cubes[0]?.faces[0]?.uv, [0, 0, 8, 8]);
}
