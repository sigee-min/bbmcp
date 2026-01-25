import type { ToolErrorCode, ToolResponse } from '../types';
import { err, errFromDomain, toToolResponse } from '../services/toolResponse';

export type ErrorCode = ToolErrorCode;

export { err, errFromDomain };

export const errWithCode = <T = never>(
  code: ToolErrorCode,
  message: string,
  details?: Record<string, unknown>
): ToolResponse<T> => err(code, message, details);

export { toToolResponse };
