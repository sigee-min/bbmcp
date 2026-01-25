import type { UsecaseResult } from '../usecases/result';
import type { ToolError, ToolErrorCode, ToolResponse } from '../types';
import { applyToolErrorPolicy } from './toolError';

export const toolError = (
  code: ToolErrorCode,
  message: string,
  details?: Record<string, unknown>,
  fix?: string
): ToolError => applyToolErrorPolicy({ code, message, ...(details ? { details } : {}), ...(fix ? { fix } : {}) });

export const err = <T = never>(
  code: ToolErrorCode,
  message: string,
  details?: Record<string, unknown>,
  fix?: string
): ToolResponse<T> => ({
  ok: false,
  error: toolError(code, message, details, fix)
});

export const errFromDomain = <T = never>(error: ToolError): ToolResponse<T> => ({
  ok: false,
  error: applyToolErrorPolicy(error)
});

export const toToolResponse = <T>(result: UsecaseResult<T>): ToolResponse<T> => {
  if (result.ok) return { ok: true, data: result.value };
  return { ok: false, error: result.error };
};
