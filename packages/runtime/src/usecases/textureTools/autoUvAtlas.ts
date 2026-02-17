import type { AutoUvAtlasPayload, AutoUvAtlasResult } from '@ashfox/contracts/types/internal';
import { toDomainSnapshot, toDomainTextureUsage } from '../domainMappers';
import { withActiveOnly } from '../guards';
import { fail, ok, type UsecaseResult } from '../result';
import {
  TEXTURE_AUTO_UV_NO_TEXTURES,
  TEXTURE_AUTO_UV_RESOLUTION_MISSING,
  TEXTURE_AUTO_UV_REPROJECT_UNAVAILABLE,
  TEXTURE_AUTO_UV_UNRESOLVED_REFS
} from '../../shared/messages';
import type { TextureToolContext } from './context';
import { applyAutoUvAtlasPlan, toReprojectTextureRenderer } from './autoUvAtlasApply';
import { applyAutoUvAtlasPlanConfig, buildAutoUvAtlasPlan } from './autoUvAtlasPlan';

export const runAutoUvAtlas = (
  ctx: TextureToolContext,
  payload: AutoUvAtlasPayload
): UsecaseResult<AutoUvAtlasResult> => {
  return withActiveOnly<AutoUvAtlasResult>(ctx.ensureActive, () => {
    const apply = payload.apply !== false;
    if (apply) {
      const revisionErr = ctx.ensureRevisionMatch(payload.ifRevision);
      if (revisionErr) return fail(revisionErr);
    }

    const usageRes = ctx.editor.getTextureUsage({});
    if (usageRes.error) return fail(usageRes.error);
    const usage = toDomainTextureUsage(usageRes.result ?? { textures: [] });
    if (usage.textures.length === 0) {
      return fail({ code: 'invalid_state', message: TEXTURE_AUTO_UV_NO_TEXTURES });
    }
    const unresolvedCount = usage.unresolved?.length ?? 0;
    if (unresolvedCount > 0) {
      return fail({
        code: 'invalid_state',
        message: TEXTURE_AUTO_UV_UNRESOLVED_REFS(unresolvedCount)
      });
    }

    const resolution = ctx.editor.getProjectTextureResolution();
    if (!resolution) {
      return fail({
        code: 'invalid_state',
        message: TEXTURE_AUTO_UV_RESOLUTION_MISSING
      });
    }
    const padding =
      typeof payload.padding === 'number' && Number.isFinite(payload.padding)
        ? Math.max(0, Math.trunc(payload.padding))
        : 0;

    const domainSnapshot = toDomainSnapshot(ctx.getSnapshot());
    const policy = ctx.getUvPolicyConfig();
    const maxTextureSize = ctx.capabilities.limits.maxTextureSize;
    const maxEdgeRaw = policy.autoMaxResolution ?? 0;
    const maxEdge =
      Number.isFinite(maxEdgeRaw) && maxEdgeRaw > 0 ? Math.trunc(maxEdgeRaw) : maxTextureSize;
    const minEdge = Math.max(resolution.width, resolution.height);
    const maxEdgeSafe = Math.min(maxTextureSize, Math.max(maxEdge, minEdge));

    const planRes = buildAutoUvAtlasPlan({
      usage,
      cubes: domainSnapshot.cubes,
      resolution,
      maxEdgeSafe,
      padding,
      policy,
      apply
    });
    if (!planRes.ok) return fail(planRes.error);
    const builtPlan = planRes.value;
    const plan = builtPlan.plan;

    if (!apply) {
      return ok({
        applied: false,
        steps: plan.steps,
        resolution: plan.resolution,
        textures: plan.textures
      });
    }

    const configRes = applyAutoUvAtlasPlanConfig(ctx, builtPlan, resolution);
    if (!configRes.ok) return fail(configRes.error);

    const textureRenderer = toReprojectTextureRenderer(ctx.textureRenderer);
    if (!textureRenderer) {
      return fail({ code: 'invalid_state', message: TEXTURE_AUTO_UV_REPROJECT_UNAVAILABLE });
    }
    const applyRes = applyAutoUvAtlasPlan({
      ctx,
      payload,
      usage,
      plan,
      textureRenderer
    });
    if (!applyRes.ok) return fail(applyRes.error);

    return ok({
      applied: true,
      steps: plan.steps,
      resolution: plan.resolution,
      textures: plan.textures
    });
  });
};

