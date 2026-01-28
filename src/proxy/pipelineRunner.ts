import type { IncludeDiffOption, IncludeStateOption, IfRevisionOption, Limits, ToolResponse } from '../types';
import { createProxyPipeline, type ProxyPipeline } from './pipeline';
import type { ProxyPipelineDeps } from './types';
import { isProxyPipelineAbort } from './pipelineAbort';

type ProxyPayload = IncludeStateOption & IncludeDiffOption & IfRevisionOption;

type ValidateFn<P extends ProxyPayload> = (payload: P, limits: Limits) => ToolResponse<void>;
type GuardFn<P extends ProxyPayload> = (pipeline: ProxyPipeline, payload: P) => ToolResponse<never> | null;
type RunFn<P extends ProxyPayload, R> = (
  pipeline: ProxyPipeline,
  payload: P
) => Promise<ToolResponse<R>> | ToolResponse<R>;

export const runProxyPipeline = async <P extends ProxyPayload, R>(
  deps: ProxyPipelineDeps,
  payload: P,
  options: {
    validate?: ValidateFn<P>;
    guard?: GuardFn<P>;
    run: RunFn<P, R>;
  }
): Promise<ToolResponse<R>> => {
  if (options.validate) {
    const validation = options.validate(payload, deps.limits);
    if (!validation.ok) return validation;
  }
  const pipeline = createProxyPipeline({
    service: deps.service,
    payload,
    includeStateByDefault: deps.includeStateByDefault,
    includeDiffByDefault: deps.includeDiffByDefault,
    runWithoutRevisionGuard: (fn) => deps.runWithoutRevisionGuard(fn)
  });
  const guard = options.guard ? options.guard(pipeline, payload) : pipeline.guardRevision();
  if (guard) return guard;
  try {
    return await pipeline.run(async () => await options.run(pipeline, payload));
  } catch (err) {
    if (isProxyPipelineAbort(err)) {
      return err.response;
    }
    throw err;
  }
};
