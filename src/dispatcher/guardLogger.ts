import type { ToolName, ToolPayloadMap, ToolResponse } from '@ashfox/contracts/types/internal';
import type { Logger } from '../logging';
import { extractGuardMeta, resolveGuardReason, resolveIfRevision } from './utils';

export const createGuardLogger = (log: Logger) => {
  return <T>(tool: ToolName, payload: ToolPayloadMap[ToolName], response: ToolResponse<T>): ToolResponse<T> => {
    if (response.ok) return response;
    const reason = resolveGuardReason(response.error);
    if (!reason) return response;
    const ifRevision = resolveIfRevision(payload) ?? null;
    const detailMeta = extractGuardMeta(response.error);
    log.debug('guard rejected request', {
      tool,
      reason,
      code: response.error.code,
      ifRevision,
      ...detailMeta
    });
    return response;
  };
};

