import type { Logger } from '../logging';
import type { ToolName, ToolPayloadMap, ToolResponse } from '@ashfox/contracts/types/internal';
import { errorMessage } from '../logging';
import type { TraceRecorder } from '../trace/traceRecorder';

export const recordTrace = <T>(
  traceRecorder: TraceRecorder | undefined,
  log: Logger,
  tool: ToolName,
  payload: ToolPayloadMap[ToolName],
  response: ToolResponse<T>
): void => {
  if (!traceRecorder) return;
  try {
    traceRecorder.record(tool, payload, response as ToolResponse<unknown>);
  } catch (err) {
    const message = errorMessage(err, 'trace log record failed');
    log.warn('trace log record failed', { tool, message });
  }
};

