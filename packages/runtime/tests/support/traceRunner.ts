import type { Dispatcher, ProjectState, ProjectStateDetail, ToolError, ToolResponse, ToolPayloadMap } from '/contracts/types/internal';
import type { ToolName } from '../../src/shared/toolConstants';
import { TOOL_NAMES } from '../../src/shared/toolConstants';
import { err } from '../../src/shared/tooling/toolResponse';

export type TraceOp = ToolName;

export type TraceCapture = {
  detail?: ProjectStateDetail;
  includeUsage?: boolean;
};

export type TraceStep = {
  op: TraceOp;
  payload?: unknown;
  captureState?: boolean | TraceCapture;
};

export type TraceCaptureResult =
  | { ok: true; state: ProjectState }
  | { ok: false; error: ToolError };

export type TraceStepResult = {
  op: TraceOp;
  response: ToolResponse<unknown>;
  capture?: TraceCaptureResult;
};

export type TraceRunResult = {
  ok: boolean;
  steps: TraceStepResult[];
  error?: ToolError;
};

export type TraceRunnerOptions = {
  stopOnError?: boolean;
  defaultCaptureState?: boolean | TraceCapture;
};

type TraceRunnerDeps = {
  dispatcher: Dispatcher;
};

const isToolName = (op: string): op is ToolName => (TOOL_NAMES as readonly string[]).includes(op);

const resolveCapturePayload = (
  captureState?: boolean | TraceCapture,
  fallback?: boolean | TraceCapture
): ToolPayloadMap['get_project_state'] | null => {
  const capture = captureState ?? fallback;
  if (!capture) return null;
  if (capture === true) return { detail: 'summary' };
  return {
    detail: capture.detail ?? 'summary',
    ...(capture.includeUsage !== undefined ? { includeUsage: capture.includeUsage } : {})
  };
};

const runTool = (
  deps: TraceRunnerDeps,
  op: ToolName,
  payload?: unknown
): Promise<ToolResponse<unknown>> => {
  const toolPayload = (payload ?? {}) as ToolPayloadMap[ToolName];
  return deps.dispatcher.handle(op, toolPayload);
};

const captureState = (
  deps: TraceRunnerDeps,
  payload: ToolPayloadMap['get_project_state']
): Promise<TraceCaptureResult> => {
  return deps.dispatcher.handle('get_project_state', payload).then((res) => {
  if (res.ok) return { ok: true, state: res.data.project };
  return { ok: false, error: res.error };
  });
};

const getResponseError = (response: ToolResponse<unknown>): ToolError | undefined =>
  response.ok ? undefined : response.error;

export const runTrace = async (
  deps: TraceRunnerDeps,
  steps: TraceStep[],
  options: TraceRunnerOptions = {}
): Promise<TraceRunResult> => {
  const results: TraceStepResult[] = [];
  const stopOnError = options.stopOnError !== false;

  for (const step of steps) {
    let response: ToolResponse<unknown>;
    if (!isToolName(step.op)) {
      response = err('invalid_payload', `Unknown trace op: ${String(step.op)}`, {
        reason: 'unknown_op',
        op: String(step.op)
      });
    } else {
      response = await runTool(deps, step.op as ToolName, step.payload);
    }

    const capturePayload = resolveCapturePayload(step.captureState, options.defaultCaptureState);
    const capture = capturePayload ? await captureState(deps, capturePayload) : undefined;
    const stepResult: TraceStepResult = { op: step.op, response, ...(capture ? { capture } : {}) };
    results.push(stepResult);

    if (stopOnError && !response.ok) {
      return { ok: false, steps: results, error: response.error };
    }
  }

  const errorStep = results.find((item) => !item.response.ok);
  const error = errorStep ? getResponseError(errorStep.response) : undefined;
  return {
    ok: !errorStep,
    steps: results,
    ...(error ? { error } : {})
  };
};
