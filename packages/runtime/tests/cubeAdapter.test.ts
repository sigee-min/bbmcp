import assert from 'node:assert/strict';

import { BlockbenchCubeAdapter } from '../src/adapters/blockbench/geometry/CubeAdapter';
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
  from?: [number, number, number] | { x?: number; y?: number; z?: number; set?: (...args: number[]) => void };
  to?: [number, number, number];
  origin?: [number, number, number];
  rotation?: [number, number, number];
  uv_offset?: [number, number];
  box_uv?: boolean;
  visibility?: boolean;
  visible?: boolean;
  ashfoxId?: string;

  constructor(options: Record<string, unknown>) {
    Object.assign(this, options);
  }

  init() {
    return this;
  }
}

class FakeUvCube extends FakeCube {
  setUvModeCalls: boolean[] = [];

  setUVMode(value: boolean) {
    this.setUvModeCalls.push(value);
  }
}

// addCube should create a cube and attach it to the outliner root.
{
  const adapter = new BlockbenchCubeAdapter(noopLog);
  const outliner = { root: [] as unknown[] };
  withGlobals(
    {
      Cube: FakeCube,
      Outliner: outliner,
      Group: undefined,
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = adapter.addCube({
        id: 'cube-1',
        name: 'body_main',
        from: [-4, 6, -7],
        to: [4, 14, 7],
        uvOffset: [0, 0],
        visibility: false
      });
      assert.equal(err, null);
    }
  );
  assert.equal(outliner.root.length, 1);
  const cube = outliner.root[0] as FakeCube;
  assert.equal(cube.name, 'body_main');
  assert.deepEqual(cube.from, [-4, 6, -7]);
  assert.deepEqual(cube.to, [4, 14, 7]);
  assert.equal(cube.ashfoxId, 'cube-1');
}

// addCube should apply explicit box UV mode through Blockbench setters when provided.
{
  const adapter = new BlockbenchCubeAdapter(noopLog);
  const outliner = { root: [] as unknown[] };
  withGlobals(
    {
      Cube: FakeUvCube,
      Outliner: outliner,
      Group: undefined,
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = adapter.addCube({
        name: 'body_uv',
        from: [0, 0, 0],
        to: [2, 2, 2],
        boxUv: true
      });
      assert.equal(err, null);
    }
  );
  const cube = outliner.root[0] as FakeUvCube;
  assert.equal(cube.box_uv, true);
  assert.equal(cube.setUvModeCalls[cube.setUvModeCalls.length - 1], true);
}

// updateCube should fail fast when applied vectors differ from requested values.
{
  const adapter = new BlockbenchCubeAdapter(noopLog);
  const problematicCube = {
    name: 'body_main',
    from: {
      set: (_x: number, _y: number, _z: number) => undefined
    },
    to: [4, 14, 7]
  };
  const outliner = { root: [problematicCube] };
  withGlobals(
    {
      Cube: FakeCube,
      Outliner: outliner,
      Group: undefined,
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = adapter.updateCube({
        name: 'body_main',
        from: [-4, 6, -7]
      });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'invalid_state');
      assert.equal(err?.details?.reason, 'cube_vector_mismatch');
      assert.equal(err?.details?.field, 'from');
    }
  );
}

// updateCube should return invalid_payload when the target cube does not exist.
{
  const adapter = new BlockbenchCubeAdapter(noopLog);
  withGlobals(
    {
      Cube: FakeCube,
      Outliner: { root: [] },
      Group: undefined,
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = adapter.updateCube({
        name: 'missing_cube',
        from: [0, 0, 0]
      });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'invalid_payload');
    }
  );
}

// updateCube should validate missing target bones before moving outliner nodes.
{
  const adapter = new BlockbenchCubeAdapter(noopLog);
  const cube = {
    name: 'body_main',
    from: [-4, 6, -7],
    to: [4, 14, 7]
  };
  const outliner = { root: [cube] };
  withGlobals(
    {
      Cube: FakeCube,
      Outliner: outliner,
      Group: undefined,
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = adapter.updateCube({
        name: 'body_main',
        bone: 'missing_bone'
      });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'invalid_payload');
    }
  );
}

// updateCube should preserve negative vectors when cube components are vector-like objects.
{
  const adapter = new BlockbenchCubeAdapter(noopLog);
  const makeVec = () => ({
    x: 0,
    y: 0,
    z: 0,
    set(this: { x: number; y: number; z: number }, x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
  });
  const cube = {
    name: 'body_main',
    from: makeVec(),
    to: makeVec(),
    origin: makeVec(),
    rotation: makeVec(),
    uv_offset: [0, 0] as [number, number]
  };
  const outliner = { root: [cube] };
  withGlobals(
    {
      Cube: FakeCube,
      Outliner: outliner,
      Group: undefined,
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = adapter.updateCube({
        name: 'body_main',
        from: [-4, 6, -7],
        to: [4, 14, 7],
        origin: [-1, 0, 1],
        rotation: [0, 15, 0],
        uvOffset: [8, 4],
        mirror: true,
        boxUv: false
      });
      assert.equal(err, null);
    }
  );
  assert.deepEqual([cube.from.x, cube.from.y, cube.from.z], [-4, 6, -7]);
  assert.deepEqual([cube.to.x, cube.to.y, cube.to.z], [4, 14, 7]);
  assert.deepEqual([cube.origin.x, cube.origin.y, cube.origin.z], [-1, 0, 1]);
  assert.deepEqual([cube.rotation.x, cube.rotation.y, cube.rotation.z], [0, 15, 0]);
  assert.deepEqual(cube.uv_offset, [8, 4]);
}

// updateCube should surface the mismatched field in verification errors.
{
  const adapter = new BlockbenchCubeAdapter(noopLog);
  const cube = {
    name: 'body_main',
    from: [-4, 6, -7],
    to: {
      set: (_x: number, _y: number, _z: number) => undefined
    }
  };
  const outliner = { root: [cube] };
  withGlobals(
    {
      Cube: FakeCube,
      Outliner: outliner,
      Group: undefined,
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = adapter.updateCube({
        name: 'body_main',
        to: [4, 14, 7]
      });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'invalid_state');
      assert.equal(err?.details?.reason, 'cube_vector_mismatch');
      assert.equal(err?.details?.field, 'to');
    }
  );
}

// deleteCube should remove the cube from outliner root.
{
  const adapter = new BlockbenchCubeAdapter(noopLog);
  const cube = {
    name: 'body_main',
    from: [-4, 6, -7],
    to: [4, 14, 7]
  };
  const outliner = { root: [cube] };
  withGlobals(
    {
      Cube: FakeCube,
      Outliner: outliner,
      Group: undefined,
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = adapter.deleteCube({ name: 'body_main' });
      assert.equal(err, null);
    }
  );
  assert.equal(outliner.root.length, 0);
}

// deleteCube should return invalid_payload when the target cube is missing.
{
  const adapter = new BlockbenchCubeAdapter(noopLog);
  withGlobals(
    {
      Cube: FakeCube,
      Outliner: { root: [] },
      Group: undefined,
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = adapter.deleteCube({ name: 'missing_cube' });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'invalid_payload');
    }
  );
}

