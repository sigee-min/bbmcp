import type { McpContentBlock, ToolResponse } from '../types';
import type { RenderPreviewResult, RenderPreviewStructured } from '../types/preview';

export const attachPreviewResponse = <T>(
  response: ToolResponse<T>,
  preview: { content: McpContentBlock[]; structured: RenderPreviewStructured; data: RenderPreviewResult } | null
): ToolResponse<T> => {
  if (!preview) return response;
  if (!response.ok) return response;
  const content = preview.content;
  return {
    ...response,
    ...(content.length > 0 ? { content } : {}),
    structuredContent: preview.structured
  };
};
