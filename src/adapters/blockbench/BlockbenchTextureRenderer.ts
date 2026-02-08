import { TexturePixelData, TextureRenderResult, TextureRendererPort } from '../../ports/textureRenderer';
import { ToolError } from '@ashfox/contracts/types/internal';
import { readBlockbenchGlobals } from '../../types/blockbench';
import {
  ADAPTER_TEXTURE_RENDERER_DOCUMENT_UNAVAILABLE,
  TEXTURE_CANVAS_CONTEXT_UNAVAILABLE,
  TEXTURE_CANVAS_UNAVAILABLE
} from '../../shared/messages';

export class BlockbenchTextureRenderer implements TextureRendererPort {
  renderPixels(input: TexturePixelData): { result?: TextureRenderResult; error?: ToolError } {
    const doc = readBlockbenchGlobals().document;
    if (!doc?.createElement) {
      return { error: { code: 'not_implemented', message: ADAPTER_TEXTURE_RENDERER_DOCUMENT_UNAVAILABLE } };
    }
    const canvas = doc.createElement('canvas') as HTMLCanvasElement | null;
    if (!canvas) {
      return { error: { code: 'not_implemented', message: TEXTURE_CANVAS_UNAVAILABLE } };
    }
    canvas.width = input.width;
    canvas.height = input.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { error: { code: 'not_implemented', message: TEXTURE_CANVAS_CONTEXT_UNAVAILABLE } };
    }
    ctx.imageSmoothingEnabled = false;
    const imageData = ctx.createImageData(input.width, input.height);
    imageData.data.set(input.data);
    ctx.putImageData(imageData, 0, 0);
    return { result: { image: canvas, width: input.width, height: input.height } };
  }

  readPixels(input: {
    image: CanvasImageSource;
    width?: number;
    height?: number;
  }): { result?: { width: number; height: number; data: Uint8ClampedArray }; error?: ToolError } {
    const doc = readBlockbenchGlobals().document;
    if (!doc?.createElement) {
      return { error: { code: 'not_implemented', message: ADAPTER_TEXTURE_RENDERER_DOCUMENT_UNAVAILABLE } };
    }
    const width = Math.trunc(Number(input.width));
    const height = Math.trunc(Number(input.height));
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return { error: { code: 'invalid_payload', message: TEXTURE_CANVAS_UNAVAILABLE } };
    }
    const canvas = doc.createElement('canvas') as HTMLCanvasElement | null;
    if (!canvas) {
      return { error: { code: 'not_implemented', message: TEXTURE_CANVAS_UNAVAILABLE } };
    }
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { error: { code: 'not_implemented', message: TEXTURE_CANVAS_CONTEXT_UNAVAILABLE } };
    }
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(input.image, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    return { result: { width, height, data: new Uint8ClampedArray(imageData.data) } };
  }
}



