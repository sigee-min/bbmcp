import type { ToolErrorCode, ToolName, ToolPayloadMap, ToolResponse, ToolResultMap } from '@ashfox/contracts/types/internal';
import { err } from '../shared/tooling/toolResponse';

export const respondOk = <T>(data: T): ToolResponse<T> => ({ ok: true, data });

export const respondErrorSimple = (
  code: ToolErrorCode,
  message: string,
  details?: Record<string, unknown>
): ToolResponse<never> => err(code, message, details);

export type HandlerPayload = ToolPayloadMap[ToolName];
export type HandlerResult = ToolResultMap[ToolName];
export type HandlerResponse = ToolResponse<HandlerResult> | Promise<ToolResponse<HandlerResult>>;
export type Handler = {
  bivarianceHack(payload: HandlerPayload): HandlerResponse;
}['bivarianceHack'];

