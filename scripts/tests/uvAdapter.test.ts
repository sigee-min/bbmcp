import assert from 'node:assert/strict';

import { BlockbenchUvAdapter } from '../../src/adapters/blockbench/geometry/UvAdapter';
import { MODEL_CUBE_NOT_FOUND, UV_ASSIGNMENT_FACES_NON_EMPTY } from '../../src/shared/messages';
import { noopLog } from './helpers';

const withGlobals = (overrides: Record<string, unknown>, fn: () => void) => {
  const globals = globalThis as Record<string, unknown>;
  const previous = Object.entries(overrides).map(([key, value]) => ({
    key,
    exists: Object.prototype.hasOwnProperty.call(globals, key),
    value: globals[key],
    next: value
  }));
  for (const entry of previous) {
    if (entry.next === undefined) delete globals[entry.key];
    else globals[entry.key] = entry.next;
  }
  try {
    fn();
  } finally {
    for (const entry of previous) {
      if (entry.exists) globals[entry.key] = entry.value;
      else delete globals[entry.key];
    }
  }
};

class FakeCube {
  name?: string;
  ashfoxId?: string;
  from = [0, 0, 0] as [number, number, number];
  to = [1, 1, 1] as [number, number, number];
  box_uv = true;
  autouv = 1;
  mapAutoUVCalls = 0;
  setUVModeCalls: boolean[] = [];
  faces: Record<string, { uv?: [number, number, number, number] }> = {};

  constructor(options: Record<string, unknown>) {
    Object.assign(this, options);
  }

  mapAutoUV() {
    this.mapAutoUVCalls += 1;
  }

  setUVMode(value: boolean) {
    this.setUVModeCalls.push(value);
  }
}

{
  const adapter = new BlockbenchUvAdapter(noopLog);
  withGlobals(
    {
      Cube: undefined,
      Outliner: { root: [] }
    },
    () => {
      const err = adapter.setFaceUv({
        cubeName: 'cube',
        faces: { north: [0, 0, 16, 16] }
      });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'not_implemented');
    }
  );
}

{
  const adapter = new BlockbenchUvAdapter(noopLog);
  withGlobals(
    {
      Cube: FakeCube,
      Outliner: { root: [] }
    },
    () => {
      const err = adapter.setFaceUv({
        cubeName: 'missing',
        faces: { north: [0, 0, 16, 16] }
      });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'invalid_payload');
      assert.equal(err?.message, MODEL_CUBE_NOT_FOUND('missing'));
    }
  );
}

{
  const adapter = new BlockbenchUvAdapter(noopLog);
  const cube = new FakeCube({ name: 'body', ashfoxId: 'cube-1' });
  withGlobals(
    {
      Cube: FakeCube,
      Outliner: { root: [cube] }
    },
    () => {
      const err = adapter.setFaceUv({
        cubeName: 'body',
        faces: {}
      });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'invalid_payload');
      assert.equal(err?.message, UV_ASSIGNMENT_FACES_NON_EMPTY);
    }
  );
}

{
  const adapter = new BlockbenchUvAdapter(noopLog);
  const cube = new FakeCube({ name: 'body', ashfoxId: 'cube-1' });
  cube.faces.north = { uv: [0, 0, 1, 1] };
  withGlobals(
    {
      Cube: FakeCube,
      Outliner: { root: [cube] }
    },
    () => {
      const err = adapter.setFaceUv({
        cubeId: 'cube-1',
        faces: {
          north: [1, 2, 3, 4],
          south: [5, 6, 7, 8],
          unknown: [9, 9, 9, 9] as [number, number, number, number]
        } as never
      });
      assert.equal(err, null);
    }
  );
  assert.equal(cube.mapAutoUVCalls, 1);
  assert.deepEqual(cube.setUVModeCalls, [false]);
  assert.deepEqual(cube.faces.north.uv, [1, 2, 3, 4]);
  assert.deepEqual(cube.faces.south.uv, [5, 6, 7, 8]);
  assert.equal(cube.faces.unknown, undefined);
  assert.equal(cube.autouv, 0);
}

