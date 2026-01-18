import { ToolResponse } from '../types';
import { UsecaseResult } from '../usecases/result';

export type ErrorCode = 'invalid_payload' | 'not_implemented' | 'unknown';

export const err = (code: ErrorCode, message: string): ToolResponse<unknown> => ({
  ok: false,
  error: { code, message }
});

export const toToolResponse = <T>(result: UsecaseResult<T>): ToolResponse<T> => {
  if (result.ok) return { ok: true, data: result.value };
  return { ok: false, error: result.error };
};
