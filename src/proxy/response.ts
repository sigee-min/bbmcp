import { ToolResponse } from '../types';
import { UsecaseResult } from '../usecases/result';

export type ErrorCode = 'invalid_payload' | 'not_implemented' | 'no_change' | 'unknown';

export const err = <T = never>(code: ErrorCode, message: string): ToolResponse<T> => ({
  ok: false,
  error: { code, message }
});

export const toToolResponse = <T>(result: UsecaseResult<T>): ToolResponse<T> => {
  if (result.ok) return { ok: true, data: result.value };
  return { ok: false, error: result.error };
};
