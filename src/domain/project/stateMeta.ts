import type { ProjectDiff, ProjectState, ProjectStateDetail, ToolError } from '@ashfox/contracts/types/internal';

type ResultLike<T> = { ok: true; value: T } | { ok: false; error: ToolError };

export type StateMetaDeps = {
  getProjectState: (payload: { detail: ProjectStateDetail }) => ResultLike<{ project: ProjectState }>;
  getProjectDiff: (payload: { sinceRevision: string; detail?: ProjectStateDetail }) => ResultLike<{ diff: ProjectDiff }>;
};

export type StateMetaOptions = {
  includeState: boolean;
  includeDiff: boolean;
  diffDetail: ProjectStateDetail;
  ifRevision?: string;
  includeRevision?: boolean;
};

export type StateMeta = {
  state?: ProjectState | null;
  diff?: ProjectDiff | null;
  revision?: string;
};

export const buildStateMeta = (deps: StateMetaDeps, options: StateMetaOptions): StateMeta => {
  const includeRevision = options.includeRevision ?? true;
  if (!options.includeState && !options.includeDiff && !includeRevision) return {};

  const stateRes = deps.getProjectState({ detail: 'summary' });
  const project = stateRes.ok ? stateRes.value.project : null;
  const revision = project?.revision;

  let diffValue: ProjectDiff | null | undefined;
  if (options.includeDiff) {
    if (options.ifRevision) {
      const diffRes = deps.getProjectDiff({ sinceRevision: options.ifRevision, detail: options.diffDetail });
      diffValue = diffRes.ok ? diffRes.value.diff : null;
    } else {
      diffValue = null;
    }
  }

  const meta: StateMeta = {};
  if (includeRevision && revision) meta.revision = revision;
  if (options.includeState) meta.state = project;
  if (options.includeDiff) meta.diff = diffValue ?? null;
  return meta;
};




