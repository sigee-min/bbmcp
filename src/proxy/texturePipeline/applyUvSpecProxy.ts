import type { ApplyUvSpecPayload } from '../../spec';
import type { ToolResponse } from '../../types';
import { callTool } from '../../mcp/nextActions';
import { validateUvSpec } from '../validators';
import type { ProxyPipelineDeps } from '../types';
import { applyUvAssignments } from '../uvApplyStep';
import type { ApplyUvSpecResult } from './types';
import { runProxyPipeline } from '../pipelineRunner';

export const applyUvSpecProxy = async (
  deps: ProxyPipelineDeps,
  payload: ApplyUvSpecPayload
): Promise<ToolResponse<ApplyUvSpecResult>> => {
  return runProxyPipeline(deps, payload, {
    validate: (payloadValue) => validateUvSpec(payloadValue),
    run: async (pipeline) => {
    const uvRes = pipeline.require(
      applyUvAssignments(deps, pipeline.meta, {
        assignments: payload.assignments,
        uvUsageId: payload.uvUsageId,
        ifRevision: payload.ifRevision
      })
    );
    const result: ApplyUvSpecResult = {
      applied: true,
      cubes: uvRes.cubeCount,
      faces: uvRes.faceCount,
      uvUsageId: uvRes.uvUsageId
    };
    const response = pipeline.ok(result);
    return {
      ...response,
      nextActions: [
        callTool('preflight_texture', { includeUsage: false }, 'UVs changed. Refresh uvUsageId before painting textures.', 1)
      ]
    };
    }
  });
};
