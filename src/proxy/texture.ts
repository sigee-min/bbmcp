import { TextureOp, TextureSpec } from '../spec';
import { Limits, ToolResponse } from '../types';
import { TextureSource } from '../ports/editor';
import { readBlockbenchGlobals } from '../types/blockbench';
import { err } from './response';

export const renderTextureSpec = (
  spec: TextureSpec,
  limits: Limits,
  base?: { image: CanvasImageSource; width: number; height: number }
): ToolResponse<{ dataUri: string }> => {
  const label = spec?.name ?? spec?.targetName ?? spec?.targetId ?? 'texture';
  const width = Number.isFinite(spec.width) ? spec.width : base?.width;
  const height = Number.isFinite(spec.height) ? spec.height : base?.height;
  if (!Number.isFinite(width) || width <= 0) {
    return err('invalid_payload', `texture width must be > 0 (${label})`);
  }
  if (!Number.isFinite(height) || height <= 0) {
    return err('invalid_payload', `texture height must be > 0 (${label})`);
  }
  if (width > limits.maxTextureSize || height > limits.maxTextureSize) {
    return err('invalid_payload', `texture size exceeds max ${limits.maxTextureSize} (${label})`);
  }
  const doc = readBlockbenchGlobals().document;
  if (!doc?.createElement) {
    return err('not_implemented', 'document unavailable for texture rendering');
  }
  const canvas = doc.createElement('canvas') as HTMLCanvasElement | null;
  if (!canvas) return err('not_implemented', 'texture canvas not available');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return err('not_implemented', 'texture canvas context not available');
  ctx.imageSmoothingEnabled = false;
  if (spec.background) {
    ctx.fillStyle = spec.background;
    ctx.fillRect(0, 0, width, height);
  }
  if (base?.image) {
    ctx.drawImage(base.image, 0, 0, width, height);
  }
  for (const op of spec.ops ?? []) {
    const res = applyTextureOp(ctx, op);
    if (!res.ok) return res;
  }
  const dataUri = canvas.toDataURL('image/png');
  return { ok: true, data: { dataUri } };
};

export const resolveTextureBase = (
  source: TextureSource
): ToolResponse<{ image: CanvasImageSource; width: number; height: number }> => {
  const image = source.image ?? loadImageFromDataUri(source.dataUri);
  if (!image) return err('not_implemented', 'Texture base image unavailable');
  const width = Number.isFinite(source.width) && source.width > 0 ? source.width : resolveImageDim(image, 'width');
  const height = Number.isFinite(source.height) && source.height > 0 ? source.height : resolveImageDim(image, 'height');
  if (!width || !height) return err('invalid_payload', 'Texture base size unavailable');
  return { ok: true, data: { image, width, height } };
};

const applyTextureOp = (ctx: CanvasRenderingContext2D, op: TextureOp): ToolResponse<unknown> => {
  switch (op.op) {
    case 'set_pixel': {
      ctx.fillStyle = op.color;
      ctx.fillRect(op.x, op.y, 1, 1);
      return { ok: true, data: { ok: true } };
    }
    case 'fill_rect': {
      ctx.fillStyle = op.color;
      ctx.fillRect(op.x, op.y, op.width, op.height);
      return { ok: true, data: { ok: true } };
    }
    case 'draw_rect': {
      ctx.strokeStyle = op.color;
      ctx.lineWidth = isFiniteNumber(op.lineWidth) && op.lineWidth > 0 ? op.lineWidth : 1;
      ctx.strokeRect(op.x, op.y, op.width, op.height);
      return { ok: true, data: { ok: true } };
    }
    case 'draw_line': {
      ctx.strokeStyle = op.color;
      ctx.lineWidth = isFiniteNumber(op.lineWidth) && op.lineWidth > 0 ? op.lineWidth : 1;
      ctx.beginPath();
      ctx.moveTo(op.x1, op.y1);
      ctx.lineTo(op.x2, op.y2);
      ctx.stroke();
      return { ok: true, data: { ok: true } };
    }
    default:
      return err('invalid_payload', `unsupported texture op: ${op.op}`);
  }
};

const loadImageFromDataUri = (dataUri?: string): CanvasImageSource | null => {
  if (!dataUri) return null;
  const doc = readBlockbenchGlobals().document;
  if (!doc?.createElement) return null;
  const img = doc.createElement('img') as HTMLImageElement | null;
  if (!img) return null;
  img.src = dataUri;
  const width = img.naturalWidth ?? img.width ?? 0;
  const height = img.naturalHeight ?? img.height ?? 0;
  if (!img.complete || !width || !height) return null;
  return img;
};

const resolveImageDim = (image: CanvasImageSource, key: 'width' | 'height'): number => {
  const candidate = image as { width?: unknown; height?: unknown; naturalWidth?: unknown; naturalHeight?: unknown };
  const natural = key === 'width' ? candidate.naturalWidth : candidate.naturalHeight;
  const value = natural ?? candidate[key] ?? 0;
  return Number.isFinite(value) ? value : 0;
};

const isFiniteNumber = (value: unknown): value is number => Number.isFinite(value);
