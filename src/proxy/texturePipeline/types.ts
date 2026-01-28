import type { ApplyReport } from '../apply';
import type { GenerateTexturePresetResult, PreflightTextureResult } from '../../types';
import type { RenderPreviewStructured } from '../../types/preview';
import type { PipelineStepsResult } from '../pipelineResult';

export type TexturePipelineSteps = {
  assign?: { applied: number; results: Array<{ textureId?: string; textureName: string; cubeCount: number; faces?: string[] }> };
  preflight?: { before?: PreflightTextureResult; after?: PreflightTextureResult };
  uv?: { applied: true; cubes: number; faces: number; uvUsageId: string };
  textures?: { applied: true; report: ApplyReport; recovery?: Record<string, unknown>; uvUsageId?: string };
  presets?: { applied: number; results: GenerateTexturePresetResult[]; recovery?: Record<string, unknown>; uvUsageId?: string };
  preview?: RenderPreviewStructured;
};

export type ApplyUvSpecResult = {
  applied: true;
  cubes: number;
  faces: number;
  uvUsageId: string;
};

export type ApplyTextureSpecResult = {
  applied: true;
  report: ApplyReport;
  recovery?: Record<string, unknown>;
  uvUsageId?: string;
};

export type TexturePipelineResult = PipelineStepsResult<
  TexturePipelineSteps,
  { applied: boolean; planOnly?: boolean; uvUsageId?: string }
>;
