import assert from 'node:assert/strict';

import { CubeService } from '../src/usecases/model/CubeService';
import { ProjectSession } from '../src/session';
import type { Capabilities } from '../src/types';
import { ok } from '../src/usecases/result';
import { createEditorStub } from './fakes';

const capabilities: Capabilities = {
  pluginVersion: 'test',
  blockbenchVersion: 'test',
  formats: [{ format: 'Java Block/Item', animations: true, enabled: true, flags: { singleTexture: true } }],
  limits: { maxCubes: 64, maxTextureSize: 64, maxAnimationSeconds: 5 }
};

const session = new ProjectSession();
const editor = createEditorStub({
  textures: [{ id: 'tex', name: 'tex', width: 16, height: 16 }]
});

let atlasCalls = 0;
const autoUvAtlas = () => {
  atlasCalls += 1;
  return ok({
    applied: true,
    steps: 0,
    resolution: { width: 16, height: 16 },
    textures: []
  });
};

const cubeService = new CubeService({
  session,
  editor,
  capabilities,
  getSnapshot: () => session.snapshot(),
  ensureActive: () => null,
  ensureRevisionMatch: () => null,
  autoUvAtlas,
  runWithoutRevisionGuard: (fn) => fn()
});

const addRes = cubeService.addCube({
  name: 'cube',
  from: [0, 0, 0],
  to: [4, 4, 4]
});
assert.equal(addRes.ok, true);
assert.equal(atlasCalls, 1);

const updateRes = cubeService.updateCube({
  name: 'cube',
  to: [5, 5, 5]
});
assert.equal(updateRes.ok, true);
assert.equal(atlasCalls, 2);

const updateNoChange = cubeService.updateCube({
  name: 'cube'
});
assert.equal(updateNoChange.ok, true);
assert.equal(atlasCalls, 2);
