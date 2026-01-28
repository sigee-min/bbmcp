import { collectTextureTargets } from '../../domain/uvTargets';
import { validateTexturePipeline } from '../validators';
import type { TexturePipelinePayload } from '../../spec';
import type { ToolResponse } from '../../types';
import { buildClarificationNextActions, buildTexturePipelineNextActions, collectTextureLabels } from '../nextActionHelpers';
import { resolveTextureUsageForTargets } from './usageResolver';
import type { ProxyPipelineDeps } from '../types';
import { runPreviewStep, type PreviewStepData } from '../previewStep';
import type { TexturePipelineResult, TexturePipelineSteps } from './types';
import { attachPreviewResponse } from '../previewResponse';
import { loadUvContext } from '../uvContext';
import { buildPipelineResult } from '../pipelineResult';
import { createTexturePipelineContext, runAssignStep, runPreflightStep, runPresetStep, runTextureApplyStep, runUvStep } from './steps';
import { TEXTURE_PREVIEW_VALIDATE_REASON } from '../../shared/messages';
import { runProxyPipeline } from '../pipelineRunner';
import { getTexturePipelineClarificationQuestions } from '../clarifications';

export const texturePipelineProxy = async (
  deps: ProxyPipelineDeps,
  payload: TexturePipelinePayload
): Promise<ToolResponse<TexturePipelineResult>> => {
  let clarificationQuestions: string[] = [];
  let shouldPlanOnly = false;
  return runProxyPipeline(deps, payload, {
    validate: validateTexturePipeline,
    guard: (pipeline) => {
      clarificationQuestions = getTexturePipelineClarificationQuestions(payload);
      shouldPlanOnly = Boolean(payload.planOnly) || clarificationQuestions.length > 0;
      return shouldPlanOnly ? null : pipeline.guardRevision();
    },
    run: async (pipeline) => {
      const steps: TexturePipelineSteps = {};
      const ctx = createTexturePipelineContext({
        deps,
        pipeline,
        steps,
        includePreflight: Boolean(payload.preflight),
        includeUsage: Boolean(payload.preflight?.includeUsage)
      });

      if (!shouldPlanOnly && payload.assign && payload.assign.length > 0) {
        pipeline.require(runAssignStep(ctx, payload.assign, payload.ifRevision));
      }

      if (payload.preflight) {
        pipeline.require(runPreflightStep(ctx, 'before'));
      }

      if (!shouldPlanOnly) {
        const needsPreflight = Boolean(
          payload.preflight ||
            payload.uv ||
            (payload.textures && payload.textures.length > 0) ||
            (payload.presets && payload.presets.length > 0)
        );
        if (needsPreflight && !ctx.currentUvUsageId) {
          pipeline.require(runPreflightStep(ctx, 'before'));
        }

        if (payload.uv) {
          pipeline.require(runUvStep(ctx, payload.uv.assignments, payload.ifRevision));

          if (ctx.includePreflight) {
            pipeline.require(runPreflightStep(ctx, 'after'));
          }
        }

        const textures = payload.textures ?? [];
        const presets = payload.presets ?? [];
        if (textures.length > 0 || presets.length > 0) {
          if (!ctx.currentUvUsageId) {
            pipeline.require(runPreflightStep(ctx, 'before'));
          }
          const uvContext = ctx.preflightUsage
            ? pipeline.require(
                loadUvContext(deps.service, pipeline.meta, ctx.preflightUsage, {
                  cache: deps.cache?.uv,
                  expectedUvUsageId: ctx.currentUvUsageId
                })
              )
            : null;
          const targets = collectTextureTargets([...textures, ...presets]);
          const resolved = pipeline.require(
            resolveTextureUsageForTargets({
              deps,
              payload,
              meta: pipeline.meta,
              targets,
              uvUsageId: ctx.currentUvUsageId,
              usageOverride: ctx.preflightUsage,
              uvContext: uvContext ? { cubes: uvContext.cubes, resolution: uvContext.resolution } : undefined
            })
          );
          const usage = resolved.usage;
          const recovery = resolved.recovery;
          ctx.currentUvUsageId = resolved.uvUsageId;

          if (textures.length > 0) {
            pipeline.require(await runTextureApplyStep(ctx, textures, usage, recovery));
          }

          if (presets.length > 0) {
            pipeline.require(runPresetStep(ctx, presets, recovery, payload.ifRevision));
          }
        }
      }

      let previewData: PreviewStepData | null = null;
      if (payload.preview) {
        const previewRes = pipeline.require(runPreviewStep(deps.service, payload.preview, pipeline.meta));
        steps.preview = previewRes.structured;
        previewData = previewRes;
      }

      if (shouldPlanOnly) {
        const resultExtras: { applied: false; planOnly: true; uvUsageId?: string } = {
          applied: false,
          planOnly: true,
          ...(ctx.currentUvUsageId ? { uvUsageId: ctx.currentUvUsageId } : {})
        };
        const response = pipeline.ok(buildPipelineResult(steps, resultExtras));
        const nextActions = buildClarificationNextActions({ questions: clarificationQuestions });
        const extras = nextActions.length > 0 ? { nextActions } : {};
        return attachPreviewResponse({ ...response, ...extras }, previewData);
      }

      const resultExtras: { applied: true; uvUsageId?: string } = {
        applied: true,
        ...(ctx.currentUvUsageId ? { uvUsageId: ctx.currentUvUsageId } : {})
      };
      const response = pipeline.ok(buildPipelineResult(steps, resultExtras));

      const didPaint = Boolean(payload.textures?.length || payload.presets?.length);
      const didAssign = Boolean(payload.assign && payload.assign.length > 0);
      const didPreview = Boolean(payload.preview);

      const textureLabels = collectTextureLabels([...(payload.textures ?? []), ...(payload.presets ?? [])]);
      const nextActions = buildTexturePipelineNextActions({
        textureLabels,
        didPaint,
        didAssign,
        didPreview,
        assign: {
          includeAssignTool: false,
          includeGuide: true,
          priorityBase: 1
        },
        preview: {
          reason: TEXTURE_PREVIEW_VALIDATE_REASON,
          priorityBase: 10
        }
      });

      const extras = nextActions.length > 0 ? { nextActions } : {};
      return attachPreviewResponse({ ...response, ...extras }, previewData);
    }
  });
};
