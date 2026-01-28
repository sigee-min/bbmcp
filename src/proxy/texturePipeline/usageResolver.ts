import type { Cube, TextureUsage } from '../../domain/model';
import type { TextureTargetSet } from '../../domain/uvTargets';
import type { ToolError, ToolResponse } from '../../types';
import { guardUvUsageId } from '../../domain/uvGuards';
import { requireUvUsageId } from '../../domain/uvUsageId';
import type { MetaOptions } from '../meta';
import { guardUvForTextureTargets, guardUvForUsage, type UvGuardResult } from '../uvGuard';
import { tryRecoverUvForTextureSpec } from './recovery';
import type { ProxyPipelineDeps } from '../types';
import { errorWithMeta } from '../guardHelpers';

export type ResolvedTextureUsage = {
  usage: TextureUsage;
  uvUsageId: string;
  recovery?: Record<string, unknown>;
};

export type ResolveTextureUsageInput = {
  deps: ProxyPipelineDeps;
  payload: { autoRecover?: boolean };
  meta: MetaOptions;
  targets: TextureTargetSet;
  uvUsageId?: string;
  usageOverride?: TextureUsage;
  uvContext?: { cubes: Cube[]; resolution?: { width: number; height: number } };
};

export const resolveTextureUsageForTargets = ({
  deps,
  payload,
  meta,
  targets,
  uvUsageId,
  usageOverride,
  uvContext
}: ResolveTextureUsageInput): ToolResponse<ResolvedTextureUsage> => {
  const failWithMeta = (error: ToolError) => errorWithMeta(error, meta, deps.service);
  const override = usageOverride;
  const canUseOverride = Boolean(override && uvContext);
  const uvGuard: ToolResponse<UvGuardResult> = canUseOverride
    ? (() => {
        const usage = override!;
        const usageIdRes = requireUvUsageId(uvUsageId);
        if (!usageIdRes.ok) return failWithMeta(usageIdRes.error);
        const usageIdError = guardUvUsageId(usage, usageIdRes.data);
        if (usageIdError) return failWithMeta(usageIdError);
        return guardUvForUsage(deps.service, meta, {
          usage,
          targets,
          cubes: uvContext?.cubes ?? [],
          resolution: uvContext?.resolution,
          policy: deps.service.getUvPolicy()
        });
      })()
    : guardUvForTextureTargets(deps.service, meta, uvUsageId, targets, { cache: deps.cache?.uv });
  if (!uvGuard.ok) {
    const recovered = tryRecoverUvForTextureSpec(deps, payload, meta, targets, uvGuard.error);
    if (!recovered) return uvGuard;
    if (!recovered.ok) return recovered;
    return {
      ok: true,
      data: {
        usage: recovered.data.usage,
        uvUsageId: recovered.data.uvUsageId,
        recovery: recovered.data.recovery
      }
    };
  }
  return {
    ok: true,
    data: {
      usage: uvGuard.data.usage,
      uvUsageId: uvUsageId ?? '',
      recovery: undefined
    }
  };
};
