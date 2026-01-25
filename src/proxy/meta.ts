import { ProjectStateDetail, ToolError, ToolResponse } from '../types';
import { ToolService } from '../usecases/ToolService';
import { decideRevision } from '../services/revisionGuard';
import { errFromDomain } from '../services/toolResponse';

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

export const withErrorMeta = <T = unknown>(
  error: ToolError,
  meta: MetaOptions,
  service: ToolService
): ToolResponse<T> => {
  const extra = buildMeta(meta, service);
  if (Object.keys(extra).length === 0) return errFromDomain(error);
  const details = { ...(error.details ?? {}), ...extra };
  return errFromDomain({ ...error, details });
};

export const guardRevision = (
  service: ToolService,
  expected: string | undefined,
  meta: MetaOptions
): ToolResponse<unknown> | null => {
  const serviceWithRevision = service as {
    isRevisionRequired?: () => boolean;
    isAutoRetryRevisionEnabled?: () => boolean;
    getProjectState?: ToolService['getProjectState'];
  };
  const requiresRevision =
    typeof serviceWithRevision.isRevisionRequired === 'function' ? service.isRevisionRequired() : false;
  if (!requiresRevision) return null;
  const allowAutoRetry =
    typeof serviceWithRevision.isAutoRetryRevisionEnabled === 'function'
      ? service.isAutoRetryRevisionEnabled()
      : false;
  if (typeof serviceWithRevision.getProjectState !== 'function') return null;
  const decision = decideRevision(expected, {
    requiresRevision,
    allowAutoRetry,
    getProjectState: () => service.getProjectState({ detail: 'summary' })
  });
  if (!decision.ok) return withErrorMeta(decision.error, meta, service);
  if (decision.action === 'retry') {
    meta.ifRevision = decision.currentRevision;
    return null;
  }
  return null;
};
