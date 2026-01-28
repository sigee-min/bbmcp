import type { ProjectState, ProjectStateDetail, ToolResponse } from '../types';
import type { ToolService } from '../usecases/ToolService';
import type { MetaOptions } from './meta';
import { isUsecaseError, usecaseError } from './guardHelpers';

export const loadProjectState = (
  service: ToolService,
  meta: MetaOptions,
  detail: ProjectStateDetail,
  options?: { includeUsage?: boolean }
): ToolResponse<ProjectState> => {
  const stateRes = service.getProjectState({ detail, includeUsage: options?.includeUsage });
  if (isUsecaseError(stateRes)) return usecaseError(stateRes, meta, service);
  return { ok: true, data: stateRes.value.project };
};
