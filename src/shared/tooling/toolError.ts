import type { ToolError, ToolErrorCode } from '../../types';
import {
  TOOL_FIX_INVALID_PAYLOAD,
  TOOL_FIX_INVALID_STATE,
  TOOL_FIX_IO_ERROR,
  TOOL_FIX_NO_CHANGE,
  TOOL_FIX_NOT_IMPLEMENTED,
  TOOL_FIX_UNKNOWN,
  TOOL_FIX_UNSUPPORTED_FORMAT,
  TOOL_HINT_INVALID_PAYLOAD,
  TOOL_HINT_INVALID_STATE,
  TOOL_HINT_IO_ERROR,
  TOOL_HINT_NO_CHANGE,
  TOOL_HINT_NOT_IMPLEMENTED,
  TOOL_HINT_UNKNOWN,
  TOOL_HINT_UNSUPPORTED_FORMAT
} from '../../shared/messages';

const DEFAULT_FIXES: Partial<Record<ToolErrorCode, string>> = {
  invalid_payload: TOOL_FIX_INVALID_PAYLOAD,
  invalid_state: TOOL_FIX_INVALID_STATE,
  not_implemented: TOOL_FIX_NOT_IMPLEMENTED,
  unsupported_format: TOOL_FIX_UNSUPPORTED_FORMAT,
  no_change: TOOL_FIX_NO_CHANGE,
  io_error: TOOL_FIX_IO_ERROR,
  unknown: TOOL_FIX_UNKNOWN
};

const DEFAULT_MESSAGE_HINTS: Partial<Record<ToolErrorCode, string>> = {
  invalid_payload: TOOL_HINT_INVALID_PAYLOAD,
  invalid_state: TOOL_HINT_INVALID_STATE,
  not_implemented: TOOL_HINT_NOT_IMPLEMENTED,
  unsupported_format: TOOL_HINT_UNSUPPORTED_FORMAT,
  no_change: TOOL_HINT_NO_CHANGE,
  io_error: TOOL_HINT_IO_ERROR,
  unknown: TOOL_HINT_UNKNOWN
};

export const applyToolErrorPolicy = (error: ToolError): ToolError => {
  const message = normalizeMessage(error.message, error.code);
  const fix = normalizeFix(error.fix ?? DEFAULT_FIXES[error.code]);
  return fix ? { ...error, message, fix } : { ...error, message };
};

const normalizeFix = (value?: string): string | undefined => {
  if (!value) return undefined;
  return normalizeSentence(value);
};

const normalizeMessage = (value: string, code: ToolErrorCode): string => {
  const trimmed = value.trim();
  if (!trimmed) return normalizeSentence(DEFAULT_MESSAGE_HINTS[code] ?? value);
  return normalizeSentence(normalizeTerminology(trimmed));
};

const normalizeSentence = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return value;
  const last = trimmed[trimmed.length - 1];
  if (last === '.' || last === '?' || last === '!') return trimmed;
  return `${trimmed}.`;
};

const normalizeTerminology = (value: string): string =>
  value
    .replace(/uvUsageId/g, 'UV usage id')
    .replace(/uvPaint/g, 'UV paint')
    .replace(/textureResolution/g, 'texture resolution')
    .replace(/get_project_state/g, 'get_project_state')
    .replace(/set_project_texture_resolution/g, 'set_project_texture_resolution');



