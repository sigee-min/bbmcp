import type { ToolResponse } from '../types';
import type { ToolService } from '../usecases/ToolService';
import type { UsecaseResult } from '../usecases/result';
import { guardOptionalRevision } from '../services/optionalRevision';
import { toToolResponse } from '../services/toolResponse';

export const runWithOptionalRevision = <T>(
  service: ToolService,
  payload: { ifRevision?: string } | undefined,
  fn: () => ToolResponse<T>
): ToolResponse<T> => {
  const guard = guardOptionalRevision(service, payload);
  if (guard) return guard;
  return fn();
};

export const runUsecaseWithOptionalRevision = <T>(
  service: ToolService,
  payload: { ifRevision?: string } | undefined,
  fn: () => UsecaseResult<T>
): ToolResponse<T> => {
  const guard = guardOptionalRevision(service, payload);
  if (guard) return guard;
  return toToolResponse(fn());
};
