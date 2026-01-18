import { ProjectStateDetail, ToolError, ToolResponse } from '../types';
import { ToolService } from '../usecases/ToolService';

export type MetaOptions = {
  includeState: boolean;
  includeDiff: boolean;
  diffDetail: ProjectStateDetail;
  ifRevision?: string;
};

export const resolveIncludeState = (flag: boolean | undefined, fallback: () => boolean): boolean => {
  if (flag !== undefined) return flag;
  return fallback();
};

export const resolveIncludeDiff = (flag: boolean | undefined, fallback: () => boolean): boolean => {
  if (flag !== undefined) return flag;
  return fallback();
};

export const resolveDiffDetail = (detail: ProjectStateDetail | undefined): ProjectStateDetail => detail ?? 'summary';

export const buildMeta = (meta: MetaOptions, service: ToolService): Record<string, unknown> => {
  const details: Record<string, unknown> = {};
  const state = service.getProjectState({ detail: 'summary' });
  const project = state.ok ? state.value.project : null;
  if (project?.revision) {
    details.revision = project.revision;
  }
  if (meta.includeState) {
    details.state = project;
  }
  if (meta.includeDiff) {
    if (meta.ifRevision) {
      const diff = service.getProjectDiff({ sinceRevision: meta.ifRevision, detail: meta.diffDetail });
      details.diff = diff.ok ? diff.value.diff : null;
    } else {
      details.diff = null;
    }
  }
  return details;
};

export const withMeta = <T extends Record<string, unknown>>(
  data: T,
  meta: MetaOptions,
  service: ToolService
): T & { state?: unknown; diff?: unknown; revision?: string } => {
  const extra = buildMeta(meta, service);
  if (Object.keys(extra).length === 0) return data;
  return {
    ...data,
    ...extra
  };
};

export const withErrorMeta = (
  error: ToolError,
  meta: MetaOptions,
  service: ToolService
): ToolResponse<unknown> => {
  const extra = buildMeta(meta, service);
  if (Object.keys(extra).length === 0) return { ok: false, error };
  const details = { ...(error.details ?? {}), ...extra };
  return { ok: false, error: { ...error, details } };
};

export const guardRevision = (
  service: ToolService,
  expected: string | undefined,
  meta: MetaOptions
): ToolResponse<unknown> | null => {
  const serviceWithRevision = service as {
    isRevisionRequired?: () => boolean;
    getProjectState?: ToolService['getProjectState'];
  };
  const requiresRevision =
    typeof serviceWithRevision.isRevisionRequired === 'function' ? service.isRevisionRequired() : false;
  if (!requiresRevision) return null;
  if (typeof serviceWithRevision.getProjectState !== 'function') return null;
  const state = service.getProjectState({ detail: 'summary' });
  if (!expected) {
    if (!state.ok) return null;
    return withErrorMeta(
      {
        code: 'invalid_state',
        message: 'ifRevision is required. Call get_project_state before mutating.',
        details: { reason: 'missing_ifRevision' }
      },
      meta,
      service
    );
  }
  if (!state.ok) return withErrorMeta(state.error, meta, service);
  const currentRevision = state.value.project.revision;
  if (currentRevision !== expected) {
    return withErrorMeta(
      {
        code: 'invalid_state',
        message: 'Project revision mismatch. Refresh project state before retrying.',
        details: { expected, currentRevision }
      },
      meta,
      service
    );
  }
  return null;
};
