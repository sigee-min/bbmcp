import type { ToolError, ToolErrorResponse, ToolResponse } from '../types';
import type { ToolService } from '../usecases/ToolService';
import type { UsecaseResult } from '../usecases/result';
import type { MetaOptions } from './meta';
import { withErrorMeta } from './meta';

export const isUsecaseError = <T>(result: UsecaseResult<T>): result is { ok: false; error: ToolError } =>
  !result.ok;

export const isResponseError = <T>(response: ToolResponse<T>): response is ToolErrorResponse => !response.ok;

export const usecaseError = (
  result: { ok: false; error: ToolError },
  meta: MetaOptions,
  service: ToolService
): ToolErrorResponse => withErrorMeta(result.error, meta, service);

export const errorWithMeta = (error: ToolError, meta: MetaOptions, service: ToolService): ToolErrorResponse =>
  withErrorMeta(error, meta, service);
