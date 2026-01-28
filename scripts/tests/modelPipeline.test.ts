import assert from 'node:assert/strict';

import { modelPipelineProxy } from '../../src/proxy/modelPipeline';
import type { ModelPipelinePayload } from '../../src/spec';
import { DEFAULT_LIMITS, makeProxyDeps, registerAsync } from './helpers';

type Calls = {
  addBone: Array<Record<string, unknown>>;
  updateBone: Array<Record<string, unknown>>;
  deleteBone: Array<Record<string, unknown>>;
  addCube: Array<Record<string, unknown>>;
  updateCube: Array<Record<string, unknown>>;
  deleteCube: Array<Record<string, unknown>>;
};

const createDeps = (projectOverrides: Partial<{ bones: unknown[]; cubes: unknown[] }> = {}) => {
  const calls: Calls = { addBone: [], updateBone: [], deleteBone: [], addCube: [], updateCube: [], deleteCube: [] };
  const project = {
    revision: 'r1',
    active: true,
    bones: [],
    cubes: [],
    textures: [],
    animations: [],
    ...projectOverrides
  };
  const service = {
    getProjectState: () => ({ ok: true, value: { project } }),
    getProjectDiff: () => ({ ok: true, value: { diff: {} } }),
    isRevisionRequired: () => false,
    isAutoRetryRevisionEnabled: () => false,
    ensureProject: () => ({ ok: true, value: { action: 'reused', project: { id: 'p', format: 'java_block', name: null } } }),
    addBone: (payload: Record<string, unknown>) => {
      calls.addBone.push(payload);
      return { ok: true, value: { id: payload.id ?? 'id', name: payload.name ?? 'bone' } };
    },
    updateBone: (payload: Record<string, unknown>) => {
      calls.updateBone.push(payload);
      return { ok: true, value: { id: payload.id ?? 'id', name: payload.newName ?? payload.name ?? 'bone' } };
    },
    deleteBone: (payload: Record<string, unknown>) => {
      calls.deleteBone.push(payload);
      return { ok: true, value: { id: 'id', name: 'bone', removedBones: 1, removedCubes: 0 } };
    },
    addCube: (payload: Record<string, unknown>) => {
      calls.addCube.push(payload);
      return { ok: true, value: { id: payload.id ?? 'id', name: payload.name ?? 'cube' } };
    },
    updateCube: (payload: Record<string, unknown>) => {
      calls.updateCube.push(payload);
      return { ok: true, value: { id: payload.id ?? 'id', name: payload.newName ?? payload.name ?? 'cube' } };
    },
    deleteCube: (payload: Record<string, unknown>) => {
      calls.deleteCube.push(payload);
      return { ok: true, value: { id: 'id', name: 'cube' } };
    },
    renderPreview: () => ({ ok: true, value: { images: [] } }),
    validate: () => ({ ok: true, value: { findings: [] } }),
    exportModel: () => ({ ok: true, value: { path: 'out' } })
  };

  const deps = makeProxyDeps({ service, limits: DEFAULT_LIMITS });

  return { deps, calls };
};

registerAsync(
  (async () => {
    const { deps, calls } = createDeps({
      bones: [
        { id: 'root', name: 'root', parent: undefined, pivot: [0, 0, 0], visibility: true },
        { id: 'spine', name: 'spine', parent: 'root', pivot: [0, 0, 0], visibility: true }
      ]
    });

    const payload: ModelPipelinePayload = {
      model: {
        bones: [
          { id: 'root' },
          { id: 'spine', parentId: 'root', visibility: false }
        ]
      },
      mode: 'merge'
    };

    const res = await modelPipelineProxy(deps, payload);
    assert.equal(res.ok, true);
    assert.equal(calls.updateBone.length, 1);
    assert.equal(calls.updateBone[0].id, 'spine');
    assert.equal(calls.updateBone[0].visibility, false);
  })()
);

registerAsync(
  (async () => {
    const { deps, calls } = createDeps({
      bones: [
        { id: 'root', name: 'root', parent: undefined, pivot: [0, 0, 0], visibility: true },
        { id: 'spine', name: 'spine', parent: 'root', pivot: [0, 0, 0], visibility: true }
      ],
      cubes: [
        { id: 'spine_cube', name: 'spine_cube', bone: 'spine', from: [0, 0, 0], to: [1, 1, 1] }
      ]
    });

    const payload: ModelPipelinePayload = {
      model: {
        bones: [{ id: 'root' }]
      },
      mode: 'replace',
      planOnly: true
    };

    const res = await modelPipelineProxy(deps, payload);
    assert.equal(res.ok, true);
    assert.equal(calls.addBone.length, 0);
    assert.equal(calls.updateBone.length, 0);
    assert.equal(calls.deleteBone.length, 0);
    assert.equal(calls.addCube.length, 0);
    assert.equal(calls.updateCube.length, 0);
    assert.equal(calls.deleteCube.length, 0);
    if (res.ok) {
      const data = res.data as { steps?: { planOps?: Array<{ op: string }> } };
      const ops = data.steps?.planOps ?? [];
      assert.ok(ops.some((op) => op.op === 'delete_bone'));
      assert.ok(ops.some((op) => op.op === 'delete_cube'));
    }
  })()
);


