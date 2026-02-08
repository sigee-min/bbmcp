import type { UsecaseResult } from '../../usecases/result';
import type { ToolError, ToolErrorCode, ToolErrorResponse, ToolResponse } from '@ashfox/contracts/types/internal';
import { applyToolErrorPolicy } from './toolError';

const ensureReason = (error: ToolError): ToolError => {
  const details = { ...(error.details ?? {}) } as Record<string, unknown>;
  if (typeof details.reason !== 'string' || details.reason.length === 0) {
    details.reason = error.code;
  }
  return { ...error, details };
};

export const normalizeToolError = (
  error: ToolError,
  options: { ensureReason?: boolean } = {}
): ToolError => {
  const normalized = options.ensureReason ? ensureReason(error) : error;
  return applyToolErrorPolicy(normalized);
};

export const toolError = (
  code: ToolErrorCode,
  message: string,
  details?: Record<string, unknown>,
  fix?: string
): ToolError =>
  normalizeToolError({ code, message, ...(details ? { details } : {}), ...(fix ? { fix } : {}) }, { ensureReason: true });

export const err = <T = never>(
  code: ToolErrorCode,
  message: string,
  details?: Record<string, unknown>,
  fix?: string
): ToolResponse<T> => ({
  ok: false,
  error: toolError(code, message, details, fix)
});

export const errFromDomain = (error: ToolError): ToolErrorResponse => ({
  ok: false,
  error: normalizeToolError(error, { ensureReason: true })
});

export const toToolResponse = <T>(result: UsecaseResult<T>): ToolResponse<T> => {
  if (result.ok) return { ok: true, data: result.value };
  return errFromDomain(result.error);
};




