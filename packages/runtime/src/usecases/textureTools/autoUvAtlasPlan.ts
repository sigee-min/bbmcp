import type { AtlasPlan } from '../../domain/uv/atlas';
import { buildUvAtlasPlan } from '../../domain/uv/atlas';
import { DEFAULT_UV_POLICY, normalizePixelsPerBlock, type UvPolicyConfig } from '../../domain/uv/policy';
import type { Cube, TextureUsage } from '../../domain/model';
import { TEXTURE_AUTO_UV_DENSITY_UPDATE_UNAVAILABLE } from '../../shared/messages';
import { fromDomainResult } from '../fromDomain';
import { fail, ok, type UsecaseResult } from '../result';
import { uvAtlasMessages, type TextureToolContext } from './context';

export type BuildAutoUvAtlasPlanParams = {
  usage: TextureUsage;
  cubes: Cube[];
  resolution: { width: number; height: number };
  maxEdgeSafe: number;
  padding: number;
  policy: UvPolicyConfig;
  apply: boolean;
};

export type BuildAutoUvAtlasPlanResult = {
  plan: AtlasPlan;
  pixelsPerBlock: number;
  basePixelsPerBlock: number;
};

export const buildAutoUvAtlasPlan = (
  params: BuildAutoUvAtlasPlanParams
): UsecaseResult<BuildAutoUvAtlasPlanResult> => {
  const fallbackPixels = normalizePixelsPerBlock(DEFAULT_UV_POLICY.pixelsPerBlock) ?? 16;
  const basePixelsPerBlock =
    normalizePixelsPerBlock(params.policy.pixelsPerBlock, fallbackPixels) ?? fallbackPixels;
  const buildPlan = (pixelsPerBlock: number) =>
    fromDomainResult(
      buildUvAtlasPlan({
        usage: params.usage,
        cubes: params.cubes,
        resolution: params.resolution,
        maxResolution: { width: params.maxEdgeSafe, height: params.maxEdgeSafe },
        padding: params.padding,
        policy: { ...params.policy, pixelsPerBlock },
        messages: uvAtlasMessages
      })
    );

  let pixelsPerBlock = basePixelsPerBlock;
  let planRes = buildPlan(pixelsPerBlock);
  if (params.apply) {
    while (!planRes.ok && shouldReduceDensityForAtlas(planRes.error) && pixelsPerBlock > 1) {
      const next = reducePixelsPerBlockForAtlas(pixelsPerBlock);
      if (!next || next === pixelsPerBlock) break;
      pixelsPerBlock = next;
      planRes = buildPlan(pixelsPerBlock);
    }
  }
  if (!planRes.ok) return fail(planRes.error);

  return ok({
    plan: planRes.value,
    pixelsPerBlock,
    basePixelsPerBlock
  });
};

export const applyAutoUvAtlasPlanConfig = (
  ctx: TextureToolContext,
  result: BuildAutoUvAtlasPlanResult,
  resolution: { width: number; height: number }
): UsecaseResult<void> => {
  if (result.pixelsPerBlock !== result.basePixelsPerBlock) {
    if (!ctx.setProjectUvPixelsPerBlock) {
      return fail({
        code: 'invalid_state',
        message: TEXTURE_AUTO_UV_DENSITY_UPDATE_UNAVAILABLE
      });
    }
    const uvErr = ctx.setProjectUvPixelsPerBlock(result.pixelsPerBlock);
    if (uvErr) return fail(uvErr);
  }

  if (
    result.plan.resolution.width !== resolution.width ||
    result.plan.resolution.height !== resolution.height
  ) {
    const resizeErr = ctx.editor.setProjectTextureResolution(
      result.plan.resolution.width,
      result.plan.resolution.height,
      false
    );
    if (resizeErr) return fail(resizeErr);
  }

  return ok(undefined);
};

export const shouldReduceDensityForAtlas = (
  error: { details?: Record<string, unknown> } | null | undefined
): boolean => {
  const reason = typeof error?.details?.reason === 'string' ? error.details.reason : '';
  if (reason === 'atlas_overflow' || reason === 'uv_size_exceeds') return true;
  const details = error?.details ?? {};
  return typeof details.nextWidth === 'number' && typeof details.maxWidth === 'number';
};

export const reducePixelsPerBlockForAtlas = (value: number): number | null => {
  if (!Number.isFinite(value) || value <= 1) return null;
  const current = Math.trunc(value);
  if (current <= 1) return null;
  if (current <= 4) return current - 1;
  return Math.max(1, Math.floor(current * 0.5));
};
