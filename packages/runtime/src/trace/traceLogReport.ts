import type { ProjectDiffCounts, ProjectDiffCountsByKind } from '../types/project';
import type { TraceLogEntry, TraceLogRecord, TraceLogReport } from '@ashfox/contracts/types/traceLog';
import { parseTraceLogText } from './traceLogReplay';

const emptyCounts = (): ProjectDiffCounts => ({ added: 0, removed: 0, changed: 0 });

const emptyCountsByKind = (): ProjectDiffCountsByKind => ({
  bones: emptyCounts(),
  cubes: emptyCounts(),
  textures: emptyCounts(),
  animations: emptyCounts()
});

const addCounts = (target: ProjectDiffCounts, value: ProjectDiffCounts): ProjectDiffCounts => ({
  added: target.added + value.added,
  removed: target.removed + value.removed,
  changed: target.changed + value.changed
});

const addCountsByKind = (target: ProjectDiffCountsByKind, value: ProjectDiffCountsByKind): ProjectDiffCountsByKind => ({
  bones: addCounts(target.bones, value.bones),
  cubes: addCounts(target.cubes, value.cubes),
  textures: addCounts(target.textures, value.textures),
  animations: addCounts(target.animations, value.animations)
});

const isTraceLogEntry = (record: TraceLogRecord): record is TraceLogEntry => record.kind === 'step';

export const buildTraceLogReport = (text: string): TraceLogReport => {
  const parsed = parseTraceLogText(text);
  const generatedAt = new Date().toISOString();
  if (!parsed.ok) {
    return {
      schemaVersion: 1,
      generatedAt,
      steps: 0,
      errors: 1,
      routes: { tool: 0 },
      ops: {},
      warnings: parsed.warnings ?? [],
      lastError: {
        seq: 0,
        op: 'parse',
        code: parsed.error.code,
        message: parsed.error.message
      }
    };
  }

  const steps = parsed.records.filter(isTraceLogEntry);
  const report: TraceLogReport = {
    schemaVersion: 1,
    generatedAt,
    steps: steps.length,
    errors: 0,
    routes: { tool: 0 },
    ops: {},
    diffCounts: emptyCountsByKind()
  };

  steps.forEach((entry) => {
    report.routes.tool += 1;
    const opSummary = report.ops[entry.op] ?? { count: 0, errors: 0 };
    opSummary.count += 1;
    if (!entry.response.ok) {
      opSummary.errors += 1;
      report.errors += 1;
      report.lastError = {
        seq: entry.seq,
        op: entry.op,
        code: entry.response.error?.code ?? 'unknown',
        message: entry.response.error?.message ?? 'unknown error'
      };
    }
    report.ops[entry.op] = opSummary;
    if (entry.diff && report.diffCounts) {
      report.diffCounts = addCountsByKind(report.diffCounts, entry.diff.counts);
    }
    if (!report.firstTs || entry.ts < report.firstTs) report.firstTs = entry.ts;
    if (!report.lastTs || entry.ts > report.lastTs) report.lastTs = entry.ts;
  });

  if (parsed.warnings?.length) report.warnings = parsed.warnings;
  return report;
};




