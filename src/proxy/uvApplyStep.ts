import { buildUvApplyPlan } from '../domain/uvApply';
import { guardUvUsageId } from '../domain/uvGuards';
import { requireUvUsageId } from '../domain/uvUsageId';
import { computeTextureUsageId } from '../domain/textureUsage';
import { collectTextureTargets } from '../domain/uvTargets';
import type { TextureUsage } from '../domain/model';
import type { UvAssignmentSpec } from '../domain/uvApply';
import type { ToolError, ToolResponse } from '../types';
import type { ProxyPipelineDeps } from './types';
import type { MetaOptions } from './meta';
import { guardUvForUsage } from './uvGuard';
import { cacheUvUsage, loadUvContext } from './uvContext';
import { errorWithMeta, isUsecaseError, usecaseError } from './guardHelpers';

export type UvApplyStepResult = {
  usage: TextureUsage;
  uvUsageId: string;
  cubeCount: number;
  faceCount: number;
  touchedTextures: Array<{ id?: string; name: string }>;
};

export const applyUvAssignments = (
  deps: ProxyPipelineDeps,
  meta: MetaOptions,
  args: {
    assignments: UvAssignmentSpec[];
    uvUsageId?: string;
    ifRevision?: string;
    uvUsageMessage?: string;
    usageOverride?: TextureUsage;
  }
): ToolResponse<UvApplyStepResult> => {
  const failWithMeta = (error: ToolError): ToolResponse<never> => errorWithMeta(error, meta, deps.service);
  const usageIdRes = requireUvUsageId(args.uvUsageId, args.uvUsageMessage);
  if (!usageIdRes.ok) {
    const error = args.uvUsageMessage ? { ...usageIdRes.error, code: 'invalid_state' as const } : usageIdRes.error;
    return failWithMeta(error);
  }
  const uvUsageId = usageIdRes.data;

  const contextRes = loadUvContext(deps.service, meta, args.usageOverride, {
    cache: deps.cache?.uv,
    expectedUvUsageId: uvUsageId
  });
  if (!contextRes.ok) return contextRes;
  const usage = contextRes.data.usage;
  const cubes = contextRes.data.cubes;

  const planRes = buildUvApplyPlan(usage, cubes, args.assignments, contextRes.data.resolution);
  if (!planRes.ok) return failWithMeta(planRes.error);

  const targets = collectTextureTargets(planRes.data.touchedTextures);
  const usageIdError = guardUvUsageId(usage, uvUsageId);
  if (usageIdError) return failWithMeta(usageIdError);

  const guardRes = guardUvForUsage(deps.service, meta, {
    usage: planRes.data.usage,
    targets,
    cubes,
    resolution: contextRes.data.resolution,
    policy: contextRes.data.policy
  });
  if (!guardRes.ok) return guardRes;

  for (const update of planRes.data.updates) {
    const res = deps.service.setFaceUv({
      cubeId: update.cubeId,
      cubeName: update.cubeName,
      faces: update.faces,
      ifRevision: args.ifRevision
    });
    if (isUsecaseError(res)) return usecaseError(res, meta, deps.service);
  }

  const nextUsageId = computeTextureUsageId(planRes.data.usage);
  cacheUvUsage(deps.cache?.uv, planRes.data.usage, nextUsageId);
  return {
    ok: true,
    data: {
      usage: planRes.data.usage,
      uvUsageId: nextUsageId,
      cubeCount: planRes.data.cubeCount,
      faceCount: planRes.data.faceCount,
      touchedTextures: planRes.data.touchedTextures
    }
  };
};
