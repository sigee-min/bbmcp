import type { ToolError } from '../types';
import { ProjectSession } from '../session';
import type { SnapshotPort } from '../ports/snapshot';
import { ProjectStateBuilder } from '../domain/project/projectStateBuilder';
import type { SnapshotPolicy } from './policies';
import type { PolicyContextLike, SnapshotContextLike } from './contextTypes';
import { mergeSnapshots } from '../domain/project/snapshotMerge';

export interface SnapshotContextDeps {
  session: ProjectSession;
  snapshotPort: SnapshotPort;
  projectState: ProjectStateBuilder;
  policyContext: PolicyContextLike;
}

export class SnapshotContext implements SnapshotContextLike<ReturnType<ProjectSession['snapshot']>> {
  private readonly session: ProjectSession;
  private readonly snapshotPort: SnapshotPort;
  private readonly projectState: ProjectStateBuilder;
  private readonly policyContext: PolicyContextLike;

  constructor(deps: SnapshotContextDeps) {
    this.session = deps.session;
    this.snapshotPort = deps.snapshotPort;
    this.projectState = deps.projectState;
    this.policyContext = deps.policyContext;
  }

  getSnapshot(policy: SnapshotPolicy = this.policyContext.getSnapshotPolicy()) {
    const sessionSnapshot = this.session.snapshot();
    if (policy === 'session') return this.projectState.normalize(sessionSnapshot);
    const live = this.snapshotPort.readSnapshot();
    if (!live) {
      return this.projectState.normalize(sessionSnapshot);
    }
    const merged =
      policy === 'live'
        ? { ...live, animationTimePolicy: sessionSnapshot.animationTimePolicy }
        : mergeSnapshots(sessionSnapshot, live);
    return this.projectState.normalize(merged);
  }

  ensureActive(): ToolError | null {
    const stateError = this.session.ensureActive();
    if (!stateError) return null;
    if (!this.policyContext.getAutoAttachActiveProject()) {
      return {
        ...stateError,
        fix: 'Use ensure_project to create or reuse an active project before mutating.'
      };
    }
    const live = this.snapshotPort.readSnapshot();
    if (!live) {
      return {
        ...stateError,
        fix: 'Use ensure_project to create or reuse an active project before mutating.'
      };
    }
    const merged = mergeSnapshots(this.session.snapshot(), live);
    const normalized = this.projectState.normalize(merged);
    if (!this.projectState.toProjectInfo(normalized) || !normalized.format) {
      return {
        ...stateError,
        fix: 'Use ensure_project to create or reuse an active project before mutating.'
      };
    }
    const attachRes = this.session.attach(normalized);
    return attachRes.ok
      ? null
      : {
          ...attachRes.error,
          fix: 'Call get_project_state and retry, or create a new project.'
        };
  }
}



