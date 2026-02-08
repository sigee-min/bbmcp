import assert from 'node:assert/strict';

import { buildStateMeta, type StateMetaDeps } from '../src/domain/project/stateMeta';

const project = {
  id: 'p1',
  format: 'geckolib',
  formatId: 'geckolib_model',
  name: 'dragon',
  revision: 'r1',
  textureResolution: { width: 16, height: 16 },
  counts: { bones: 0, cubes: 0, textures: 0, animations: 0 },
  bones: [],
  cubes: [],
  textures: [],
  animations: []
};

const diff = {
  sinceRevision: 'r0',
  toRevision: 'r1',
  counts: { added: 0, updated: 1, deleted: 0 },
  byKind: {
    bones: { added: 0, updated: 0, deleted: 0 },
    cubes: { added: 0, updated: 1, deleted: 0 },
    textures: { added: 0, updated: 0, deleted: 0 },
    animations: { added: 0, updated: 0, deleted: 0 }
  },
  changes: [],
  appliedAt: new Date().toISOString()
};

{
  let stateCalls = 0;
  const deps: StateMetaDeps = {
    getProjectState: () => {
      stateCalls += 1;
      return { ok: true, value: { project } };
    },
    getProjectDiff: () => ({ ok: true, value: { diff } })
  };
  const meta = buildStateMeta(deps, {
    includeState: false,
    includeDiff: false,
    diffDetail: 'summary',
    includeRevision: false
  });
  assert.deepEqual(meta, {});
  assert.equal(stateCalls, 0);
}

{
  const deps: StateMetaDeps = {
    getProjectState: () => ({ ok: true, value: { project } }),
    getProjectDiff: () => ({ ok: true, value: { diff } })
  };
  const meta = buildStateMeta(deps, {
    includeState: true,
    includeDiff: false,
    diffDetail: 'summary'
  });
  assert.equal(meta.revision, 'r1');
  assert.equal(meta.state?.name, 'dragon');
  assert.equal(meta.diff, undefined);
}

{
  let diffCalls = 0;
  const deps: StateMetaDeps = {
    getProjectState: () => ({ ok: false, error: { code: 'invalid_state', message: 'no project' } }),
    getProjectDiff: () => {
      diffCalls += 1;
      return { ok: true, value: { diff } };
    }
  };
  const meta = buildStateMeta(deps, {
    includeState: true,
    includeDiff: true,
    diffDetail: 'full',
    ifRevision: 'r0'
  });
  assert.equal(meta.revision, undefined);
  assert.equal(meta.state, null);
  assert.equal(meta.diff, diff);
  assert.equal(diffCalls, 1);
}

{
  let diffCalls = 0;
  const deps: StateMetaDeps = {
    getProjectState: () => ({ ok: true, value: { project } }),
    getProjectDiff: () => {
      diffCalls += 1;
      return { ok: true, value: { diff } };
    }
  };
  const meta = buildStateMeta(deps, {
    includeState: false,
    includeDiff: true,
    diffDetail: 'summary'
  });
  assert.equal(meta.diff, null);
  assert.equal(diffCalls, 0);
}

{
  const deps: StateMetaDeps = {
    getProjectState: () => ({ ok: true, value: { project } }),
    getProjectDiff: () => ({ ok: false, error: { code: 'invalid_payload', message: 'bad revision' } })
  };
  const meta = buildStateMeta(deps, {
    includeState: false,
    includeDiff: true,
    diffDetail: 'summary',
    ifRevision: 'bad'
  });
  assert.equal(meta.diff, null);
}
