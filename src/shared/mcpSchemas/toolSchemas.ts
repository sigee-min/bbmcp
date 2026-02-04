import type { JsonSchema } from './types';
import { baseToolSchemas } from './toolSchemas/base';
import { projectToolSchemas } from './toolSchemas/projects';
import { textureToolSchemas } from './toolSchemas/textures';
import { modelToolSchemas } from './toolSchemas/models';
import { previewToolSchemas } from './toolSchemas/preview';
import { animationToolSchemas } from './toolSchemas/animations';

export const toolSchemas: Record<string, JsonSchema> = {
  ...baseToolSchemas,
  ...projectToolSchemas,
  ...textureToolSchemas,
  ...animationToolSchemas,
  ...modelToolSchemas,
  ...previewToolSchemas
};
