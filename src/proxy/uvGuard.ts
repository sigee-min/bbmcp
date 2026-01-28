import type { ToolError, ToolResponse } from '../types';
import { guardUvOverlaps, guardUvScale, guardUvUsageId } from '../domain/uvGuards';
import type { TextureTargetSet } from '../domain/uvTargets';
import type { Cube, TextureUsage } from '../domain/model';
import type { UvPolicyConfig } from '../domain/uvPolicy';
import { requireUvUsageId } from '../domain/uvUsageId';
import type { ToolService } from '../usecases/ToolService';
import type { MetaOptions } from './meta';
import { loadUvContext, type UvContextCache } from './uvContext';
import { errorWithMeta, isResponseError } from './guardHelpers';

export type UvGuardResult = { usage: TextureUsage };

export type UvGuardContext = {
  usage: TextureUsage;
  targets: TextureTargetSet;
  cubes: Cube[];
  resolution?: { width: number; height: number };
  policy: UvPolicyConfig;
};

export const guardUvForUsage = (
  service: ToolService,
  meta: MetaOptions,
  context: UvGuardContext
): ToolResponse<UvGuardResult> => {
  const failWithMeta = (error: ToolError) => errorWithMeta(error, meta, service);
  const overlapError = guardUvOverlaps(context.usage, context.targets);
  if (overlapError) return failWithMeta(overlapError);
  const scaleError = guardUvScale({
    usage: context.usage,
    cubes: context.cubes,
    resolution: context.resolution,
    policy: context.policy,
    targets: context.targets
  });
  if (scaleError) return failWithMeta(scaleError);
  return { ok: true, data: { usage: context.usage } };
};

export const guardUvForTextureTargets = (
  service: ToolService,
  meta: MetaOptions,
  uvUsageId: string | undefined,
  targets: TextureTargetSet,
  options?: { cache?: UvContextCache }
): ToolResponse<UvGuardResult> => {
  const failWithMeta = (error: ToolError) => errorWithMeta(error, meta, service);
  const usageIdRes = requireUvUsageId(uvUsageId);
  if (!usageIdRes.ok) return failWithMeta(usageIdRes.error);
  const contextRes = loadUvContext(service, meta, undefined, {
    cache: options?.cache,
    expectedUvUsageId: usageIdRes.data
  });
  if (isResponseError(contextRes)) return contextRes;
  const usageIdError = guardUvUsageId(contextRes.data.usage, usageIdRes.data);
  if (usageIdError) return failWithMeta(usageIdError);
  return guardUvForUsage(service, meta, {
    usage: contextRes.data.usage,
    targets,
    cubes: contextRes.data.cubes,
    resolution: contextRes.data.resolution,
    policy: contextRes.data.policy
  });
};
