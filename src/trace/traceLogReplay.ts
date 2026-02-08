import type { TraceLogRecord } from '@ashfox/contracts/types/traceLog';
import { toolError } from '../shared/tooling/toolResponse';
import type { ToolError } from '@ashfox/contracts/types/internal';

export type TraceLogParseResult =
  | { ok: true; records: TraceLogRecord[]; warnings?: string[] }
  | { ok: false; error: ToolError; warnings?: string[] };

export const parseTraceLogText = (text: string): TraceLogParseResult => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const records: TraceLogRecord[] = [];
  const warnings: string[] = [];

  lines.forEach((line, index) => {
    try {
      const parsed = JSON.parse(line) as TraceLogRecord;
      if (!parsed || typeof parsed !== 'object') {
        warnings.push(`Line ${index + 1}: not an object.`);
        return;
      }
      if (parsed.kind !== 'header' && parsed.kind !== 'step') {
        warnings.push(`Line ${index + 1}: unknown record kind.`);
        return;
      }
      records.push(parsed);
    } catch (err) {
      warnings.push(`Line ${index + 1}: invalid JSON.`);
    }
  });

  if (records.length === 0) {
    return {
      ok: false,
      error: toolError('invalid_payload', 'Trace log is empty or invalid.', {
        reason: 'trace_log_empty'
      }),
      ...(warnings.length > 0 ? { warnings } : {})
    };
  }

  return { ok: true, records, ...(warnings.length > 0 ? { warnings } : {}) };
};



