import assert from 'node:assert/strict';

import type { EntityPipelinePayload } from '../../src/spec';
import { entityPipelineProxy } from '../../src/proxy/entityPipeline';
import { DEFAULT_LIMITS, makeProxyDeps, ok, registerAsync } from './helpers';

const project = {
  id: 'p1',
  active: true,
  name: null,
  format: 'geckolib',
  revision: 'r1',
  counts: { bones: 0, cubes: 0, textures: 0, animations: 0 },
  bones: [],
  cubes: [],
  textures: [],
  animations: []
};

const calls = {
  addBone: 0,
  addCube: 0,
  createClip: 0,
  setKeyframes: 0,
  setTriggers: 0
};

const service = {
  getProjectState: (_payload: unknown) => ok({ project }),
  addBone: (_payload: unknown) => {
    calls.addBone += 1;
    return ok({ id: 'root', name: 'root' });
  },
  addCube: (_payload: unknown) => {
    calls.addCube += 1;
    return ok({ id: 'cube', name: 'cube' });
  },
  updateBone: (_payload: unknown) => ok({ id: 'root', name: 'root' }),
  updateCube: (_payload: unknown) => ok({ id: 'cube', name: 'cube' }),
  deleteBone: (_payload: unknown) => ok({ id: 'root', name: 'root', removedBones: 0, removedCubes: 0 }),
  deleteCube: (_payload: unknown) => ok({ id: 'cube', name: 'cube' }),
  createAnimationClip: (_payload: unknown) => {
    calls.createClip += 1;
    return ok({ name: 'idle' });
  },
  updateAnimationClip: (_payload: unknown) => ok({ name: 'idle' }),
  setKeyframes: (_payload: unknown) => {
    calls.setKeyframes += 1;
    return ok({ applied: true });
  },
  setTriggerKeyframes: (_payload: unknown) => {
    calls.setTriggers += 1;
    return ok({ applied: true });
  },
  getUvPolicy: () => ({ allowOverlaps: false, allowScaleMismatch: false })
};

const deps = makeProxyDeps({ service, limits: DEFAULT_LIMITS });

const payload: EntityPipelinePayload = {
  format: 'geckolib',
  model: {
    bones: [{ id: 'root', pivot: [0, 0, 0] }]
  },
  animations: [
    {
      name: 'idle',
      length: 1,
      loop: true,
      channels: [
        { bone: 'root', channel: 'rot', keys: [{ time: 0, value: [0, 0, 0] }] }
      ],
      triggers: [{ type: 'sound', keys: [{ time: 0.5, value: 'example' }] }]
    }
  ]
};

registerAsync(
  (async () => {
    const res = await entityPipelineProxy(deps, payload);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.applied, true);
      assert.equal(res.data.format, 'geckolib');
      assert.equal(res.data.targetVersion, 'v4');
      assert.ok(res.data.steps.model);
      assert.ok(res.data.steps.animations);
    }
    assert.equal(calls.addBone, 1);
    assert.equal(calls.createClip, 1);
    assert.equal(calls.setKeyframes, 1);
    assert.equal(calls.setTriggers, 1);
  })()
);
