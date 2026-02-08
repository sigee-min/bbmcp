import assert from 'node:assert/strict';

import {
  ALL_FACES,
  enforceManualUvMode,
  ensureFaceMap,
  normalizeFaces,
  resolveFaceTextureRef
} from '../src/adapters/blockbench/geometry/uvUtils';

{
  assert.equal(resolveFaceTextureRef(null), null);
  assert.equal(resolveFaceTextureRef({ uuid: 'tex-uuid' } as never), 'tex-uuid');
  assert.equal(resolveFaceTextureRef({ id: 'tex-id' } as never), 'tex-id');
  assert.equal(resolveFaceTextureRef({ ashfoxId: 'tex-ashfox' } as never), 'tex-ashfox');
  assert.equal(resolveFaceTextureRef({ name: 'atlas' } as never), 'atlas');
}

{
  const cube = {} as never;
  const faceMap = ensureFaceMap(cube);
  assert.equal(typeof faceMap, 'object');
  assert.deepEqual(faceMap, {});
}

{
  assert.equal(normalizeFaces(undefined), undefined);
  assert.equal(normalizeFaces([]), undefined);
  assert.deepEqual(normalizeFaces(['north', 'north', 'south'] as never), ['north', 'south']);
}

{
  const cube = {
    box_uv: true,
    autouv: 2,
    mapAutoUVCalls: 0,
    setUVModeCalls: [] as boolean[],
    mapAutoUV() {
      this.mapAutoUVCalls += 1;
    },
    setUVMode(value: boolean) {
      this.setUVModeCalls.push(value);
    }
  };
  enforceManualUvMode(cube as never, { preserve: true });
  assert.equal(cube.mapAutoUVCalls, 1);
  assert.deepEqual(cube.setUVModeCalls, [false]);
  assert.equal(cube.box_uv, true);
  assert.equal(cube.autouv, 0);
}

{
  const cube = {
    box_uv: true,
    autouv: 1,
    mapAutoUVCalls: 0,
    mapAutoUV() {
      this.mapAutoUVCalls += 1;
    }
  };
  enforceManualUvMode(cube as never);
  assert.equal(cube.mapAutoUVCalls, 0);
  assert.equal(cube.box_uv, false);
  assert.equal(cube.autouv, 0);
}

{
  assert.ok(Array.isArray(ALL_FACES));
  assert.equal(ALL_FACES.length, 6);
}

