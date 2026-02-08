import type { Logger } from '../logging';
import type { ToolPayloadMap, ToolResponse, ToolResultMap } from '@ashfox/contracts/types/internal';
import type { ToolService } from '../usecases/ToolService';
import type { UsecaseResult } from '../usecases/result';
import { toToolResponse } from '../shared/tooling/toolResponse';
import { guardOptionalRevision } from '../shared/tooling/optionalRevision';
import type { BaseResult, StatefulToolName } from './handlerMaps';
import { callWithAutoRetry } from './retryPolicy';
import { toRevisionPayload } from './utils';

interface StatefulPipelineDeps {
  service: ToolService;
  log: Logger;
  attachStateForTool: <TName extends StatefulToolName>(
    payload: ToolPayloadMap[TName],
    response: ToolResponse<BaseResult<TName>>
  ) => ToolResponse<ToolResultMap[TName]>;
  logGuardFailure: <T>(
    tool: StatefulToolName,
    payload: ToolPayloadMap[StatefulToolName],
    response: ToolResponse<T>
  ) => ToolResponse<T>;
}

type StatefulPipelineParams<TName extends StatefulToolName> = {
  tool: TName;
  payload: ToolPayloadMap[TName];
  call: (payload: ToolPayloadMap[TName]) => UsecaseResult<BaseResult<TName>> | Promise<UsecaseResult<BaseResult<TName>>>;
  retry: boolean;
};

export const runStatefulPipeline = async <TName extends StatefulToolName>(
  deps: StatefulPipelineDeps,
  params: StatefulPipelineParams<TName>
): Promise<ToolResponse<ToolResultMap[TName]>> => {
  if (!params.retry) {
    const guard = guardOptionalRevision(deps.service, toRevisionPayload(params.payload));
    if (guard) {
      const guarded = deps.attachStateForTool(params.payload, guard as ToolResponse<BaseResult<TName>>);
      return deps.logGuardFailure(
        params.tool,
        params.payload as ToolPayloadMap[StatefulToolName],
        guarded
      );
    }
  }

  let nextPayload = params.payload;
  let result: UsecaseResult<BaseResult<TName>>;
  if (params.retry) {
    const retried = await callWithAutoRetry({
      tool: params.tool,
      payload: params.payload,
      call: params.call,
      service: deps.service,
      log: deps.log
    });
    nextPayload = retried.payload;
    result = retried.result;
  } else {
    result = await params.call(params.payload);
  }

  const attached = deps.attachStateForTool(nextPayload, toToolResponse(result));
  return deps.logGuardFailure(
    params.tool,
    nextPayload as ToolPayloadMap[StatefulToolName],
    attached
  );
};
