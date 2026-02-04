import assert from 'node:assert/strict';

import type { ProjectDiff, ProjectState } from '../../src/types';
import { TraceLogStore } from '../../src/trace/traceLogStore';
import { TraceRecorder } from '../../src/trace/traceRecorder';
import { parseTraceLogText } from '../../src/trace/traceLogReplay';
import { TraceLogFlushScheduler } from '../../src/trace/traceLogFlushScheduler';
import { InMemoryTraceLogWriter } from '../../src/trace/traceLogWriters';
import { ok } from './helpers';

const createState = (): ProjectState => ({
  id: 'p1',
  active: true,
  name: 'project',
  format: 'geckolib',
  revision: 'r1',
  counts: { bones: 0, cubes: 1, textures: 1, animations: 0 },
  textureResolution: { width: 16, height: 16 },
  textures: [{ id: 't1', name: 'tex', path: 'path', width: 16, height: 16 }],
  textureUsage: {
    textures: [
      {
        id: 't1',
        name: 'tex',
        cubeCount: 1,
        faceCount: 1,
        cubes: [{ id: 'c1', name: 'cube', faces: [{ face: 'north', uv: [0, 0, 16, 16] }] }]
      }
    ]
  },
  cubes: [],
  bones: [],
  animations: []
});

const createDiff = (): ProjectDiff => ({
  sinceRevision: 'r0',
  currentRevision: 'r1',
  counts: {
    bones: { added: 0, removed: 0, changed: 0 },
    cubes: { added: 0, removed: 0, changed: 1 },
    textures: { added: 0, removed: 0, changed: 0 },
    animations: { added: 0, removed: 0, changed: 0 }
  },
  textures: {
    added: [{ key: 't1', item: { id: 't1', name: 'tex', path: 'path', width: 16, height: 16 } }],
    removed: [],
    changed: []
  }
});

const appendStep = (store: TraceLogStore, seq: number, op: string) =>
  store.append({
    kind: 'step',
    seq,
    ts: new Date().toISOString(),
    route: 'tool',
    op,
    response: { ok: true }
  });

// Store trims by maxBytes.
{
  const store = new TraceLogStore({ autoFlush: false, maxEntries: 10 });
  appendStep(store, 1, 'one');
  appendStep(store, 2, 'two');
  const cap = store.getText().length;
  store.update({ maxBytes: cap });
  appendStep(store, 3, 'three');
  assert.ok(store.size() < 3);
}

// Detail rule enables full state + usage for UV-heavy ops.
{
  const store = new TraceLogStore({ autoFlush: false, maxEntries: 20 });
  const recorder = new TraceRecorder(
    {
      getProjectState: (_payload) => ok({ project: createState() }),
      getProjectDiff: (_payload) => ok({ diff: createDiff() })
    },
    store,
    {
      includeState: true,
      includeDiff: true,
      stateDetail: 'summary',
      diffDetail: 'summary',
      detailRules: [
        {
          ops: ['preflight_texture'],
          includeUsage: true,
          stateDetail: 'full',
          diffDetail: 'full'
        }
      ]
    }
  );

  recorder.record('preflight_texture', {}, { ok: true, data: { ok: true } });
  recorder.record('get_project_state', { detail: 'summary' }, { ok: true, data: { ok: true } });

  const parsed = parseTraceLogText(store.getText());
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    const detailed = parsed.records.find((record) => record.kind === 'step' && record.op === 'preflight_texture');
    const summary = parsed.records.find((record) => record.kind === 'step' && record.op === 'get_project_state');
    assert.ok(detailed && detailed.kind === 'step');
    assert.ok(summary && summary.kind === 'step');
    if (detailed && detailed.kind === 'step') {
      const state = detailed.state as Record<string, unknown> | undefined;
      assert.ok(state && Array.isArray(state.textures));
      assert.ok(state && state.textureUsage);
    }
    if (summary && summary.kind === 'step') {
      const state = summary.state as Record<string, unknown> | undefined;
      assert.ok(state && !('textures' in state));
    }
  }
}

// Flush scheduler writes after N entries.
{
  const store = new TraceLogStore({ autoFlush: false, maxEntries: 10 });
  const writer = new InMemoryTraceLogWriter();
  const scheduler = new TraceLogFlushScheduler({
    store,
    writer,
    policy: { flushEvery: 2 }
  });

  appendStep(store, 1, 'one');
  scheduler.recorded();
  assert.equal(writer.getText().length, 0);

  appendStep(store, 2, 'two');
  scheduler.recorded();
  assert.ok(writer.getText().length > 0);
}



