import type { ToolError } from '../types';
import { RevisionStore } from '../services/revision';
import { ProjectStateService } from '../services/projectState';
import { PolicyContext } from './PolicyContext';
import { SnapshotContext } from './SnapshotContext';

export interface RevisionContextDeps {
  revisionStore: RevisionStore;
  projectState: ProjectStateService;
  snapshotContext: SnapshotContext;
  policyContext: PolicyContext;
}

export class RevisionContext {
  private readonly revisionStore: RevisionStore;
  private readonly projectState: ProjectStateService;
  private readonly snapshotContext: SnapshotContext;
  private readonly policyContext: PolicyContext;
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
    if (!expected) {
      return {
        code: 'invalid_state',
        message: 'ifRevision is required. Call get_project_state before mutating.',
        fix: 'Call get_project_state and retry with ifRevision set to the returned revision.',
        details: { reason: 'missing_ifRevision', currentRevision, active: hasProject }
      };
    }
    if (currentRevision !== expected) {
      if (this.policyContext.isAutoRetryRevisionEnabled()) {
        return null;
      }
      return {
        code: 'invalid_state',
        message: 'Project revision mismatch. Refresh project state before retrying.',
        fix: 'Call get_project_state and retry with the latest revision.',
        details: { expected, currentRevision }
      };
    }
    return null;
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
