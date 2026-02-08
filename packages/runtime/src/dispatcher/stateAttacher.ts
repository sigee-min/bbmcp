import type { ProjectDiff, ProjectState, ProjectStateDetail, ToolPayloadMap, ToolResponse, ToolResultMap } from '@ashfox/contracts/types/internal';
import type { UsecaseResult } from '../usecases/result';
import { attachStateToResponse } from '../shared/tooling/attachState';
import type { BaseResult, StatefulToolName } from './handlerMaps';

export type StateAttachDeps = {
  includeStateByDefault: () => boolean;
  includeDiffByDefault: () => boolean;
  getProjectState: (payload: { detail: ProjectStateDetail }) => UsecaseResult<{ project: ProjectState }>;
  getProjectDiff: (payload: { sinceRevision: string; detail?: ProjectStateDetail }) => UsecaseResult<{ diff: ProjectDiff }>;
};

export const createStateAttacher = (deps: StateAttachDeps) => {
  return <TName extends StatefulToolName>(
    payload: ToolPayloadMap[TName],
    response: ToolResponse<BaseResult<TName>>
  ): ToolResponse<ToolResultMap[TName]> => {
    const attached = attachStateToResponse(deps, payload, response);
    if (attached.ok) {
      return {
        ...attached,
        data: attached.data as ToolResultMap[TName]
      };
    }
    return {
      ok: false,
      error: attached.error,
      ...(attached.content ? { content: attached.content } : {}),
      ...(attached.structuredContent ? { structuredContent: attached.structuredContent } : {}),
      ...(attached.nextActions ? { nextActions: attached.nextActions } : {})
    };
  };
};

