import type { ToolName, ToolPayloadMap } from '@ashfox/contracts/types/internal';
import type { UsecaseResult } from '../usecases/result';
import {
  BaseResult,
  isStatefulToolName,
  type ResponseHandlerMap,
  type StatefulHandlerMap,
  type StatefulToolName
} from './handlerMaps';
import type { Handler } from './responseHelpers';

type StatefulCall<K extends StatefulToolName> = (
  payload: ToolPayloadMap[K]
) => UsecaseResult<BaseResult<K>> | Promise<UsecaseResult<BaseResult<K>>>;

export type HandlerResolverDeps = {
  statefulRetryHandlers: StatefulHandlerMap;
  statefulHandlers: StatefulHandlerMap;
  responseHandlers: ResponseHandlerMap;
  wrapRetryHandler: <K extends StatefulToolName>(name: K, handler: StatefulCall<K>) => Handler;
  wrapStatefulHandler: <K extends StatefulToolName>(name: K, handler: StatefulCall<K>) => Handler;
};

export const createHandlerResolver = (deps: HandlerResolverDeps) => {
  const resolveStatefulHandler = <K extends StatefulToolName>(name: K): Handler | null => {
    const retryHandler = deps.statefulRetryHandlers[name] as StatefulCall<K> | undefined;
    if (retryHandler) {
      return deps.wrapRetryHandler(name, retryHandler);
    }
    const statefulHandler = deps.statefulHandlers[name] as StatefulCall<K> | undefined;
    if (statefulHandler) {
      return deps.wrapStatefulHandler(name, statefulHandler);
    }
    return null;
  };

  return (name: ToolName): Handler | null => {
    if (isStatefulToolName(name)) {
      const stateful = resolveStatefulHandler(name);
      if (stateful) return stateful;
    }
    const responseHandler = deps.responseHandlers[name];
    if (responseHandler) {
      return responseHandler as Handler;
    }
    return null;
  };
};
