import { EntityPipelinePayload } from '../spec';
import { collectTextureTargets } from '../domain/uvTargets';
import { applyTextureSpecSteps, createApplyReport } from './apply';
import { buildPipelineResult } from './pipelineResult';
import { validateEntityPipeline } from './validators';
import { resolveTextureUsageForTargets } from './texturePipeline/usageResolver';
import type { ProxyPipelineDeps } from './types';
import type { ToolResponse } from '../types';
import { err } from '../services/toolResponse';
import { applyModelPlanStep } from './modelPipeline/modelStep';
import { ensureProjectAndLoadProject, resolveEnsureProjectPayload, requireProjectFormat } from './ensureProject';
import { applyEntityAnimations } from './animationStep';
import type { EntityPipelineResult, EntityPipelineSteps } from './entityPipeline/types';
import { runProxyPipeline } from './pipelineRunner';
import { PROXY_FORMAT_NOT_IMPLEMENTED } from '../shared/messages';
import { buildClarificationNextActions } from './nextActionHelpers';
import { getEntityPipelineClarificationQuestions } from './clarifications';

export const entityPipelineProxy = async (
  deps: ProxyPipelineDeps,
  payload: EntityPipelinePayload
): Promise<ToolResponse<EntityPipelineResult>> => {
  let clarificationQuestions: string[] = [];
  let shouldPlanOnly = false;
  return runProxyPipeline(deps, payload, {
    validate: (payloadValue, limits) => {
      const v = validateEntityPipeline(payloadValue, limits);
      if (!v.ok) return v;
      if (payloadValue.format !== 'geckolib') {
        return err('not_implemented', PROXY_FORMAT_NOT_IMPLEMENTED(payloadValue.format));
      }
      return v;
    },
    guard: (pipeline) => {
      clarificationQuestions = getEntityPipelineClarificationQuestions(payload);
      shouldPlanOnly = Boolean(payload.planOnly) || clarificationQuestions.length > 0;
      return shouldPlanOnly ? null : pipeline.guardRevision();
    },
    run: async (pipeline) => {
      const steps: EntityPipelineSteps = {};
      const format = payload.format;
      const targetVersion = payload.targetVersion ?? 'v4';

      if (shouldPlanOnly) {
        const response = pipeline.ok(
          buildPipelineResult(steps, { applied: false, planOnly: true, format, targetVersion })
        );
        const nextActions = buildClarificationNextActions({ questions: clarificationQuestions });
        return nextActions.length > 0 ? { ...response, nextActions } : response;
      }

      let effectiveRevision = payload.ifRevision;
      const ensurePayload = resolveEnsureProjectPayload(
        payload.ensureProject,
        { format: 'geckolib' },
        effectiveRevision
      );
      const needsFull = Boolean(payload.model || (payload.animations && payload.animations.length > 0));
      const stateRes = pipeline.require(
        ensureProjectAndLoadProject({
          service: deps.service,
          meta: pipeline.meta,
          ensurePayload,
          detail: needsFull ? 'full' : 'summary',
          includeUsage: false,
          refreshRevision: Boolean(ensurePayload)
        })
      );
      if (stateRes.ensure) {
        steps.project = stateRes.ensure;
      }
      if (stateRes.revision) effectiveRevision = stateRes.revision;
      const formatError = requireProjectFormat(
        stateRes.project.format,
        'geckolib',
        pipeline.meta,
        deps.service,
        'entity_pipeline'
      );
      if (formatError) pipeline.require(formatError);
      if (payload.model) {
        const project = stateRes.project;
        const applyRes = pipeline.require(
          applyModelPlanStep({
            service: deps.service,
            meta: pipeline.meta,
            model: payload.model,
            existingBones: project.bones ?? [],
            existingCubes: project.cubes ?? [],
            mode: 'merge',
            deleteOrphans: false,
            limits: deps.limits,
            ifRevision: effectiveRevision
          })
        );
        steps.model = {
          applied: true,
          plan: applyRes.plan.summary,
          report: applyRes.report,
          ...(applyRes.warnings.length > 0 ? { warnings: applyRes.warnings } : {})
        };
      }
      if (payload.textures && payload.textures.length > 0) {
        const targets = collectTextureTargets(payload.textures);
        const resolved = pipeline.require(
          resolveTextureUsageForTargets({
            deps,
            payload,
            meta: pipeline.meta,
            targets,
            uvUsageId: payload.uvUsageId
          })
        );
        const usage = resolved.usage;
        const recovery = resolved.recovery;
        const recoveredUvUsageId = resolved.uvUsageId;
        const report = createApplyReport();
        pipeline.require(
          await applyTextureSpecSteps(
            deps.service,
            deps.dom,
            deps.limits,
            payload.textures,
            report,
            pipeline.meta,
            deps.log,
            usage
          )
        );
        steps.textures = {
          applied: true,
          report,
          ...(recovery
            ? {
                recovery,
                uvUsageId: recoveredUvUsageId
              }
            : {})
        };
      }
      if (payload.animations && payload.animations.length > 0) {
        const animRes = pipeline.require(
          applyEntityAnimations(
            deps.service,
            pipeline.meta,
            payload.animations,
            effectiveRevision,
            stateRes.project
          )
        );
        steps.animations = { applied: true, clips: animRes.clips, keyframes: animRes.keyframes };
      }
      const extras: { applied: true; format: typeof format; targetVersion: typeof targetVersion } = {
        applied: true,
        format,
        targetVersion
      };
      const result = buildPipelineResult(steps, extras);
      return pipeline.ok(result);
    }
  });
};
