import { buildRenderPreviewContent, buildRenderPreviewStructured } from '../mcp/content';
import type { McpContentBlock, ToolResponse } from '../types';
import { errFromDomain } from '../services/toolResponse';
import type { RenderPreviewPayload, RenderPreviewResult, RenderPreviewStructured } from '../types/preview';
import type { ToolService } from '../usecases/ToolService';
import type { MetaOptions } from './meta';
import { isUsecaseError, usecaseError } from './guardHelpers';

export type PreviewStepResult = {
  data: RenderPreviewResult;
  content: McpContentBlock[];
  structured: RenderPreviewStructured;
};

export type PreviewStepData = PreviewStepResult;

export const runPreviewStep = (
  service: ToolService,
  payload: RenderPreviewPayload,
  meta?: MetaOptions
): ToolResponse<PreviewStepResult> => {
  const previewRes = service.renderPreview(payload);
  if (isUsecaseError(previewRes)) {
    return meta ? usecaseError(previewRes, meta, service) : errFromDomain(previewRes.error);
  }
  const content = buildRenderPreviewContent(previewRes.value);
  const structured = buildRenderPreviewStructured(previewRes.value);
  return {
    ok: true,
    data: {
      data: previewRes.value,
      content,
      structured
    }
  };
};
