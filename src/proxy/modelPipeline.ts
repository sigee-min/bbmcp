import type { ModelPipelinePayload } from '../spec';
import type { ToolResponse } from '../types';
import { validateModelPipeline } from './validators';
import type { ProxyPipelineDeps } from './types';
import { applyPlanOps } from './modelPipeline/modelApplier';
import type { ModelPipelineResult, ModelPipelineSteps } from './modelPipeline/types';
import { buildClarificationNextActions, buildModelPipelineNextActions } from './nextActionHelpers';
import { ensureProjectAndLoadProject, resolveEnsureProjectPayload } from './ensureProject';
import { runPreviewStep, type PreviewStepData } from './previewStep';
import { buildModelPlanStep } from './modelPipeline/modelStep';
import { attachPreviewResponse } from './previewResponse';
import { buildPipelineResult } from './pipelineResult';
import { runProxyPipeline } from './pipelineRunner';
import { getModelClarificationQuestions } from './clarifications';

export const modelPipelineProxy = async (
  deps: ProxyPipelineDeps,
  payload: ModelPipelinePayload
): Promise<ToolResponse<ModelPipelineResult>> => {
  let clarificationQuestions: string[] = [];
  let shouldPlanOnly = false;
  return runProxyPipeline<ModelPipelinePayload, ModelPipelineResult>(deps, payload, {
    validate: validateModelPipeline,
    guard: (pipeline) => {
      clarificationQuestions = getModelClarificationQuestions(payload.model);
      shouldPlanOnly = Boolean(payload.planOnly) || clarificationQuestions.length > 0;
      return shouldPlanOnly ? null : pipeline.guardRevision();
    },
    run: async (pipeline) => {
      const steps: ModelPipelineSteps = {};
      let effectiveRevision = pipeline.meta.ifRevision;

      const ensurePayload = resolveEnsureProjectPayload(payload.ensureProject, {}, effectiveRevision);
      const projectRes = pipeline.require(
        ensureProjectAndLoadProject({
          service: deps.service,
          meta: pipeline.meta,
          ensurePayload,
          detail: 'full',
          includeUsage: false,
          refreshRevision: Boolean(ensurePayload)
        })
      );
      if (projectRes.ensure) {
        steps.ensureProject = projectRes.ensure;
      }
      const project = projectRes.project;
      if (projectRes.revision) effectiveRevision = projectRes.revision;

      const mode = payload.mode ?? 'merge';
      const planRes = pipeline.require(
        buildModelPlanStep({
          service: deps.service,
          meta: pipeline.meta,
          model: payload.model,
          existingBones: project.bones ?? [],
          existingCubes: project.cubes ?? [],
          mode,
          deleteOrphans: payload.deleteOrphans ?? mode === 'replace',
          limits: deps.limits
        })
      );
      if (planRes.warnings.length > 0) {
        steps.warnings = planRes.warnings;
      }
      steps.plan = planRes.plan.summary;

      if (shouldPlanOnly) {
        steps.planOps = planRes.ops;
        const response = pipeline.ok(
          buildPipelineResult(steps, { plan: planRes.plan, planOnly: true, applied: false })
        );
        const nextActions = [
          ...buildClarificationNextActions({ questions: clarificationQuestions }),
          ...buildModelPipelineNextActions({
            warnings: steps.warnings,
            includeValidate: false,
            includePreview: false
          })
        ];
        return nextActions.length > 0 ? { ...response, nextActions } : response;
      }

      const applied = pipeline.require(
        applyPlanOps(planRes.ops, {
          service: deps.service,
          ifRevision: effectiveRevision,
          meta: pipeline.meta
        })
      );
      steps.apply = applied;

      let previewData: PreviewStepData | null = null;
      if (payload.preview) {
        const previewRes = pipeline.require(runPreviewStep(deps.service, payload.preview, pipeline.meta));
        previewData = previewRes;
        steps.preview = previewRes.structured;
      }

      if (payload.validate) {
        const validateRes = pipeline.wrapRequire(deps.service.validate({}));
        steps.validate = validateRes;
      }

      if (payload.export) {
        const exportRes = pipeline.require(
          pipeline.wrap(
            deps.service.exportModel({
              format: payload.export.format,
              destPath: payload.export.destPath
            })
          )
        );
        steps.export = exportRes;
      }

      const response = pipeline.ok(buildPipelineResult(steps, { report: applied, applied: true }));

      const nextActions = buildModelPipelineNextActions({
        warnings: steps.warnings,
        includeValidate: !payload.validate,
        includePreview: !payload.preview
      });
      const extras = nextActions.length > 0 ? { nextActions } : {};
      return attachPreviewResponse({ ...response, ...extras }, previewData);
    }
  });
};
