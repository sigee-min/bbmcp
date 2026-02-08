import {
  Dispatcher,
  ProjectStateDetail,
  ToolName,
  ToolPayloadMap,
  ToolResultMap,
  ToolResponse
} from './types/internal';
import { ProjectSession } from './session';
import { Capabilities } from './types/internal';
import { ConsoleLogger, errorMessage, Logger } from './logging';
import { ToolService } from './usecases/ToolService';
import { UsecaseResult } from './usecases/result';
import { err, toToolResponse } from './shared/tooling/toolResponse';
import { guardOptionalRevision } from './shared/tooling/optionalRevision';
import { TraceRecorder } from './trace/traceRecorder';
import { TraceLogService } from './usecases/TraceLogService';
import { toRevisionPayload } from './dispatcher/utils';
import { buildDefaultToolService } from './dispatcher/bootstrap';
import {
  BaseResult,
  createHandlerMaps,
  type StatefulHandlerMap,
  type StatefulToolName,
  type ResponseHandlerMap
} from './dispatcher/handlerMaps';
import { Handler, HandlerPayload, HandlerResult, respondErrorSimple, respondOk } from './dispatcher/responseHelpers';
import { createStateAttacher } from './dispatcher/stateAttacher';
import { createGuardLogger } from './dispatcher/guardLogger';
import { runStatefulPipeline } from './dispatcher/statefulPipeline';
import { createHandlerResolver } from './dispatcher/handlerResolver';
import { finalizeToolResponse } from './dispatcher/responseFinalizer';

export class ToolDispatcherImpl implements Dispatcher {
  private readonly service: ToolService;
  private readonly includeStateByDefault: () => boolean;
  private readonly includeDiffByDefault: () => boolean;
  private readonly log: Logger;
  private readonly statefulRetryHandlers: StatefulHandlerMap;
  private readonly statefulHandlers: StatefulHandlerMap;
  private readonly responseHandlers: ResponseHandlerMap;
  private readonly resolveHandler: (name: ToolName) => Handler | null;
  private readonly traceRecorder?: TraceRecorder;
  private readonly traceLogService?: TraceLogService;
  private readonly attachStateForTool: <TName extends StatefulToolName>(
    payload: ToolPayloadMap[TName],
    response: ToolResponse<BaseResult<TName>>
  ) => ToolResponse<ToolResultMap[TName]>;
  private readonly logGuardFailure: <T>(
    tool: ToolName,
    payload: ToolPayloadMap[ToolName],
    response: ToolResponse<T>
  ) => ToolResponse<T>;

  constructor(
    session: ProjectSession,
    capabilities: Capabilities,
    service?: ToolService,
    options?: {
      includeStateByDefault?: boolean | (() => boolean);
      includeDiffByDefault?: boolean | (() => boolean);
      logger?: Logger;
      traceRecorder?: TraceRecorder;
      traceLogService?: TraceLogService;
    }
  ) {
    this.log = options?.logger ?? new ConsoleLogger('ashfox-dispatcher', 'info');
    this.logGuardFailure = createGuardLogger(this.log);
    if (service) {
      this.service = service;
    } else {
      this.service = buildDefaultToolService(session, capabilities, this.log);
    }
    const handlerMaps = createHandlerMaps({
      service: this.service,
      respondOk,
      logGuardFailure: this.logGuardFailure.bind(this),
      handleTraceLogExport: this.handleTraceLogExport.bind(this),
      handleRenderPreview: this.handleRenderPreview.bind(this)
    });
    this.statefulRetryHandlers = handlerMaps.statefulRetryHandlers;
    this.statefulHandlers = handlerMaps.statefulHandlers;
    this.responseHandlers = handlerMaps.responseHandlers;
    this.resolveHandler = createHandlerResolver({
      statefulRetryHandlers: this.statefulRetryHandlers,
      statefulHandlers: this.statefulHandlers,
      responseHandlers: this.responseHandlers,
      wrapRetryHandler: this.wrapRetryHandler.bind(this),
      wrapStatefulHandler: this.wrapStatefulHandler.bind(this)
    });
    const flag = options?.includeStateByDefault;
    this.includeStateByDefault = typeof flag === 'function' ? flag : () => Boolean(flag);
    const diffFlag = options?.includeDiffByDefault;
    this.includeDiffByDefault = typeof diffFlag === 'function' ? diffFlag : () => Boolean(diffFlag);
    this.traceRecorder = options?.traceRecorder;
    this.traceLogService = options?.traceLogService;
    this.attachStateForTool = createStateAttacher(this.getStateDeps());
  }

  async handle<TName extends ToolName>(
    name: TName,
    payload: ToolPayloadMap[TName]
  ): Promise<ToolResponse<ToolResultMap[TName]>>;
  async handle(name: ToolName, payload: HandlerPayload): Promise<ToolResponse<HandlerResult>> {
    try {
      const handler = this.resolveHandler(name);
      if (!handler) {
        return this.finalizeResponse(
          name,
          payload,
          respondErrorSimple('invalid_payload', `Unknown tool ${String(name)}`, {
            reason: 'unknown_tool',
            tool: String(name)
          })
        );
      }
      const response = await handler(payload);
      return this.finalizeResponse(name, payload, response, { refreshViewport: true });
    } catch (err) {
      const message = errorMessage(err, 'unknown error');
      return this.finalizeResponse(
        name,
        payload,
        respondErrorSimple('unknown', message, {
          reason: 'dispatcher_exception',
          tool: String(name)
        })
      );
    }
  }

  private wrapRetryHandler<K extends StatefulToolName>(
    name: K,
    handler: (payload: ToolPayloadMap[K]) => UsecaseResult<BaseResult<K>> | Promise<UsecaseResult<BaseResult<K>>>
  ): Handler {
    return (payload) => this.handleWithRetry(name, payload as ToolPayloadMap[K], handler);
  }

  private wrapStatefulHandler<K extends StatefulToolName>(
    name: K,
    handler: (payload: ToolPayloadMap[K]) => UsecaseResult<BaseResult<K>> | Promise<UsecaseResult<BaseResult<K>>>
  ): Handler {
    return (payload) => this.handleStateful(name, payload as ToolPayloadMap[K], handler);
  }

  private getStateDeps() {
    return {
      includeStateByDefault: this.includeStateByDefault,
      includeDiffByDefault: this.includeDiffByDefault,
      getProjectState: (payload: { detail: ProjectStateDetail }) => this.service.getProjectState(payload),
      getProjectDiff: (payload: { sinceRevision: string; detail?: ProjectStateDetail }) =>
        this.service.getProjectDiff(payload)
    };
  }

  private async handleWithRetry<TName extends StatefulToolName>(
    tool: TName,
    payload: ToolPayloadMap[TName],
    call: (payload: ToolPayloadMap[TName]) => UsecaseResult<BaseResult<TName>> | Promise<UsecaseResult<BaseResult<TName>>>
  ): Promise<ToolResponse<ToolResultMap[TName]>> {
    return await runStatefulPipeline(
      {
        service: this.service,
        log: this.log,
        attachStateForTool: this.attachStateForTool,
        logGuardFailure: this.logGuardFailure
      },
      {
        tool,
        payload,
        call,
        retry: true
      }
    );
  }

  private async handleStateful<TName extends StatefulToolName>(
    tool: TName,
    payload: ToolPayloadMap[TName],
    call: (payload: ToolPayloadMap[TName]) => UsecaseResult<BaseResult<TName>> | Promise<UsecaseResult<BaseResult<TName>>>
  ): Promise<ToolResponse<ToolResultMap[TName]>> {
    return await runStatefulPipeline(
      {
        service: this.service,
        log: this.log,
        attachStateForTool: this.attachStateForTool,
        logGuardFailure: this.logGuardFailure
      },
      {
        tool,
        payload,
        call,
        retry: false
      }
    );
  }

  private handleRenderPreview(
    payload: ToolPayloadMap['render_preview']
  ): ToolResponse<ToolResultMap['render_preview']> {
    const guard = guardOptionalRevision(this.service, toRevisionPayload(payload));
    if (guard) {
      return this.attachStateForTool<'render_preview'>(payload, guard);
    }
    const baseResponse = toToolResponse(this.service.renderPreview(payload));
    return this.attachStateForTool<'render_preview'>(payload, baseResponse);
  }

  private handleTraceLogExport(
    payload: ToolPayloadMap['export_trace_log']
  ): ToolResponse<ToolResultMap['export_trace_log']> {
    if (!this.traceLogService) {
      return err('not_implemented', 'Trace log export is unavailable.', { reason: 'trace_log_service_missing' });
    }
    return toToolResponse(this.traceLogService.exportTraceLog(payload));
  }

  private finalizeResponse<T>(
    tool: ToolName,
    payload: ToolPayloadMap[ToolName],
    response: ToolResponse<T>,
    options?: { refreshViewport?: boolean }
  ): ToolResponse<T> {
    return finalizeToolResponse(
      {
        service: this.service,
        traceRecorder: this.traceRecorder,
        log: this.log
      },
      tool,
      payload,
      response,
      options
    );
  }

}







