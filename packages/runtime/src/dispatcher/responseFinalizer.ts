import type { ToolName, ToolPayloadMap, ToolResponse } from '@ashfox/contracts/types/internal';
import type { ToolService } from '../usecases/ToolService';
import type { TraceRecorder } from '../trace/traceRecorder';
import type { Logger } from '../logging';
import { runResponsePipeline } from './responsePipeline';

export type ResponseFinalizerDeps = {
  service: ToolService;
  traceRecorder?: TraceRecorder;
  log: Logger;
};

export const finalizeToolResponse = <T>(
  deps: ResponseFinalizerDeps,
  tool: ToolName,
  payload: ToolPayloadMap[ToolName],
  response: ToolResponse<T>,
  options?: { refreshViewport?: boolean }
): ToolResponse<T> =>
  runResponsePipeline({
    tool,
    payload,
    response,
    refreshViewport: Boolean(options?.refreshViewport),
    service: deps.service,
    traceRecorder: deps.traceRecorder,
    log: deps.log
  });
