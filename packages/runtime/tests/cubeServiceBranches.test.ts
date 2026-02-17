import assert from 'node:assert/strict';

import { ProjectSession } from '../src/session';
import { CubeService } from '../src/usecases/model/CubeService';
import type { EditorPort } from '../src/ports/editor';
import type { Capabilities } from '/contracts/types/internal';
import { createEditorStub } from './fakes';
import { ok } from '../src/usecases/result';

const capabilities: Capabilities = {
  pluginVersion: 'test',
  blockbenchVersion: 'test',
  authoring: { animations: true, enabled: true  },
  limits: { maxCubes: 4, maxTextureSize: 64, maxAnimationSeconds: 120 }
};

type CubeHarness = {
  session: ProjectSession;
  service: CubeService;
  calls: {
    addBone: number;
    addCube: number;
    updateCube: number;
    deleteCube: number;
    autoUvAtlas: number;
  };
};

const createHarness = (options?: {
  caps?: Capabilities;
  textures?: Array<{ id?: string | null; name: string; width: number; height: number }>;
  autoUv?: boolean;
  addCubeError?: { code: string; message: string };
  updateCubeError?: { code: string; message: string };
  deleteCubeError?: { code: string; message: string };
}): CubeHarness => {
  const session = new ProjectSession();
  session.create('demo');
  const baseEditor = createEditorStub({
    textures: options?.textures ?? [{ id: 'tex1', name: 'atlas', width: 16, height: 16 }]
  });
  const calls = {
    addBone: 0,
    addCube: 0,
    updateCube: 0,
    deleteCube: 0,
    autoUvAtlas: 0
  };
  const editor: EditorPort = {
    ...baseEditor,
    addBone: (params) => {
      calls.addBone += 1;
      return null;
    },
    addCube: (params) => {
      calls.addCube += 1;
      return options?.addCubeError ?? null;
    },
    updateCube: (params) => {
      calls.updateCube += 1;
      return options?.updateCubeError ?? null;
    },
    deleteCube: (params) => {
      calls.deleteCube += 1;
      return options?.deleteCubeError ?? null;
    }
  };

  const service = new CubeService({
    session,
    editor,
    capabilities: options?.caps ?? capabilities,
    getSnapshot: () => session.snapshot(),
    ensureActive: () => null,
    ensureRevisionMatch: () => null,
    autoUvAtlas:
      options?.autoUv === false
        ? undefined
        : () => {
            calls.autoUvAtlas += 1;
            return ok({
              applied: true,
              steps: 0,
              resolution: { width: 16, height: 16 },
              textures: []
            });
          },
    runWithoutRevisionGuard: (fn) => fn()
  });

  return { session, service, calls };
};

{
  const { service } = createHarness();
  const res = service.addCube({
    name: '',
    from: [0, 0, 0],
    to: [1, 1, 1]
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.ok(typeof res.error.fix === 'string');
  }
}

{
  const { session, service, calls } = createHarness();
  const res = service.addCube({
    id: 'cube1',
    name: 'cube',
    from: [-4, 6, -7],
    to: [4, 14, 7]
  });
  assert.equal(res.ok, true);
  assert.equal(calls.addBone, 1);
  assert.equal(calls.addCube, 1);
  assert.equal(calls.autoUvAtlas, 1);
  const snapshot = session.snapshot();
  assert.ok(snapshot.bones.some((bone) => bone.name === 'root'));
}

{
  const { session, service } = createHarness();
  session.addBone({ id: 'arm-id', name: 'arm', pivot: [0, 0, 0] });
  const res = service.addCube({
    name: 'arm_cube',
    from: [0, 0, 0],
    to: [1, 1, 1],
    bone: 'arm'
  });
  assert.equal(res.ok, true);
}

{
  const { service } = createHarness();
  const res = service.addCube({
    name: 'cube',
    from: [0, 0, 0],
    to: [1, 1, 1],
    boneId: 'missing'
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const strictCaps: Capabilities = {
    ...capabilities,
    limits: { ...capabilities.limits, maxCubes: 1 }
  };
  const { service } = createHarness({ caps: strictCaps });
  assert.equal(
    service.addCube({
      name: 'cube1',
      from: [0, 0, 0],
      to: [1, 1, 1]
    }).ok,
    true
  );
  const res = service.addCube({
    name: 'cube2',
    from: [0, 0, 0],
    to: [1, 1, 1]
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { service } = createHarness();
  assert.equal(
    service.addCube({
      id: 'cube-id',
      name: 'cube1',
      from: [0, 0, 0],
      to: [1, 1, 1]
    }).ok,
    true
  );
  const dup = service.addCube({
    id: 'cube-id',
    name: 'cube2',
    from: [0, 0, 0],
    to: [1, 1, 1]
  });
  assert.equal(dup.ok, false);
  if (!dup.ok) assert.equal(dup.error.code, 'invalid_payload');
}

{
  const { service, calls } = createHarness({ textures: [] });
  const res = service.addCube({
    name: 'cube',
    from: [0, 0, 0],
    to: [1, 1, 1]
  });
  assert.equal(res.ok, true);
  assert.equal(calls.autoUvAtlas, 0);
}

{
  const { service, calls } = createHarness();
  assert.equal(
    service.addCube({
      name: 'cube',
      from: [0, 0, 0],
      to: [1, 1, 1]
    }).ok,
    true
  );
  const res = service.updateCube({
    name: 'cube'
  });
  assert.equal(res.ok, true);
  assert.equal(calls.autoUvAtlas, 1);
}

{
  const { service, calls } = createHarness();
  assert.equal(service.addCube({ name: 'cube', from: [0, 0, 0], to: [1, 1, 1] }).ok, true);
  const res = service.updateCube({
    name: 'cube',
    to: [2, 2, 2]
  });
  assert.equal(res.ok, true);
  assert.equal(calls.autoUvAtlas, 2);
}

{
  const { session, service, calls } = createHarness();
  session.removeBones(['root']);
  session.addBone({ name: 'arm', pivot: [0, 0, 0] });
  session.addCube({ name: 'cube', bone: 'arm', from: [0, 0, 0], to: [1, 1, 1] });
  const res = service.updateCube({
    name: 'cube',
    boneRoot: true
  });
  assert.equal(res.ok, true);
  assert.equal(calls.addBone, 1);
}

{
  const { session, service } = createHarness();
  session.addBone({ name: 'root', pivot: [0, 0, 0] });
  session.addCube({ name: 'cube', bone: 'root', from: [0, 0, 0], to: [1, 1, 1] });
  const res = service.updateCube({
    name: 'cube',
    boneId: 'missing-id'
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { session, service } = createHarness();
  session.addBone({ name: 'root', pivot: [0, 0, 0] });
  session.addCube({ name: 'cube', bone: 'root', from: [0, 0, 0], to: [1, 1, 1] });
  const res = service.updateCube({
    name: 'cube',
    bone: 'missing-bone-name'
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { service, calls } = createHarness();
  assert.equal(service.addCube({ name: 'cube1', from: [0, 0, 0], to: [1, 1, 1] }).ok, true);
  assert.equal(service.addCube({ name: 'cube2', from: [0, 0, 0], to: [1, 1, 1] }).ok, true);
  const res = service.deleteCube({ names: ['cube1', 'cube2'] });
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.value.deleted.length, 2);
  assert.equal(calls.deleteCube, 2);
}

{
  const { service } = createHarness({ deleteCubeError: { code: 'invalid_state', message: 'delete failed' } });
  assert.equal(service.addCube({ name: 'cube1', from: [0, 0, 0], to: [1, 1, 1] }).ok, true);
  const res = service.deleteCube({ name: 'cube1' });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_state');
}
