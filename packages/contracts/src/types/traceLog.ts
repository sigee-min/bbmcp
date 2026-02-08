import type { ProjectDiff, ProjectDiffCountsByKind, ProjectState } from './project';
import type { FormatKind, ToolError } from './shared';

export type TraceLogRoute = 'tool';

export type TraceLogHeader = {
  kind: 'header';
  schemaVersion: number;
  createdAt: string;
  pluginVersion?: string;
  blockbenchVersion?: string;
  notes?: string[];
};

export type TraceLogStateSummary = {
  id: string;
  revision: string;
  name: string | null;
  format: FormatKind | null;
  formatId?: string | null;
  textureResolution?: { width: number; height: number };
  counts: ProjectState['counts'];
};

export type TraceLogDiffSummary = {
  sinceRevision: string;
  currentRevision: string;
  baseMissing?: boolean;
  counts: ProjectDiffCountsByKind;
};

export type TraceLogResponse = {
  ok: boolean;
  data?: unknown;
  error?: ToolError;
};

export type TraceLogEntry = {
  kind: 'step';
  seq: number;
  ts: string;
  route: TraceLogRoute;
  op: string;
  payload?: unknown;
  response: TraceLogResponse;
  state?: TraceLogStateSummary | ProjectState;
  diff?: TraceLogDiffSummary | ProjectDiff;
  stateError?: ToolError;
  diffError?: ToolError;
};

export type TraceLogRecord = TraceLogHeader | TraceLogEntry;

export type TraceLogReportOpSummary = {
  count: number;
  errors: number;
};

export type TraceLogReport = {
  schemaVersion: number;
  generatedAt: string;
  steps: number;
  errors: number;
  routes: { tool: number };
  ops: Record<string, TraceLogReportOpSummary>;
  firstTs?: string;
  lastTs?: string;
  diffCounts?: ProjectDiff['counts'];
  lastError?: { seq: number; op: string; code: string; message: string };
  warnings?: string[];
};
