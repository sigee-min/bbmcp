import type { TextureUsage } from '../../domain/model';
import type { TexturePipelinePayload } from '../../spec';
import type { PreflightTextureResult, ToolResponse } from '../../types';
import { toDomainTextureUsage } from '../../usecases/domainMappers';
import type { ProxyPipelineDeps } from '../types';
import type { ProxyPipeline } from '../pipeline';
import type { TexturePipelineSteps } from './types';
import { applyUvAssignments } from '../uvApplyStep';
import { cacheUvUsage } from '../uvContext';
import type { ApplyTextureSpecResult } from './types';
import type { TextureSpec } from '../../spec';
import { applyTextureSpecs } from './textureFlow';
import type { GenerateTexturePresetResult } from '../../types';
import { UV_USAGE_MISSING_MESSAGE } from '../../shared/messages';
import { isResponseError } from '../guardHelpers';

export type TexturePipelineContext = {
  deps: ProxyPipelineDeps;
  pipeline: ProxyPipeline;
  steps: TexturePipelineSteps;
  includePreflight: boolean;
  includeUsage: boolean;
  currentUvUsageId?: string;
  preflightUsage?: TextureUsage;
};

export const createTexturePipelineContext = (args: {
  deps: ProxyPipelineDeps;
  pipeline: ProxyPipeline;
  steps: TexturePipelineSteps;
  includePreflight: boolean;
  includeUsage: boolean;
}): TexturePipelineContext => ({
  ...args
});

const runPipelineBatch = <TEntry, TResult>(
  entries: TEntry[],
  runner: (entry: TEntry) => ToolResponse<TResult>
): ToolResponse<TResult[]> => {
  const results: TResult[] = [];
  for (const entry of entries) {
    const res = runner(entry);
    if (isResponseError(res)) return res;
    results.push(res.data);
  }
  return { ok: true, data: results };
};

export const runAssignStep = (
  ctx: TexturePipelineContext,
  entries: NonNullable<TexturePipelinePayload['assign']>,
  ifRevision?: string
): ToolResponse<void> => {
  const batch = runPipelineBatch(entries, (entry) =>
    ctx.pipeline.wrap(
      ctx.deps.service.assignTexture({
        textureId: entry.textureId,
        textureName: entry.textureName,
        cubeIds: entry.cubeIds,
        cubeNames: entry.cubeNames,
        faces: entry.faces,
        ifRevision
      })
    )
  );
  if (isResponseError(batch)) return batch;
  const results = batch.data;
  ctx.steps.assign = { applied: results.length, results };
  return { ok: true, data: undefined };
};

export const runPreflightStep = (
  ctx: TexturePipelineContext,
  phase?: 'before' | 'after'
): ToolResponse<PreflightTextureResult> => {
  const preflightRes = ctx.pipeline.wrap(ctx.deps.service.preflightTexture({ includeUsage: ctx.includeUsage }));
  if (!preflightRes.ok) return preflightRes;
  ctx.currentUvUsageId = preflightRes.data.uvUsageId;
  if (ctx.includeUsage && preflightRes.data.textureUsage) {
    ctx.preflightUsage = toDomainTextureUsage(preflightRes.data.textureUsage);
    cacheUvUsage(ctx.deps.cache?.uv, ctx.preflightUsage, preflightRes.data.uvUsageId);
  }
  if (phase && ctx.includePreflight) {
    const existing = ctx.steps.preflight ?? {};
    ctx.steps.preflight = { ...existing, [phase]: preflightRes.data };
  }
  return preflightRes;
};

export const runUvStep = (
  ctx: TexturePipelineContext,
  assignments: NonNullable<TexturePipelinePayload['uv']>['assignments'],
  ifRevision?: string
): ToolResponse<void> => {
  const uvRes = applyUvAssignments(ctx.deps, ctx.pipeline.meta, {
    assignments,
    uvUsageId: ctx.currentUvUsageId,
    uvUsageMessage: UV_USAGE_MISSING_MESSAGE,
    ifRevision,
    usageOverride: ctx.preflightUsage
  });
  if (isResponseError(uvRes)) return uvRes;
  ctx.steps.uv = {
    applied: true,
    cubes: uvRes.data.cubeCount,
    faces: uvRes.data.faceCount,
    uvUsageId: uvRes.data.uvUsageId
  };
  ctx.currentUvUsageId = uvRes.data.uvUsageId;
  return { ok: true, data: undefined };
};

export const runTextureApplyStep = async (
  ctx: TexturePipelineContext,
  textures: TextureSpec[],
  usage: TextureUsage,
  recovery?: Record<string, unknown>
): Promise<ToolResponse<ApplyTextureSpecResult>> => {
  const applyRes = await applyTextureSpecs({
    deps: ctx.deps,
    meta: ctx.pipeline.meta,
    textures,
    usage
  });
  if (isResponseError(applyRes)) return applyRes;
  const result: ApplyTextureSpecResult = {
    applied: true,
    report: applyRes.data,
    ...(recovery
      ? {
          recovery,
          uvUsageId: ctx.currentUvUsageId
        }
      : {})
  };
  ctx.steps.textures = result;
  return { ok: true, data: result };
};

export const runPresetStep = (
  ctx: TexturePipelineContext,
  presets: NonNullable<TexturePipelinePayload['presets']>,
  recovery?: Record<string, unknown>,
  ifRevision?: string
): ToolResponse<void> => {
  const uvUsageId = ctx.currentUvUsageId;
  if (!uvUsageId) {
    return ctx.pipeline.error({
      code: 'invalid_state',
      message: UV_USAGE_MISSING_MESSAGE,
      details: { reason: 'uv_usage_missing' }
    });
  }
  const batch = runPipelineBatch(presets, (preset) =>
    ctx.pipeline.wrap(
      ctx.deps.service.generateTexturePreset({
        preset: preset.preset,
        width: preset.width,
        height: preset.height,
        uvUsageId,
        name: preset.name,
        targetId: preset.targetId,
        targetName: preset.targetName,
        mode: preset.mode,
        seed: preset.seed,
        palette: preset.palette,
        uvPaint: preset.uvPaint,
        ifRevision
      })
    )
  );
  if (isResponseError(batch)) return batch;
  const results = batch.data as GenerateTexturePresetResult[];
  ctx.steps.presets = {
    applied: results.length,
    results,
    ...(recovery
      ? {
          recovery,
          uvUsageId
        }
      : {})
  };
  return { ok: true, data: undefined };
};
