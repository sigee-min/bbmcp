import assert from 'node:assert/strict';

import type { ProjectDiff, ProjectState } from '../src/types';
import { TraceLogStore } from '../src/trace/traceLogStore';
import { TraceRecorder } from '../src/trace/traceRecorder';
import { parseTraceLogText } from '../src/trace/traceLogReplay';
import { ok } from './helpers';

const stepsFromTraceLog = (records: Array<{ kind: string; op?: string; payload?: unknown }>) =>
  records
    .filter((record) => record.kind === 'step' && typeof record.op === 'string')
    .map((record) => ({
      op: record.op as string,
      payload: record.payload
    }));

const createState = (revision: string): ProjectState => ({
  id: 'p1',
  active: true,
  name: 'project',
  format: 'geckolib',
  revision,
  counts: { bones: 0, cubes: 1, textures: 1, animations: 0 },
  textureResolution: { width: 16, height: 16 },
  cubes: [],
  textures: [],
  bones: [],
  animations: []
});

const createDiff = (since: string, current: string): ProjectDiff => ({
  sinceRevision: since,
  currentRevision: current,
  counts: {
    bones: { added: 0, removed: 0, changed: 0 },
    cubes: { added: 0, removed: 0, changed: 1 },
    textures: { added: 0, removed: 0, changed: 0 },
    animations: { added: 0, removed: 0, changed: 0 }
  }
});

let revision = 0;
const store = new TraceLogStore({ autoFlush: false, maxEntries: 100 });
const recorder = new TraceRecorder(
  {
    getProjectState: (_payload) => {
      revision += 1;
      return ok({ project: createState(`r${revision}`) });
    },
    getProjectDiff: (payload) => ok({ diff: createDiff(payload.sinceRevision, `r${revision}`) })
  },
  store,
  { includeState: true, includeDiff: true }
);

recorder.record('get_project_state', { detail: 'summary' }, { ok: true, data: { ok: true } });
recorder.record('assign_texture', { textureName: 'tex', cubeNames: ['cube'] }, { ok: true, data: { applied: true } });

const logText = store.getText();
assert.equal(logText.length > 0, true);

const parsed = parseTraceLogText(logText);
assert.equal(parsed.ok, true);
if (parsed.ok) {
  const steps = stepsFromTraceLog(parsed.records);
  assert.equal(steps.length, 2);
  assert.equal(steps[0].op, 'get_project_state');
  assert.equal(steps[1].op, 'assign_texture');
}



