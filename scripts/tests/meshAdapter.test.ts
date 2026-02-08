import assert from 'node:assert/strict';

import { BlockbenchMeshAdapter } from '../../src/adapters/blockbench/geometry/MeshAdapter';
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

class FakeMesh {
  name?: string;
  origin?: [number, number, number];
  rotation?: [number, number, number];
  vertices?: Record<string, [number, number, number]>;
  faces?: Record<string, Record<string, unknown>>;
  visibility?: boolean = true;
  visible?: boolean = true;
  ashfoxId?: string;
  children?: unknown[];

  constructor(options: Record<string, unknown>) {
    Object.assign(this, options);
  }

  init() {
    return this;
  }

  extend(patch: Record<string, unknown>) {
    Object.assign(this, patch);
  }

  addTo(parent: { children?: unknown[] }) {
    parent.children ??= [];
    parent.children.push(this);
  }
}

{
  const adapter = new BlockbenchMeshAdapter(noopLog);
  withGlobals(
    {
      Mesh: undefined,
      Outliner: { root: [] },
      Group: undefined,
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = adapter.addMesh({
        name: 'body_mesh',
        vertices: [
          { id: 'v0', pos: [0, 0, 0] },
          { id: 'v1', pos: [1, 0, 0] },
          { id: 'v2', pos: [0, 1, 0] }
        ],
        faces: [{ id: 'f0', vertices: ['v0', 'v1', 'v2'] }]
      });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'not_implemented');
    }
  );
}

{
  const adapter = new BlockbenchMeshAdapter(noopLog);
  const outliner = { root: [] as unknown[] };
  withGlobals(
    {
      Mesh: FakeMesh,
      Outliner: outliner,
      Group: undefined,
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = adapter.addMesh({
        id: 'mesh-1',
        name: 'body_mesh',
        vertices: [
          { id: 'v0', pos: [0, 0, 0] },
          { id: 'v1', pos: [1, 0, 0] },
          { id: 'v2', pos: [0, 1, 0] }
        ],
        faces: [{ id: 'f0', vertices: ['v0', 'v1', 'v2'] }],
        visibility: false
      });
      assert.equal(err, null);
    }
  );
  assert.equal(outliner.root.length, 1);
  const mesh = outliner.root[0] as FakeMesh;
  assert.equal(mesh.name, 'body_mesh');
  assert.equal(mesh.ashfoxId, 'mesh-1');
  assert.deepEqual(mesh.vertices?.v1, [1, 0, 0]);
  assert.deepEqual(mesh.faces?.f0?.vertices, ['v0', 'v1', 'v2']);
  assert.equal(mesh.visibility, false);
}

{
  const adapter = new BlockbenchMeshAdapter(noopLog);
  const mesh = new FakeMesh({
    name: 'body_mesh',
    vertices: {
      v0: [0, 0, 0],
      v1: [1, 0, 0],
      v2: [0, 1, 0]
    },
    faces: {
      f0: { vertices: ['v0', 'v1', 'v2'] }
    }
  });
  const outliner = { root: [mesh] as unknown[] };
  withGlobals(
    {
      Mesh: FakeMesh,
      Outliner: outliner,
      Group: undefined,
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = adapter.updateMesh({
        name: 'body_mesh',
        newName: 'body_main',
        origin: [2, 3, 4],
        vertices: [
          { id: 'v0', pos: [0, 0, 0] },
          { id: 'v1', pos: [2, 0, 0] },
          { id: 'v2', pos: [0, 2, 0] }
        ],
        faces: [{ id: 'f0', vertices: ['v0', 'v1', 'v2'] }]
      });
      assert.equal(err, null);
    }
  );
  assert.equal(mesh.name, 'body_main');
  assert.deepEqual(mesh.origin, [2, 3, 4]);
  assert.deepEqual(mesh.vertices?.v1, [2, 0, 0]);
}

{
  const adapter = new BlockbenchMeshAdapter(noopLog);
  withGlobals(
    {
      Mesh: FakeMesh,
      Outliner: { root: [] },
      Group: undefined,
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = adapter.updateMesh({ name: 'missing_mesh', origin: [0, 0, 0] });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'invalid_payload');
    }
  );
}

{
  const adapter = new BlockbenchMeshAdapter(noopLog);
  const mesh = new FakeMesh({ name: 'body_mesh', vertices: {}, faces: {} });
  const outliner = { root: [mesh] as unknown[] };
  withGlobals(
    {
      Mesh: FakeMesh,
      Outliner: outliner,
      Group: undefined,
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = adapter.deleteMesh({ name: 'body_mesh' });
      assert.equal(err, null);
    }
  );
  assert.equal(outliner.root.length, 0);
}

