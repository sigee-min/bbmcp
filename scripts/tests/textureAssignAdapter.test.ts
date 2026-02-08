import assert from 'node:assert/strict';

import { BlockbenchTextureAssignAdapter } from '../../src/adapters/blockbench/geometry/TextureAssignAdapter';
import { ALL_FACES } from '../../src/adapters/blockbench/geometry/uvUtils';
import {
  ADAPTER_CUBE_APPLY_TEXTURE_UNAVAILABLE,
  TEXTURE_ASSIGN_NO_TARGETS,
  TEXTURE_NOT_FOUND
} from '../../src/shared/messages';
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
  static instances: FakeCube[] = [];

  name?: string;
  ashfoxId?: string;
  from = [0, 0, 0] as [number, number, number];
  to = [1, 1, 1] as [number, number, number];
  box_uv = true;
  autouv = 1;
  mapAutoUVCalls = 0;
  setUVModeCalls: boolean[] = [];
  applyTextureCalls: Array<true | string[]> = [];
  faces: Record<string, { uv?: [number, number, number, number]; texture?: string }> = {};

  constructor(options: Record<string, unknown>) {
    Object.assign(this, options);
    FakeCube.instances.push(this);
  }

  applyTexture(_texture: unknown, faces?: true | string[]) {
    this.applyTextureCalls.push(faces ?? true);
    const targets = faces === true || !faces ? ALL_FACES : faces;
    targets.forEach((face) => {
      const faceRef = this.faces[face] ?? {};
      faceRef.uv = [99, 99, 99, 99];
      faceRef.texture = 'overwritten';
      this.faces[face] = faceRef;
    });
  }

  mapAutoUV() {
    this.mapAutoUVCalls += 1;
  }

  setUVMode(value: boolean) {
    this.setUVModeCalls.push(value);
  }
}

class FakeTexture {
  static all: FakeTexture[] = [];
  name?: string;
  uuid?: string;
  id?: string;
  ashfoxId?: string;

  constructor(options: Record<string, unknown>) {
    Object.assign(this, options);
    FakeTexture.all.push(this);
  }
}

{
  const adapter = new BlockbenchTextureAssignAdapter(noopLog);
  withGlobals(
    {
      Cube: undefined,
      Texture: FakeTexture,
      Outliner: { root: [] }
    },
    () => {
      const err = adapter.assignTexture({ textureName: 'atlas' });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'not_implemented');
    }
  );
}

{
  FakeCube.instances = [];
  FakeTexture.all = [];
  const cube = new FakeCube({ name: 'body', ashfoxId: 'cube-1' });
  const outliner = { root: [cube] as unknown[] };
  const adapter = new BlockbenchTextureAssignAdapter(noopLog);
  withGlobals(
    {
      Cube: FakeCube,
      Texture: FakeTexture,
      Outliner: outliner
    },
    () => {
      const err = adapter.assignTexture({ textureName: 'missing' });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'invalid_payload');
      assert.equal(err?.message, TEXTURE_NOT_FOUND('missing'));
    }
  );
}

{
  FakeCube.instances = [];
  FakeTexture.all = [];
  new FakeTexture({ name: 'atlas', uuid: 'tex-uuid' });
  const cube = new FakeCube({ name: 'body', ashfoxId: 'cube-1' });
  const outliner = { root: [cube] as unknown[] };
  const adapter = new BlockbenchTextureAssignAdapter(noopLog);
  withGlobals(
    {
      Cube: FakeCube,
      Texture: FakeTexture,
      Outliner: outliner
    },
    () => {
      const err = adapter.assignTexture({ textureName: 'atlas', cubeNames: ['missing'] });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'invalid_payload');
      assert.equal(err?.message, TEXTURE_ASSIGN_NO_TARGETS);
    }
  );
}

{
  FakeCube.instances = [];
  FakeTexture.all = [];
  new FakeTexture({ name: 'atlas', uuid: 'tex-uuid' });
  const cube = {
    name: 'body',
    ashfoxId: 'cube-1',
    from: [0, 0, 0] as [number, number, number],
    to: [1, 1, 1] as [number, number, number]
  };
  const outliner = { root: [cube] as unknown[] };
  const adapter = new BlockbenchTextureAssignAdapter(noopLog);
  withGlobals(
    {
      Cube: FakeCube,
      Texture: FakeTexture,
      Outliner: outliner
    },
    () => {
      const err = adapter.assignTexture({ textureName: 'atlas' });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'not_implemented');
      assert.equal(err?.message, ADAPTER_CUBE_APPLY_TEXTURE_UNAVAILABLE);
    }
  );
}

{
  FakeCube.instances = [];
  FakeTexture.all = [];
  new FakeTexture({ name: 'atlas', uuid: 'tex-uuid' });
  const cube = new FakeCube({ name: 'body', ashfoxId: 'cube-1' });
  cube.faces.north = { uv: [1, 2, 3, 4] };
  cube.faces.south = { uv: [5, 6, 7, 8] };
  const outliner = { root: [cube] as unknown[] };
  const adapter = new BlockbenchTextureAssignAdapter(noopLog);
  withGlobals(
    {
      Cube: FakeCube,
      Texture: FakeTexture,
      Outliner: outliner
    },
    () => {
      const err = adapter.assignTexture({
        textureName: 'atlas',
        cubeIds: ['cube-1'],
        faces: ['north', 'south']
      });
      assert.equal(err, null);
    }
  );
  assert.equal(cube.mapAutoUVCalls, 1);
  assert.deepEqual(cube.setUVModeCalls, [false]);
  assert.deepEqual(cube.applyTextureCalls, [['north', 'south']]);
  assert.equal(cube.faces.north.texture, 'tex-uuid');
  assert.equal(cube.faces.south.texture, 'tex-uuid');
  assert.deepEqual(cube.faces.north.uv, [1, 2, 3, 4]);
  assert.deepEqual(cube.faces.south.uv, [5, 6, 7, 8]);
  assert.equal(cube.box_uv, true);
  assert.equal(cube.autouv, 0);
}

{
  FakeCube.instances = [];
  FakeTexture.all = [];
  new FakeTexture({ name: 'atlas', uuid: 'tex-uuid' });
  const cube = new FakeCube({ name: 'body', ashfoxId: 'cube-1' });
  const outliner = { root: [cube] as unknown[] };
  const adapter = new BlockbenchTextureAssignAdapter(noopLog);
  withGlobals(
    {
      Cube: FakeCube,
      Texture: FakeTexture,
      Outliner: outliner
    },
    () => {
      const err = adapter.assignTexture({
        textureName: 'atlas',
        faces: []
      });
      assert.equal(err, null);
    }
  );
  assert.deepEqual(cube.applyTextureCalls, [true]);
  assert.equal(cube.faces.east.texture, 'tex-uuid');
  assert.equal(cube.faces.down.texture, 'tex-uuid');
}

