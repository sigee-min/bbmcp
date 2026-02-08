import type { ToolError } from '@ashfox/contracts/types/internal';
import { RevisionStore } from '../domain/revision/revisionStore';
import { ProjectStateBuilder } from '../domain/project/projectStateBuilder';
import { decideRevisionMatch } from './revision/revisionCompare';
import type { PolicyContextLike, RevisionContextLike, SnapshotContextLike } from './contextTypes';
import type { ProjectSession } from '../session';

export interface RevisionContextDeps {
  revisionStore: RevisionStore;
  projectState: ProjectStateBuilder;
  snapshotContext: SnapshotContextLike<ReturnType<ProjectSession['snapshot']>>;
  policyContext: PolicyContextLike;
}

export class RevisionContext implements RevisionContextLike {
  private readonly revisionStore: RevisionStore;
  private readonly projectState: ProjectStateBuilder;
  private readonly snapshotContext: SnapshotContextLike<ReturnType<ProjectSession['snapshot']>>;
  private readonly policyContext: PolicyContextLike;
  private revisionBypassDepth = 0;

  constructor(deps: RevisionContextDeps) {
    this.revisionStore = deps.revisionStore;
    this.projectState = deps.projectState;
    this.snapshotContext = deps.snapshotContext;
    this.policyContext = deps.policyContext;
  }

  ensureRevisionMatch(expected?: string): ToolError | null {
    if (!this.policyContext.isRevisionRequired()) return null;
    if (this.revisionBypassDepth > 0) return null;
    const snapshot = this.snapshotContext.getSnapshot();
    const hasProject = Boolean(this.projectState.toProjectInfo(snapshot));
    const currentRevision = this.revisionStore.track(snapshot);
    const decision = decideRevisionMatch({
      requiresRevision: true,
      allowAutoRetry: false,
      expected,
      currentRevision,
      active: hasProject
    });
    return decision.ok ? null : decision.error;
  }

  runWithoutRevisionGuard<T>(fn: () => T): T {
    this.revisionBypassDepth += 1;
    try {
      return fn();
    } finally {
      this.revisionBypassDepth = Math.max(0, this.revisionBypassDepth - 1);
    }
  }

  async runWithoutRevisionGuardAsync<T>(fn: () => Promise<T> | T): Promise<T> {
    this.revisionBypassDepth += 1;
    try {
      return await fn();
    } finally {
      this.revisionBypassDepth = Math.max(0, this.revisionBypassDepth - 1);
    }
  }
}





