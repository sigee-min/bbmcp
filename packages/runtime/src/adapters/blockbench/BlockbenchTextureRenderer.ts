import { TexturePixelData, TextureRenderResult, TextureRendererPort } from '../../ports/textureRenderer';
import { ToolError } from '@ashfox/contracts/types/internal';
import { readBlockbenchGlobals, readOffscreenCanvasCtor } from '../../types/blockbench';
import {
  ADAPTER_TEXTURE_RENDERER_DOCUMENT_UNAVAILABLE,
  TEXTURE_CANVAS_CONTEXT_UNAVAILABLE,
  TEXTURE_CANVAS_UNAVAILABLE
} from '../../shared/messages';

type Canvas2DContextLike = {
  imageSmoothingEnabled: boolean;
  createImageData: (width: number, height: number) => ImageData;
  putImageData: (imageData: ImageData, dx: number, dy: number) => void;
  clearRect: (x: number, y: number, width: number, height: number) => void;
  drawImage: (image: CanvasImageSource, dx: number, dy: number, dWidth: number, dHeight: number) => void;
  getImageData: (sx: number, sy: number, sw: number, sh: number) => ImageData;
};

type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

export class BlockbenchTextureRenderer implements TextureRendererPort {
  renderPixels(input: TexturePixelData): { result?: TextureRenderResult; error?: ToolError } {
    const canvas = createCanvas(input.width, input.height);
    if (!canvas) {
      return { error: { code: 'invalid_state', message: ADAPTER_TEXTURE_RENDERER_DOCUMENT_UNAVAILABLE } };
    }
    const context = canvas.getContext('2d');
    if (!isCanvas2DContextLike(context)) {
      return { error: { code: 'invalid_state', message: TEXTURE_CANVAS_CONTEXT_UNAVAILABLE } };
    }
    const ctx = context;
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
    const width = Math.trunc(Number(input.width));
    const height = Math.trunc(Number(input.height));
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return { error: { code: 'invalid_payload', message: TEXTURE_CANVAS_UNAVAILABLE } };
    }
    const canvas = createCanvas(width, height);
    if (!canvas) {
      return { error: { code: 'invalid_state', message: ADAPTER_TEXTURE_RENDERER_DOCUMENT_UNAVAILABLE } };
    }
    const context = canvas.getContext('2d');
    if (!isCanvas2DContextLike(context)) {
      return { error: { code: 'invalid_state', message: TEXTURE_CANVAS_CONTEXT_UNAVAILABLE } };
    }
    const ctx = context;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(input.image, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    return { result: { width, height, data: new Uint8ClampedArray(imageData.data) } };
  }
}

const createCanvas = (width: number, height: number): CanvasLike | null => {
  const globals = readBlockbenchGlobals();
  const doc = globals.document;
  if (doc?.createElement) {
    const created = doc.createElement('canvas') as HTMLCanvasElement | null;
    if (created) {
      created.width = width;
      created.height = height;
      return created;
    }
  }
  const offscreenCtor = readOffscreenCanvasCtor();
  if (!offscreenCtor) return null;
  try {
    return new offscreenCtor(width, height);
  } catch (_err) {
    return null;
  }
};

const isCanvas2DContextLike = (value: unknown): value is Canvas2DContextLike => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as {
    createImageData?: unknown;
    putImageData?: unknown;
    clearRect?: unknown;
    drawImage?: unknown;
    getImageData?: unknown;
  };
  return (
    typeof candidate.createImageData === 'function' &&
    typeof candidate.putImageData === 'function' &&
    typeof candidate.clearRect === 'function' &&
    typeof candidate.drawImage === 'function' &&
    typeof candidate.getImageData === 'function'
  );
};
