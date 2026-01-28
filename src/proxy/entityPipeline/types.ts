import type { EnsureProjectResult } from '../../types';
import type { PipelineStepsResult } from '../pipelineResult';
import type { ApplyReport } from '../apply';
import type { AppliedReport, ModelPlan } from '../modelPipeline/types';
import type { EntityFormat, GeckoLibTargetVersion } from '../../shared/toolConstants';

export type EntityModelResult = {
  applied: true;
  plan: ModelPlan['summary'];
  report: AppliedReport;
  warnings?: string[];
};

export type EntityTextureResult = {
  applied: true;
  report: ApplyReport;
  recovery?: Record<string, unknown>;
  uvUsageId?: string;
};

export type EntityAnimationResult = {
  applied: true;
  clips: string[];
  keyframes: number;
};

export type EntityPipelineSteps = {
  project?: EnsureProjectResult;
  model?: EntityModelResult;
  textures?: EntityTextureResult;
  animations?: EntityAnimationResult;
};

export type EntityPipelineResult = PipelineStepsResult<
  EntityPipelineSteps,
  { applied: boolean; planOnly?: boolean; format: EntityFormat; targetVersion: GeckoLibTargetVersion }
>;
