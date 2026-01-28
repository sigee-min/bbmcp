import type { ToolErrorCode } from '../types';

export {
  err,
  errFromDomain,
  errWithCode,
  toToolResponse
} from '../services/toolResponse';

export type ErrorCode = ToolErrorCode;
