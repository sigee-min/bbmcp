import type { Logger } from '../logging';
import type { DomPort } from '../ports/dom';
import type { Limits, RenderPreviewPayload, RenderPreviewResult, ValidatePayload, ValidateResult } from '../types';
import type { ToolService } from '../usecases/ToolService';
import type {
  ApplyTextureSpecPayload,
  ApplyUvSpecPayload,
  EntityPipelinePayload,
  ModelPipelinePayload,
  TexturePipelinePayload
} from '../spec';
import type { EntityPipelineResult } from './entityPipeline/types';
import type { ModelPipelineResult } from './modelPipeline/types';
import type { ApplyTextureSpecResult, ApplyUvSpecResult, TexturePipelineResult } from './texturePipeline/types';
import type { ProxyPipelineCache } from './cache';

export type ProxyPipelineDeps = {
  service: ToolService;
  dom: DomPort;
  log: Logger;
  limits: Limits;
  includeStateByDefault: () => boolean;
  includeDiffByDefault: () => boolean;
  runWithoutRevisionGuard: <T>(fn: () => Promise<T> | T) => Promise<T>;
  cache?: ProxyPipelineCache;
};

export type ProxyToolPayloadMap = {
  apply_texture_spec: ApplyTextureSpecPayload;
  apply_uv_spec: ApplyUvSpecPayload;
  entity_pipeline: EntityPipelinePayload;
  model_pipeline: ModelPipelinePayload;
  texture_pipeline: TexturePipelinePayload;
  render_preview: RenderPreviewPayload;
  validate: ValidatePayload;
};

export type ProxyToolResultMap = {
  apply_texture_spec: ApplyTextureSpecResult;
  apply_uv_spec: ApplyUvSpecResult;
  entity_pipeline: EntityPipelineResult;
  model_pipeline: ModelPipelineResult;
  texture_pipeline: TexturePipelineResult;
  render_preview: RenderPreviewResult;
  validate: ValidateResult;
};
