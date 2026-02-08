import type { ProjectDiff, ProjectState, ProjectStateDetail, ToolError } from '@ashfox/contracts/types/internal';
import { buildStateMeta } from '../../domain/project/stateMeta';

type ResultLike<T> = { ok: true; value: T } | { ok: false; error: ToolError };

export type ResponseMetaDeps = {
  getProjectState: (payload: { detail: ProjectStateDetail }) => ResultLike<{ project: ProjectState }>;
  getProjectDiff: (payload: { sinceRevision: string; detail?: ProjectStateDetail }) => ResultLike<{ diff: ProjectDiff }>;
};

export type ResponseMetaOptions = {
  includeState: boolean;
  includeDiff: boolean;
  diffDetail: ProjectStateDetail;
  ifRevision?: string;
  includeRevision?: boolean;
};

export const buildResponseMeta = (deps: ResponseMetaDeps, options: ResponseMetaOptions) =>
  buildStateMeta(
    {
      getProjectState: deps.getProjectState,
      getProjectDiff: deps.getProjectDiff
    },
    {
      includeState: options.includeState,
      includeDiff: options.includeDiff,
      diffDetail: options.diffDetail,
      ifRevision: options.ifRevision,
      includeRevision: options.includeRevision ?? true
    }
  );

