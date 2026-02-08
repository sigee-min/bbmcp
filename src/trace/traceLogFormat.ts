import type { ProjectDiff, ProjectState, ToolError, ToolResponse } from '../types/internal';
import type {
  TraceLogDiffSummary,
  TraceLogRecord,
  TraceLogResponse,
  TraceLogStateSummary
} from '../types/traceLog';

const REDACT_KEYS = new Set(['dataUri', 'image', 'canvas', 'ctx', 'img']);
const MAX_DEPTH = 6;
const MAX_ARRAY = 50;
const MAX_OBJECT_KEYS = 100;
const TRUNCATED_KEYS_MARKER = '__ashfoxTruncatedKeys__';

export const summarizeProjectState = (state: ProjectState): TraceLogStateSummary => ({
  id: state.id,
  revision: state.revision,
  name: state.name ?? null,
  format: state.format ?? null,
  ...(state.formatId !== undefined ? { formatId: state.formatId } : {}),
  ...(state.textureResolution ? { textureResolution: state.textureResolution } : {}),
  counts: state.counts
});

export const summarizeProjectDiff = (diff: ProjectDiff): TraceLogDiffSummary => ({
  sinceRevision: diff.sinceRevision,
  currentRevision: diff.currentRevision,
  ...(diff.baseMissing !== undefined ? { baseMissing: diff.baseMissing } : {}),
  counts: diff.counts
});

export const sanitizeToolError = (error: ToolError): ToolError => ({
  code: error.code,
  message: error.message,
  ...(error.fix ? { fix: error.fix } : {}),
  ...(error.details ? { details: sanitizeTraceValue(error.details) as Record<string, unknown> } : {})
});

export const sanitizeToolResponse = (response: ToolResponse<unknown>): TraceLogResponse => {
  if (response.ok) {
    return { ok: true, data: sanitizeTraceValue(response.data) };
  }
  return { ok: false, error: sanitizeToolError(response.error) };
};

export const sanitizeTraceValue = (value: unknown, depth = 0, seen?: WeakSet<object>): unknown => {
  if (depth > MAX_DEPTH) return '[truncated]';
  if (value === null || value === undefined) return value;
  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') return value;
  if (valueType === 'function') return '[function]';
  if (valueType !== 'object') return String(value);

  const objectValue = value as object;
  const tracker = seen ?? new WeakSet<object>();
  if (tracker.has(objectValue)) return '[circular]';
  tracker.add(objectValue);

  if (Array.isArray(value)) {
    const limited = value.slice(0, MAX_ARRAY).map((entry) => sanitizeTraceValue(entry, depth + 1, tracker));
    return value.length > MAX_ARRAY ? [...limited, '[truncated]'] : limited;
  }

  const record: Record<string, unknown> = {};
  const entries = Object.entries(value as Record<string, unknown>);
  const limitedEntries = entries.slice(0, MAX_OBJECT_KEYS);
  for (const [key, entry] of limitedEntries) {
    if (REDACT_KEYS.has(key)) {
      record[key] = '<redacted>';
    } else {
      record[key] = sanitizeTraceValue(entry, depth + 1, tracker);
    }
  }
  if (entries.length > MAX_OBJECT_KEYS) {
    record[TRUNCATED_KEYS_MARKER] = `[truncated:${entries.length - MAX_OBJECT_KEYS}]`;
  }
  return record;
};

export const serializeTraceLogRecord = (record: TraceLogRecord): string =>
  JSON.stringify(record);





