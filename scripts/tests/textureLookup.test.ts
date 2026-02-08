import assert from 'node:assert/strict';

import { findTextureRef, listTextureStats } from '../../src/adapters/blockbench/texture/textureLookup';

type Globals = { Texture?: unknown };

const readGlobals = (): Globals => globalThis as unknown as Globals;

const withGlobals = (overrides: Globals, run: () => void) => {
  const globals = readGlobals();
  const before: Globals = { Texture: globals.Texture };
  globals.Texture = overrides.Texture;
  try {
    run();
  } finally {
    globals.Texture = before.Texture;
  }
};

class FakeTexture {
  static all: FakeTexture[] = [];
  id?: string;
  uuid?: string;
  ashfoxId?: string;
  name?: string;
  path?: string;
  source?: string;
  width?: number;
  height?: number;
  canvas?: { width: number; height: number };
  img?: { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
}

{
  withGlobals({}, () => {
    assert.equal(findTextureRef('a', 'b'), null);
    assert.deepEqual(listTextureStats(), []);
  });
}

{
  const first = new FakeTexture();
  first.id = 'id-1';
  first.name = 'first';
  const second = new FakeTexture();
  second.id = 'id-2';
  second.name = 'second';
  FakeTexture.all = [first, second];
  withGlobals({ Texture: FakeTexture }, () => {
    const found = findTextureRef('first', 'id-2');
    assert.equal(found, second);
  });
}

{
  const tex = new FakeTexture();
  tex.id = 'alias-id';
  tex.name = 'alias-name';
  FakeTexture.all = [tex];
  withGlobals({ Texture: FakeTexture }, () => {
    assert.equal(findTextureRef('alias-name'), tex);
    assert.equal(findTextureRef('alias-id'), tex);
    assert.equal(findTextureRef(undefined, 'alias-id'), tex);
    assert.equal(findTextureRef('missing'), null);
  });
}

{
  const first = new FakeTexture();
  first.ashfoxId = 'ashfox-1';
  first.name = 'atlas';
  first.canvas = { width: 32, height: 48 };
  first.path = '/tmp/atlas.png';

  const second = new FakeTexture();
  second.id = 'id-2';
  second.name = 'fallback-size';
  second.width = 16;
  second.height = 24;
  second.source = 'memory://fallback';

  const third = new FakeTexture();
  third.uuid = 'uuid-3';
  third.img = { naturalWidth: 12, naturalHeight: 6 };

  FakeTexture.all = [first, second, third];
  withGlobals({ Texture: FakeTexture }, () => {
    const stats = listTextureStats();
    assert.equal(stats.length, 3);
    assert.deepEqual(stats[0], {
      id: 'ashfox-1',
      name: 'atlas',
      width: 32,
      height: 48,
      path: '/tmp/atlas.png'
    });
    assert.deepEqual(stats[1], {
      id: 'id-2',
      name: 'fallback-size',
      width: 16,
      height: 24,
      path: 'memory://fallback'
    });
    assert.deepEqual(stats[2], {
      id: 'uuid-3',
      name: 'texture',
      width: 12,
      height: 6,
      path: undefined
    });
  });
}


