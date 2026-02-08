import { McpContentBlock, ReadTextureResult, RenderPreviewResult } from '@ashfox/contracts/types/internal';
import type { RenderPreviewStructured } from '@ashfox/contracts/types/preview';

export const buildRenderPreviewContent = (result: RenderPreviewResult): McpContentBlock[] => {
  if (result.kind === 'single' && result.image) {
    const content = imageContentFromDataUri(result.image.dataUri, result.image.mime);
    return content ? [content] : [];
  }
  if (result.kind === 'sequence' && result.frames?.length) {
    const frames: McpContentBlock[] = [];
    for (const frame of result.frames) {
      const content = imageContentFromDataUri(frame.dataUri, frame.mime);
      if (content) frames.push(content);
    }
    return frames;
  }
  return [];
};

export const buildRenderPreviewStructured = (result: RenderPreviewResult): RenderPreviewStructured => {
  const image = result.image ? omitDataUri(result.image) : undefined;
  const frames = result.frames ? result.frames.map((frame) => omitDataUri(frame)) : undefined;
  return {
    kind: result.kind,
    frameCount: result.frameCount,
    ...(image ? { image } : {}),
    ...(frames ? { frames } : {}),
    ...(result.saved ? { saved: result.saved } : {})
  };
};

export const buildTextureContent = (result: ReadTextureResult): McpContentBlock[] => {
  const content = imageContentFromDataUri(result.texture.dataUri, result.texture.mimeType);
  return content ? [content] : [];
};

export const buildTextureStructured = (result: ReadTextureResult): Record<string, unknown> => ({
  texture: omitDataUri(result.texture),
  ...(result.saved ? { saved: result.saved } : {})
});

const omitDataUri = <T extends { dataUri: string }>(item: T): Omit<T, 'dataUri'> => {
  const { dataUri, ...rest } = item;
  return { ...rest };
};

const imageContentFromDataUri = (dataUri: string, mimeType: string): McpContentBlock | null => {
  const base64 = extractBase64FromDataUri(dataUri);
  if (!base64) return null;
  return { type: 'image', data: base64, mimeType };
};

const extractBase64FromDataUri = (dataUri: string): string | null => {
  const raw = String(dataUri ?? '');
  const comma = raw.indexOf(',');
  if (comma === -1) return null;
  return raw.slice(comma + 1).trim();
};




