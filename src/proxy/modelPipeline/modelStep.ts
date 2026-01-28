import type { ModelSpec } from '../../spec';
import type { Limits, ToolError, ToolResponse } from '../../types';
import type { ToolService } from '../../usecases/ToolService';
import type { MetaOptions } from '../meta';
import { errorWithMeta } from '../guardHelpers';
import { applyPlanOps } from './modelApplier';
import { buildPlan, sortOps } from './modelPlanner';
import { normalizeModelSpec } from './modelNormalizer';
import type { AppliedReport, ExistingBone, ExistingCube, ModelPlan, NormalizedModel, PlanOp } from './types';

export type ModelPlanStepResult = {
  normalized: NormalizedModel;
  warnings: string[];
  plan: ModelPlan;
  ops: PlanOp[];
};

export type ModelApplyStepResult = {
  plan: ModelPlan;
  ops: PlanOp[];
  report: AppliedReport;
  warnings: string[];
};

export const buildModelPlanStep = (args: {
  service: ToolService;
  meta: MetaOptions;
  model: ModelSpec;
  existingBones: ExistingBone[];
  existingCubes: ExistingCube[];
  mode: 'create' | 'merge' | 'replace' | 'patch';
  deleteOrphans: boolean;
  limits: Limits;
}): ToolResponse<ModelPlanStepResult> => {
  const failWithMeta = (error: ToolError) => errorWithMeta(error, args.meta, args.service);
  const normalized = normalizeModelSpec(args.model, args.limits.maxCubes);
  if (!normalized.ok) return failWithMeta(normalized.error);

  const planRes = buildPlan(
    normalized.data,
    args.existingBones,
    args.existingCubes,
    args.mode,
    args.deleteOrphans
  );
  if (!planRes.ok) return failWithMeta(planRes.error);

  const ops = sortOps(planRes.data.ops, normalized.data.bones);
  return {
    ok: true,
    data: {
      normalized: normalized.data,
      warnings: normalized.data.warnings,
      plan: planRes.data,
      ops
    }
  };
};

export const applyModelPlanStep = (args: {
  service: ToolService;
  meta: MetaOptions;
  model: ModelSpec;
  existingBones: ExistingBone[];
  existingCubes: ExistingCube[];
  mode: 'create' | 'merge' | 'replace' | 'patch';
  deleteOrphans: boolean;
  limits: Limits;
  ifRevision?: string;
}): ToolResponse<ModelApplyStepResult> => {
  const planRes = buildModelPlanStep(args);
  if (!planRes.ok) return planRes;
  const applyRes = applyPlanOps(planRes.data.ops, {
    service: args.service,
    ifRevision: args.ifRevision,
    meta: args.meta
  });
  if (!applyRes.ok) return applyRes;
  return {
    ok: true,
    data: {
      plan: planRes.data.plan,
      ops: planRes.data.ops,
      report: applyRes.data,
      warnings: planRes.data.warnings
    }
  };
};
