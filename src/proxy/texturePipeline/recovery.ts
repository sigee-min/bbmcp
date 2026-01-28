import type { TextureUsage } from '../../domain/model';
import type { TextureTargetSet } from '../../domain/uvTargets';
import { isRecord } from '../../domain/guards';
import type { ToolError, ToolResponse } from '../../types';
import { guardUvForTextureTargets } from '../uvGuard';
import type { MetaOptions } from '../meta';
import type { ProxyPipelineDeps } from '../types';
import { isResponseError, isUsecaseError, usecaseError } from '../guardHelpers';

type UvGuardFailure =
  | 'uv_overlap'
  | 'uv_scale_mismatch'
  | 'uv_usage_mismatch'
  | 'uv_usage_missing'
  | 'unknown';

const classifyUvGuardFailure = (error: ToolError): UvGuardFailure => {
  if (error.code !== 'invalid_state') return 'unknown';
  const details = error.details;
  if (!isRecord(details)) return 'unknown';
  const reason = typeof details.reason === 'string' ? details.reason : null;
  if (reason === 'uv_overlap') return 'uv_overlap';
  if (reason === 'uv_scale_mismatch') return 'uv_scale_mismatch';
  if (reason === 'uv_usage_mismatch') return 'uv_usage_mismatch';
  if (reason === 'uv_usage_missing') return 'uv_usage_missing';
  if (Array.isArray(details.overlaps) && details.overlaps.length > 0) return 'uv_overlap';
  if (Array.isArray(details.mismatches) && details.mismatches.length > 0) return 'uv_scale_mismatch';
  if (typeof details.expected === 'string' && typeof details.current === 'string') return 'uv_usage_mismatch';
  return 'unknown';
};

export const tryRecoverUvForTextureSpec = (
  deps: ProxyPipelineDeps,
  payload: { autoRecover?: boolean },
  meta: MetaOptions,
  targets: TextureTargetSet,
  error: ToolError
): ToolResponse<{ usage: TextureUsage; uvUsageId: string; recovery: Record<string, unknown> }> | null => {
  if (!payload.autoRecover) return null;
  const failure = classifyUvGuardFailure(error);
  if (failure === 'unknown' || failure === 'uv_usage_missing') return null;

  const recovery: Record<string, unknown> = { reason: failure };
  if (failure === 'uv_overlap' || failure === 'uv_scale_mismatch') {
    const atlasRes = deps.service.autoUvAtlas({ apply: true, ifRevision: meta.ifRevision });
    if (isUsecaseError(atlasRes)) return usecaseError(atlasRes, meta, deps.service);
    recovery.autoUvAtlas = atlasRes.value;
  }

  const preflightRes = deps.service.preflightTexture({});
  if (isUsecaseError(preflightRes)) return usecaseError(preflightRes, meta, deps.service);
  recovery.uvUsageId = preflightRes.value.uvUsageId;

  const guardRes = guardUvForTextureTargets(deps.service, meta, preflightRes.value.uvUsageId, targets, {
    cache: deps.cache?.uv
  });
  if (isResponseError(guardRes)) return guardRes;
  return {
    ok: true,
    data: {
      usage: guardRes.data.usage,
      uvUsageId: preflightRes.value.uvUsageId,
      recovery
    }
  };
};
