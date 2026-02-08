import type { NextAction, ToolResponse } from '@ashfox/contracts/types/internal';
import { isRecord } from '../../domain/guards';
import { callTool, refTool } from '../../transport/mcp/nextActions';
import { REVISION_REFRESH_REASON, REVISION_RETRY_REASON } from '../messages/workflow';

const hasMissingRevision = (response: ToolResponse<unknown>): boolean => {
  if (response.ok) return false;
  const details = response.error.details as Record<string, unknown> | undefined;
  return details?.reason === 'missing_ifRevision';
};

const normalizePayload = (payload: unknown): Record<string, unknown> =>
  (isRecord(payload) ? { ...payload } : {});

export const buildRevisionNextActions = (
  tool: string,
  payload: Record<string, unknown>,
  priorityBase = 1
): NextAction[] => [
  callTool('get_project_state', { detail: 'summary' }, REVISION_REFRESH_REASON, priorityBase),
  callTool(
    tool,
    { ...payload, ifRevision: refTool('get_project_state', '/project/revision') },
    REVISION_RETRY_REASON(tool),
    priorityBase + 1
  )
];

const dedupeByTool = (actions: NextAction[]): NextAction[] => {
  const seen = new Set<string>();
  return actions.filter((action) => {
    if (action.type !== 'call_tool') return true;
    const key = action.tool;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const appendMissingRevisionNextActions = <T>(
  tool: string,
  payload: unknown,
  response: ToolResponse<T>
): ToolResponse<T> => {
  if (!hasMissingRevision(response as ToolResponse<unknown>)) return response;
  const actions = buildRevisionNextActions(tool, normalizePayload(payload));
  const nextActions = response.nextActions ? [...response.nextActions, ...actions] : actions;
  const deduped = dedupeByTool(nextActions);
  return { ...response, nextActions: deduped };
};

