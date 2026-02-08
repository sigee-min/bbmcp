import assert from 'node:assert/strict';

import { buildTraceLogReport } from '../src/trace/traceLogReport';

{
  const report = buildTraceLogReport('');
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.steps, 0);
  assert.equal(report.errors, 1);
  assert.equal(report.routes.tool, 0);
  assert.equal(report.lastError?.op, 'parse');
  assert.equal(report.lastError?.code, 'invalid_payload');
}

{
  const text = [
    '{"kind":"header","schemaVersion":1,"createdAt":"2026-01-01T00:00:00.000Z"}',
    'invalid json',
    '{"kind":"step","seq":1,"ts":"2026-01-01T00:00:01.000Z","route":"tool","op":"update_cube","response":{"ok":true},"diff":{"sinceRevision":"r0","currentRevision":"r1","counts":{"bones":{"added":0,"removed":0,"changed":0},"cubes":{"added":0,"removed":0,"changed":1},"textures":{"added":0,"removed":0,"changed":0},"animations":{"added":0,"removed":0,"changed":0}}}}',
    '{"kind":"step","seq":2,"ts":"2026-01-01T00:00:03.000Z","route":"tool","op":"paint_faces","response":{"ok":false,"error":{"code":"unknown","message":"boom"}},"diff":{"sinceRevision":"r1","currentRevision":"r2","counts":{"bones":{"added":0,"removed":0,"changed":0},"cubes":{"added":0,"removed":0,"changed":0},"textures":{"added":0,"removed":0,"changed":2},"animations":{"added":0,"removed":0,"changed":0}}}}'
  ].join('\n');
  const report = buildTraceLogReport(text);

  assert.equal(report.steps, 2);
  assert.equal(report.errors, 1);
  assert.equal(report.routes.tool, 2);
  assert.equal(report.ops.update_cube.count, 1);
  assert.equal(report.ops.update_cube.errors, 0);
  assert.equal(report.ops.paint_faces.count, 1);
  assert.equal(report.ops.paint_faces.errors, 1);
  assert.equal(report.firstTs, '2026-01-01T00:00:01.000Z');
  assert.equal(report.lastTs, '2026-01-01T00:00:03.000Z');
  assert.equal(report.lastError?.seq, 2);
  assert.equal(report.lastError?.op, 'paint_faces');
  assert.equal(report.lastError?.code, 'unknown');
  assert.equal(report.diffCounts?.cubes.changed, 1);
  assert.equal(report.diffCounts?.textures.changed, 2);
  assert.equal(report.warnings?.length, 1);
}

