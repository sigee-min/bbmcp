import type { ProjectDiff, ProjectState, ProjectStateDetail, ToolError, ToolResponse, WithState } from '../types';
import { buildStateMeta } from './stateMeta';

type ResultLike<T> = { ok: true; value: T } | { ok: false; error: ToolError };

export type StateAttachmentDeps = {
  includeStateByDefault: () => boolean;
  includeDiffByDefault: () => boolean;
  getProjectState: (payload: { detail: ProjectStateDetail }) => ResultLike<{ project: ProjectState }>;
  getProjectDiff: (payload: { sinceRevision: string; detail?: ProjectStateDetail }) => ResultLike<{ diff: ProjectDiff }>;
};

type StatePayload = {
  includeState?: boolean;
  includeDiff?: boolean;
  diffDetail?: ProjectStateDetail;
  ifRevision?: string;
};

export const attachStateToResponse = <TPayload extends StatePayload, TResult>(
  deps: StateAttachmentDeps,
  payload: TPayload,
  response: ToolResponse<TResult>
): ToolResponse<WithState<TResult>> => {
  const shouldIncludeState = payload?.includeState ?? deps.includeStateByDefault();
  const shouldIncludeDiff = payload?.includeDiff ?? deps.includeDiffByDefault();
  const shouldIncludeRevision = true;
  const meta = buildStateMeta(
    {
      getProjectState: deps.getProjectState,
      getProjectDiff: deps.getProjectDiff
    },
    {
      includeState: shouldIncludeState,
      includeDiff: shouldIncludeDiff,
      diffDetail: payload?.diffDetail ?? 'summary',
      ifRevision: payload?.ifRevision,
      includeRevision: shouldIncludeRevision
    }
  );
  const project = meta.state ?? null;
  const revision = meta.revision;
  const diffValue = meta.diff;
  if (response.ok) {
    return {
      ok: true,
      ...(response.content ? { content: response.content } : {}),
      ...(response.structuredContent ? { structuredContent: response.structuredContent } : {}),
      data: {
        ...(response.data as Record<string, unknown>),
        ...(shouldIncludeRevision && revision ? { revision } : {}),
        ...(shouldIncludeState ? { state: project } : {}),
        ...(shouldIncludeDiff ? { diff: diffValue ?? null } : {})
      } as WithState<TResult>
    };
  }
  const details: Record<string, unknown> = { ...(response.error.details ?? {}) };
  if (shouldIncludeRevision && revision) {
    details.revision = revision;
  }
  if (shouldIncludeState) {
    details.state = project;
  }
  if (shouldIncludeDiff) {
    details.diff = diffValue ?? null;
  }
  return {
    ok: false,
    ...(response.content ? { content: response.content } : {}),
    ...(response.structuredContent ? { structuredContent: response.structuredContent } : {}),
    error: { ...response.error, details }
  };
};
