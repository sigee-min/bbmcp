import type { ProjectState, ToolError } from '@ashfox/contracts/types/internal';
import { decideRevisionMatch } from './revisionCompare';

type Result<T> = { ok: true; value: T } | { ok: false; error: ToolError };

export type RevisionGuardDeps = {
  requiresRevision: boolean;
  allowAutoRetry: boolean;
  getProjectState: () => Result<{ project: ProjectState }>;
};

export type RevisionDecision =
  | { ok: true; action: 'proceed' | 'retry'; currentRevision: string; project: ProjectState }
  | { ok: true; action: 'proceed'; currentRevision?: string; project?: ProjectState }
  | { ok: false; error: ToolError };

export const decideRevision = (
  expected: string | undefined,
  deps: RevisionGuardDeps
): RevisionDecision => {
  if (!deps.requiresRevision) {
    return { ok: true, action: 'proceed' };
  }
  const state = deps.getProjectState();
  if (!state.ok) {
    return { ok: false, error: state.error };
  }
  const project = state.value.project;
  const currentRevision = project.revision;
  const decision = decideRevisionMatch({
    requiresRevision: deps.requiresRevision,
    allowAutoRetry: deps.allowAutoRetry,
    expected,
    currentRevision,
    active: project.active
  });
  if (!decision.ok) return decision;
  if (decision.action === 'retry') {
    return { ok: true, action: 'retry', currentRevision: decision.currentRevision, project };
  }
  return { ok: true, action: 'proceed', currentRevision, project };
};




