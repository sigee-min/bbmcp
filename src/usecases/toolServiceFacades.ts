import type { ToolServiceContext } from './toolServiceContext';
import type { AnimationService } from './AnimationService';
import type { BlockPipelineService } from './BlockPipelineService';
import type { ExportService } from './ExportService';
import type { ModelService } from './ModelService';
import type { ProjectService } from './ProjectService';
import type { RenderService } from './RenderService';
import type { TextureService } from './TextureService';
import type { ValidationService } from './ValidationService';

export type ToolServiceFacades = {
  project: ProjectService;
  texture: TextureService;
  animation: AnimationService;
  model: ModelService;
  exporter: ExportService;
  render: RenderService;
  validation: ValidationService;
  blockPipeline: BlockPipelineService;
};

export const createToolServiceFacades = (context: ToolServiceContext): ToolServiceFacades => ({
  project: context.projectService,
  texture: context.textureService,
  animation: context.animationService,
  model: context.modelService,
  exporter: context.exportService,
  render: context.renderService,
  validation: context.validationService,
  blockPipeline: context.blockPipelineService
});
