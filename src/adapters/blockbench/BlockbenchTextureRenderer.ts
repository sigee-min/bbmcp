import { TexturePixelData, TextureRenderResult, TextureRendererPort } from '../../ports/textureRenderer';
import { ToolError } from '../../types';
import { readBlockbenchGlobals } from '../../types/blockbench';

export class BlockbenchTextureRenderer implements TextureRendererPort {
  renderPixels(input: TexturePixelData): { result?: TextureRenderResult; error?: ToolError } {
    const doc = readBlockbenchGlobals().document;
    if (!doc?.createElement) {
      return { error: { code: 'not_implemented', message: 'document unavailable for texture rendering' } };
    }
    const canvas = doc.createElement('canvas') as HTMLCanvasElement | null;
    if (!canvas) {
      return { error: { code: 'not_implemented', message: 'texture canvas not available' } };
    }
    canvas.width = input.width;
    canvas.height = input.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { error: { code: 'not_implemented', message: 'texture canvas context not available' } };
    }
    ctx.imageSmoothingEnabled = false;
    const imageData = ctx.createImageData(input.width, input.height);
    imageData.data.set(input.data);
    ctx.putImageData(imageData, 0, 0);
    return { result: { image: canvas, width: input.width, height: input.height } };
  }
}
