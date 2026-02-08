import type { ToolError, ToolErrorCode } from '@ashfox/contracts/types/internal';

export type DomainErrorCode = ToolErrorCode;

export type DomainError = ToolError;

export type DomainResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: DomainError };

export const ok = <T>(data: T): DomainResult<T> => ({ ok: true, data });

export const fail = <T = never>(
  code: DomainErrorCode,
  message: string,
  details?: Record<string, unknown>,
  fix?: string
): DomainResult<T> => ({
  ok: false,
  error: { code, message, ...(details ? { details } : {}), ...(fix ? { fix } : {}) }
});



