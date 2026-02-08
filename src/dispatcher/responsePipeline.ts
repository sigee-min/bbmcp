import { errorMessage, type Logger } from '../logging';
import type { ToolName, ToolPayloadMap, ToolResponse } from '@ashfox/contracts/types/internal';
import type { ToolService } from '../usecases/ToolService';
import { appendMissingRevisionNextActions } from '../shared/tooling/revisionNextActions';
import { recordTrace } from './trace';
import type { TraceRecorder } from '../trace/traceRecorder';

type ResponsePipelineContext<T> = {
  tool: ToolName;
  payload: ToolPayloadMap[ToolName];
  response: ToolResponse<T>;
  refreshViewport: boolean;
  service: ToolService;
  traceRecorder?: TraceRecorder;
  log: Logger;
};

type ResponseMiddleware<T> = (ctx: ResponsePipelineContext<T>) => ResponsePipelineContext<T>;

const withViewportRefresh = <T>(ctx: ResponsePipelineContext<T>): ResponsePipelineContext<T> => {
  if (!ctx.refreshViewport || !ctx.response.ok) return ctx;
  try {
    ctx.service.notifyViewportRefresh(ctx.tool);
  } catch (err) {
    ctx.log.warn('viewport refresh dispatch failed', {
      tool: ctx.tool,
      message: errorMessage(err, 'viewport refresh dispatch failed')
    });
  }
  return ctx;
};

const withRevisionNextActions = <T>(ctx: ResponsePipelineContext<T>): ResponsePipelineContext<T> => ({
  ...ctx,
  response: appendMissingRevisionNextActions(ctx.tool, ctx.payload, ctx.response)
});

const withTrace = <T>(ctx: ResponsePipelineContext<T>): ResponsePipelineContext<T> => {
  recordTrace(ctx.traceRecorder, ctx.log, ctx.tool, ctx.payload, ctx.response);
  return ctx;
};

export const runResponsePipeline = <T>(ctx: ResponsePipelineContext<T>): ToolResponse<T> => {
  const middlewares: Array<ResponseMiddleware<T>> = [
    withViewportRefresh,
    withRevisionNextActions,
    withTrace
  ];
  const finalCtx = middlewares.reduce<ResponsePipelineContext<T>>((next, middleware) => middleware(next), ctx);
  return finalCtx.response;
};
