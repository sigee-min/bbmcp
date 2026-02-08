import assert from 'node:assert/strict';

import { createCubeMutationPolicy } from '../src/usecases/model/cubeMutationPolicy';

{
  let addBoneCalls = 0;
  let addRootCalls = 0;
  const policy = createCubeMutationPolicy({
    editor: {
      addBone: () => {
        addBoneCalls += 1;
        return null;
      },
      listTextures: () => []
    } as never,
    addRootBoneToSession: () => {
      addRootCalls += 1;
    }
  });

  const err = policy.ensureRootBone({
    bones: [],
    cubes: [],
    animations: []
  } as never);
  assert.equal(err, null);
  assert.equal(addBoneCalls, 1);
  assert.equal(addRootCalls, 1);
}

{
  let autoUvCalls = 0;
  let guardCalls = 0;
  const policy = createCubeMutationPolicy({
    editor: {
      addBone: () => null,
      listTextures: () => [{ id: 'tex1', name: 'atlas' }]
    } as never,
    addRootBoneToSession: () => undefined,
    autoUvAtlas: () => {
      autoUvCalls += 1;
      return { ok: true, value: { applied: true, steps: 0, resolution: { width: 16, height: 16 }, textures: [] } };
    },
    runWithoutRevisionGuard: (fn) => {
      guardCalls += 1;
      return fn();
    }
  });

  policy.afterAddCube();
  policy.afterUpdateCube(false);
  policy.afterUpdateCube(true);
  assert.equal(autoUvCalls, 2);
  assert.equal(guardCalls, 2);
}
