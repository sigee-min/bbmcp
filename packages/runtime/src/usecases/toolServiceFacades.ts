import type { ToolServiceContext } from './toolServiceContext';
import type { ExportService } from './ExportService';
import type { ModelService } from './ModelService';
import type { ProjectService } from './ProjectService';
import type { RenderService } from './RenderService';
import type { TextureService } from './TextureService';
import type { ValidationService } from './ValidationService';
import type { AnimationService } from './AnimationService';

export type ToolServiceFacades = {
  project: ProjectService;
  texture: TextureService;
  model: ModelService;
  animation: AnimationService;
  exporter: ExportService;
  render: RenderService;
  validation: ValidationService;
};

export const createToolServiceFacades = (context: ToolServiceContext): ToolServiceFacades => ({
  project: context.projectService,
  texture: context.textureService,
  model: context.modelService,
  animation: context.animationService,
  exporter: context.exportService,
  render: context.renderService,
  validation: context.validationService
});


