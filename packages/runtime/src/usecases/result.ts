import { ToolError } from '@ashfox/contracts/types/internal';
import { applyToolErrorPolicy } from '../shared/tooling/toolError';

export type UsecaseResult<T> = { ok: true; value: T } | { ok: false; error: ToolError };

export const ok = <T>(value: T): UsecaseResult<T> => ({ ok: true, value });
export const fail = (error: ToolError): UsecaseResult<never> => ({ ok: false, error: applyToolErrorPolicy(error) });




