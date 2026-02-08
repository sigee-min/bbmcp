import assert from 'node:assert/strict';

import { BlockbenchBoneAdapter } from '../../src/adapters/blockbench/geometry/BoneAdapter';
import { MODEL_BONE_NOT_FOUND, MODEL_PARENT_BONE_NOT_FOUND } from '../../src/shared/messages';
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

class FakeGroup {
  name?: string;
  origin?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  visibility = true;
  children?: unknown[];
  parent?: FakeGroup | null;
  ashfoxId?: string;

  constructor(options: Record<string, unknown>) {
    Object.assign(this, options);
    this.children = this.children ?? [];
  }

  init() {
    return this;
  }
}

{
  const adapter = new BlockbenchBoneAdapter(noopLog);
  withGlobals(
    {
      Group: undefined,
      Outliner: { root: [] }
    },
    () => {
      const err = adapter.addBone({
        name: 'body',
        pivot: [0, 0, 0]
      });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'not_implemented');
    }
  );
}

{
  const adapter = new BlockbenchBoneAdapter(noopLog);
  const outliner = { root: [] as unknown[] };
  withGlobals(
    {
      Group: FakeGroup,
      Outliner: outliner
    },
    () => {
      const err = adapter.addBone({
        id: 'bone-1',
        name: 'body',
        pivot: [0, 5, 0],
        rotation: [0, 45, 0],
        scale: [1, 1, 1],
        visibility: false
      });
      assert.equal(err, null);
    }
  );
  assert.equal(outliner.root.length, 1);
  const created = outliner.root[0] as FakeGroup;
  assert.equal(created.name, 'body');
  assert.equal(created.ashfoxId, 'bone-1');
  assert.deepEqual(created.origin, [0, 5, 0]);
  assert.deepEqual(created.rotation, [0, 45, 0]);
  assert.equal(created.visibility, false);
}

{
  const adapter = new BlockbenchBoneAdapter(noopLog);
  const outliner = { root: [] as unknown[] };
  withGlobals(
    {
      Group: FakeGroup,
      Outliner: outliner
    },
    () => {
      const err = adapter.updateBone({
        name: 'missing'
      });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'invalid_payload');
      assert.equal(err?.message, MODEL_BONE_NOT_FOUND('missing'));
    }
  );
}

{
  const adapter = new BlockbenchBoneAdapter(noopLog);
  const body = new FakeGroup({ name: 'body', origin: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
  const outliner = { root: [body] as unknown[] };
  withGlobals(
    {
      Group: FakeGroup,
      Outliner: outliner
    },
    () => {
      const err = adapter.updateBone({
        name: 'body',
        parent: 'missing_parent'
      });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'invalid_payload');
      assert.equal(err?.message, MODEL_PARENT_BONE_NOT_FOUND('missing_parent'));
    }
  );
}

{
  const adapter = new BlockbenchBoneAdapter(noopLog);
  const root = new FakeGroup({ name: 'root', children: [] });
  const child = new FakeGroup({
    id: 'old-id',
    name: 'child',
    origin: [0, 1, 2],
    rotation: [1, 2, 3],
    scale: [1, 1, 1],
    parent: root
  });
  root.children?.push(child);
  const outliner = { root: [root] as unknown[] };
  withGlobals(
    {
      Group: FakeGroup,
      Outliner: outliner
    },
    () => {
      const err = adapter.updateBone({
        id: 'new-id',
        name: 'child',
        newName: 'child_renamed',
        pivot: [3, 4, 5],
        rotation: [6, 7, 8],
        scale: [2, 2, 2],
        visibility: true,
        parentRoot: true
      });
      assert.equal(err, null);
    }
  );
  assert.equal(child.ashfoxId, 'new-id');
  assert.equal(child.name, 'child_renamed');
  assert.deepEqual(child.origin, [3, 4, 5]);
  assert.deepEqual(child.rotation, [6, 7, 8]);
  assert.deepEqual(child.scale, [2, 2, 2]);
  assert.equal(child.visibility, true);
  assert.ok((outliner.root as unknown[]).includes(child));
}

{
  const adapter = new BlockbenchBoneAdapter(noopLog);
  const target = new FakeGroup({ name: 'to_delete' });
  const outliner = { root: [target] as unknown[] };
  withGlobals(
    {
      Group: FakeGroup,
      Outliner: outliner
    },
    () => {
      const err = adapter.deleteBone({ name: 'to_delete' });
      assert.equal(err, null);
    }
  );
  assert.equal(outliner.root.length, 0);
}

{
  const adapter = new BlockbenchBoneAdapter(noopLog);
  withGlobals(
    {
      Group: FakeGroup,
      Outliner: { root: [] }
    },
    () => {
      const err = adapter.deleteBone({ name: 'missing' });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'invalid_payload');
      assert.equal(err?.message, MODEL_BONE_NOT_FOUND('missing'));
    }
  );
}

