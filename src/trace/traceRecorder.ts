import type { ProjectDiff, ProjectState, ProjectStateDetail, ToolError, ToolResponse } from '../types';
import type { TraceLogEntry, TraceLogHeader } from '../types/traceLog';
import type { UsecaseResult } from '../usecases/result';
import { summarizeProjectDiff, summarizeProjectState, sanitizeTraceValue, sanitizeToolResponse } from './traceLogFormat';
import { TraceLogStore } from './traceLogStore';
import type { TraceLogWriter } from '../ports/traceLog';

export type TraceRecorderDeps = {
  getProjectState: (payload: { detail: ProjectStateDetail; includeUsage?: boolean }) => UsecaseResult<{ project: ProjectState }>;
  getProjectDiff: (payload: { sinceRevision: string; detail?: ProjectStateDetail }) => UsecaseResult<{ diff: ProjectDiff }>;
};

export type TraceRecorderOptions = {
  enabled?: boolean;
  includeState?: boolean;
  includeDiff?: boolean;
  stateDetail?: ProjectStateDetail;
  diffDetail?: ProjectStateDetail;
  includeUsage?: boolean;
  pluginVersion?: string;
  blockbenchVersion?: string;
  detailRules?: TraceLogDetailRule[];
  onRecord?: () => void;
};

export type TraceLogDetailRule = {
  ops: string[];
  includeState?: boolean;
  includeDiff?: boolean;
  includeUsage?: boolean;
  stateDetail?: ProjectStateDetail;
  diffDetail?: ProjectStateDetail;
};

export class TraceRecorder {
  private readonly deps: TraceRecorderDeps;
  private readonly store: TraceLogStore;
  private enabled: boolean;
  private includeState: boolean;
  private includeDiff: boolean;
  private stateDetail: ProjectStateDetail;
  private diffDetail: ProjectStateDetail;
  private includeUsage: boolean;
  private pluginVersion?: string;
  private blockbenchVersion?: string;
  private detailRules: TraceLogDetailRule[];
  private onRecord?: () => void;
  private seq = 0;
  private lastRevision: string | null = null;
  private headerWritten = false;

  constructor(deps: TraceRecorderDeps, store: TraceLogStore, options: TraceRecorderOptions = {}) {
    this.deps = deps;
    this.store = store;
    this.enabled = options.enabled !== false;
    this.includeState = options.includeState !== false;
    this.includeDiff = options.includeDiff !== false;
    this.stateDetail = options.stateDetail ?? 'summary';
    this.diffDetail = options.diffDetail ?? 'summary';
    this.includeUsage = options.includeUsage === true;
    this.pluginVersion = options.pluginVersion;
    this.blockbenchVersion = options.blockbenchVersion;
    this.detailRules = options.detailRules ?? [];
    this.onRecord = options.onRecord;
  }

  update(options: Partial<TraceRecorderOptions>): void {
    if (options.enabled !== undefined) this.enabled = options.enabled;
    if (options.includeState !== undefined) this.includeState = options.includeState;
    if (options.includeDiff !== undefined) this.includeDiff = options.includeDiff;
    if (options.stateDetail) this.stateDetail = options.stateDetail;
    if (options.diffDetail) this.diffDetail = options.diffDetail;
    if (options.includeUsage !== undefined) this.includeUsage = options.includeUsage;
    if (options.pluginVersion !== undefined) this.pluginVersion = options.pluginVersion;
    if (options.blockbenchVersion !== undefined) this.blockbenchVersion = options.blockbenchVersion;
    if (options.detailRules !== undefined) this.detailRules = options.detailRules;
    if (options.onRecord !== undefined) this.onRecord = options.onRecord;
  }

  record(op: string, payload: unknown, response: ToolResponse<unknown>): void {
    if (!this.enabled) return;
    if (!this.headerWritten) {
      const header = this.buildHeader();
      this.store.append(header);
      this.headerWritten = true;
    }

    const entry: TraceLogEntry = {
      kind: 'step',
      seq: ++this.seq,
      ts: new Date().toISOString(),
      route: 'tool',
      op,
      payload: sanitizeTraceValue(payload),
      response: sanitizeToolResponse(response)
    };

    const detail = this.resolveDetail(op);
    const includeState = detail.includeState ?? this.includeState;
    const includeDiff = detail.includeDiff ?? this.includeDiff;
    const stateDetail = detail.stateDetail ?? this.stateDetail;
    const diffDetail = detail.diffDetail ?? this.diffDetail;
    const includeUsage = detail.includeUsage ?? this.includeUsage;

    const previousRevision = this.lastRevision;
    const stateResult = includeState ? this.readState(stateDetail, includeUsage) : null;
    if (stateResult?.ok) {
      entry.state = stateDetail === 'full' ? stateResult.state : summarizeProjectState(stateResult.state);
      this.lastRevision = stateResult.state.revision;
    } else if (stateResult && !stateResult.ok) {
      entry.stateError = stateResult.error;
    }

    if (includeDiff && previousRevision && stateResult?.ok && previousRevision !== stateResult.state.revision) {
      const diffResult = this.readDiff(previousRevision, diffDetail);
      if (diffResult.ok) {
        entry.diff = diffDetail === 'full' ? diffResult.diff : summarizeProjectDiff(diffResult.diff);
      } else {
        entry.diffError = diffResult.error;
      }
    }

    this.store.append(entry);
    this.onRecord?.();
  }

  flush(): void {
    this.store.flush();
  }

  flushTo(writer?: TraceLogWriter | null): void {
    this.store.flush(writer ?? null);
  }

  getText(): string {
    return this.store.getText();
  }

  private readState(
    detail: ProjectStateDetail,
    includeUsage: boolean
  ): { ok: true; state: ProjectState } | { ok: false; error: ToolError } {
    const result = this.deps.getProjectState({ detail, includeUsage });
    if (result.ok) return { ok: true, state: result.value.project };
    return { ok: false, error: result.error };
  }

  private readDiff(
    sinceRevision: string,
    detail: ProjectStateDetail
  ): { ok: true; diff: ProjectDiff } | { ok: false; error: ToolError } {
    const result = this.deps.getProjectDiff({ sinceRevision, detail });
    if (result.ok) return { ok: true, diff: result.value.diff };
    return { ok: false, error: result.error };
  }

  private buildHeader(): TraceLogHeader {
    const detailUsage = this.detailRules.some((rule) => rule.includeUsage === true);
    return {
      kind: 'header',
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      ...(this.pluginVersion ? { pluginVersion: this.pluginVersion } : {}),
      ...(this.blockbenchVersion ? { blockbenchVersion: this.blockbenchVersion } : {}),
      ...(this.includeUsage || detailUsage ? { notes: ['state includes textureUsage'] } : {})
    };
  }

  private resolveDetail(op: string): Partial<TraceLogDetailRule> {
    for (const rule of this.detailRules) {
      if (rule.ops.includes(op)) return rule;
    }
    return {};
  }
}




