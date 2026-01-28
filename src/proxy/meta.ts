import { ProjectStateDetail, ToolError, ToolErrorResponse, ToolResponse } from '../types';
import { ToolService } from '../usecases/ToolService';
import { decideRevision } from '../services/revisionGuard';
import { errFromDomain } from '../services/toolResponse';
import { buildStateMeta } from '../services/stateMeta';

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
  return buildStateMeta(
    {
      getProjectState: (payload) => service.getProjectState(payload),
      getProjectDiff: (payload) => service.getProjectDiff(payload)
    },
    {
      includeState: meta.includeState,
      includeDiff: meta.includeDiff,
      diffDetail: meta.diffDetail,
      ifRevision: meta.ifRevision,
      includeRevision: true
    }
  );
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
): ToolErrorResponse => {
  const extra = buildMeta(meta, service);
  if (Object.keys(extra).length === 0) return errFromDomain(error);
  const details = { ...(error.details ?? {}), ...extra };
  return errFromDomain({ ...error, details });
};

export const guardRevision = (
  service: ToolService,
  expected: string | undefined,
  meta: MetaOptions
): ToolResponse<never> | null => {
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
