import { TextureOp, TextureSpec } from '../spec';
import { Limits, ToolResponse } from '../types';
import { TextureSource } from '../ports/editor';
import type { DomPort } from '../ports/dom';
import { err } from './response';
import { UvPaintRect } from './uvPaint';
import { checkDimensions, mapDimensionError } from '../domain/dimensions';
import { validateUvPaintSourceSize } from '../domain/uvPaintSource';
import { MAX_TEXTURE_OPS } from '../domain/textureOps';
import { normalizeTextureSpecSize } from '../domain/textureSpecValidation';
import { clamp } from '../domain/math';
import { normalizeUvPaintRects } from '../domain/uvPaintRects';
import {
  TEXTURE_BASE_IMAGE_UNAVAILABLE,
  TEXTURE_BASE_SIZE_UNAVAILABLE,
  TEXTURE_CANVAS_CONTEXT_UNAVAILABLE,
  TEXTURE_CANVAS_UNAVAILABLE,
  TEXTURE_DIMENSION_POSITIVE,
  TEXTURE_OPS_TOO_MANY,
  TEXTURE_OP_UNSUPPORTED,
  TEXTURE_SIZE_EXCEEDS_MAX,
  UV_PAINT_CANVAS_UNAVAILABLE,
  UV_PAINT_CONTEXT_UNAVAILABLE,
  UV_PAINT_PATTERN_UNAVAILABLE,
  UV_PAINT_RECTS_REQUIRED
} from '../shared/messages';

const IMAGE_LOAD_TIMEOUT_MS = 3000;

export type UvPaintRenderConfig = {
  rects: UvPaintRect[];
  mapping: 'stretch' | 'tile';
  padding: number;
  anchor: [number, number];
  source: { width: number; height: number };
};

export type TextureCoverage = {
  opaquePixels: number;
  totalPixels: number;
  opaqueRatio: number;
  bounds?: { x1: number; y1: number; x2: number; y2: number };
};

type RenderTextureResult = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  coverage?: TextureCoverage;
  paintCoverage?: TextureCoverage;
};

export const resolveTextureSpecSize = (
  spec: TextureSpec,
  base?: { width?: number; height?: number }
): { width?: number; height?: number } => {
  const resolved = normalizeTextureSpecSize(spec, base);
  if (!resolved.ok) {
    return { width: undefined, height: undefined };
  }
  return { width: resolved.data.width, height: resolved.data.height };
};

export const renderTextureSpec = (
  dom: DomPort,
  spec: TextureSpec,
  limits: Limits,
  base?: { image: CanvasImageSource; width: number; height: number },
  uvPaint?: UvPaintRenderConfig
): ToolResponse<RenderTextureResult> => {
  const label = spec?.name ?? spec?.targetName ?? spec?.targetId ?? 'texture';
  const sizeRes = normalizeTextureSpecSize(spec, base);
  if (!sizeRes.ok) {
    return err('invalid_payload', sizeRes.error.message);
  }
  const width = Number(sizeRes.data.width);
  const height = Number(sizeRes.data.height);
  const sizeCheck = checkDimensions(width, height, { requireInteger: false, maxSize: limits.maxTextureSize });
  const sizeMessage = mapDimensionError(sizeCheck, {
    nonPositive: (axis) => TEXTURE_DIMENSION_POSITIVE(axis, label),
    nonInteger: (axis) => TEXTURE_DIMENSION_POSITIVE(axis, label),
    exceedsMax: (maxSize) => TEXTURE_SIZE_EXCEEDS_MAX(maxSize || limits.maxTextureSize, label)
  });
  if (sizeMessage) {
    return err('invalid_payload', sizeMessage);
  }
  const canvas = dom.createCanvas();
  if (!canvas) return err('not_implemented', TEXTURE_CANVAS_UNAVAILABLE);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return err('not_implemented', TEXTURE_CANVAS_CONTEXT_UNAVAILABLE);
  ctx.imageSmoothingEnabled = false;
  const hasUvPaint = Boolean(uvPaint);
  if (!hasUvPaint && spec.background) {
    ctx.fillStyle = spec.background;
    ctx.fillRect(0, 0, width, height);
  }
  if (base?.image) {
    ctx.drawImage(base.image, 0, 0, width, height);
  }
  const ops = Array.isArray(spec.ops) ? spec.ops : [];
  if (ops.length > MAX_TEXTURE_OPS) {
    return err('invalid_payload', TEXTURE_OPS_TOO_MANY(MAX_TEXTURE_OPS, label));
  }
  let paintCoverage: TextureCoverage | undefined;
  if (uvPaint) {
    const sourceRes = validateUvPaintSourceSize(
      Number(uvPaint.source.width),
      Number(uvPaint.source.height),
      limits,
      label,
      { requireInteger: false }
    );
    if (!sourceRes.ok) {
      return err(sourceRes.error.code, sourceRes.error.message);
    }
    const sourceWidth = sourceRes.data.width;
    const sourceHeight = sourceRes.data.height;
    const patternCanvas = dom.createCanvas();
    if (!patternCanvas) return err('not_implemented', UV_PAINT_CANVAS_UNAVAILABLE);
    patternCanvas.width = sourceWidth;
    patternCanvas.height = sourceHeight;
    const patternCtx = patternCanvas.getContext('2d');
    if (!patternCtx) return err('not_implemented', UV_PAINT_CONTEXT_UNAVAILABLE);
    patternCtx.imageSmoothingEnabled = false;
    if (spec.background) {
      patternCtx.fillStyle = spec.background;
      patternCtx.fillRect(0, 0, sourceWidth, sourceHeight);
    }
    for (const op of ops) {
      const res = applyTextureOp(patternCtx, op);
      if (!res.ok) return res;
    }
    const paintRes = applyUvPaint(ctx, patternCanvas, uvPaint, width, height, label);
    if (!paintRes.ok) return paintRes;
    paintCoverage = analyzeTextureCoverageInRects(ctx, width, height, paintRes.data.rects) ?? undefined;
  } else {
    for (const op of ops) {
      const res = applyTextureOp(ctx, op);
      if (!res.ok) return res;
    }
  }
  const coverage = analyzeTextureCoverage(ctx, width, height);
  return {
    ok: true,
    data: {
      canvas,
      width,
      height,
      coverage: coverage ?? undefined,
      paintCoverage
    }
  };
};

export const resolveTextureBase = async (
  dom: DomPort,
  source: TextureSource
): Promise<ToolResponse<{ image: CanvasImageSource; width: number; height: number }>> => {
  let image = source.image ?? null;
  if (image && isHtmlImage(image)) {
    const ready = await ensureImageReady(image, IMAGE_LOAD_TIMEOUT_MS);
    if (!ready) {
      image = null;
    }
  }
  if (!image) {
    image = await loadImageFromDataUri(dom, source.dataUri);
  }
  if (!image) return err('not_implemented', TEXTURE_BASE_IMAGE_UNAVAILABLE);
  const width =
    typeof source.width === 'number' && Number.isFinite(source.width) && source.width > 0
      ? source.width
      : resolveImageDim(image, 'width');
  const height =
    typeof source.height === 'number' && Number.isFinite(source.height) && source.height > 0
      ? source.height
      : resolveImageDim(image, 'height');
  if (!width || !height) return err('invalid_payload', TEXTURE_BASE_SIZE_UNAVAILABLE);
  return { ok: true, data: { image, width, height } };
};

const applyTextureOp = (ctx: CanvasRenderingContext2D, op: TextureOp): ToolResponse<void> => {
  switch (op.op) {
    case 'set_pixel': {
      ctx.fillStyle = op.color;
      ctx.fillRect(op.x, op.y, 1, 1);
      return { ok: true, data: undefined };
    }
    case 'fill_rect': {
      ctx.fillStyle = op.color;
      ctx.fillRect(op.x, op.y, op.width, op.height);
      return { ok: true, data: undefined };
    }
    case 'draw_rect': {
      ctx.strokeStyle = op.color;
      ctx.lineWidth = isFiniteNumber(op.lineWidth) && op.lineWidth > 0 ? op.lineWidth : 1;
      ctx.strokeRect(op.x, op.y, op.width, op.height);
      return { ok: true, data: undefined };
    }
    case 'draw_line': {
      ctx.strokeStyle = op.color;
      ctx.lineWidth = isFiniteNumber(op.lineWidth) && op.lineWidth > 0 ? op.lineWidth : 1;
      ctx.beginPath();
      ctx.moveTo(op.x1, op.y1);
      ctx.lineTo(op.x2, op.y2);
      ctx.stroke();
      return { ok: true, data: undefined };
    }
    default:
      return err('invalid_payload', TEXTURE_OP_UNSUPPORTED);
  }
};

const applyUvPaint = (
  ctx: CanvasRenderingContext2D,
  patternCanvas: HTMLCanvasElement,
  config: UvPaintRenderConfig,
  width: number,
  height: number,
  label: string
): ToolResponse<{ rects: UvPaintRect[] }> => {
  if (!Array.isArray(config.rects) || config.rects.length === 0) {
    return err('invalid_payload', UV_PAINT_RECTS_REQUIRED(label));
  }
  const normalizedRes = normalizeUvPaintRects(config.rects, config.padding, width, height, label);
  if (!normalizedRes.ok) return err(normalizedRes.error.code, normalizedRes.error.message);
  const rects = normalizedRes.data;
  const mapping = config.mapping ?? 'stretch';
  if (mapping === 'tile') {
    const pattern = ctx.createPattern(patternCanvas, 'repeat');
    if (!pattern) return err('not_implemented', UV_PAINT_PATTERN_UNAVAILABLE(label));
    const [anchorX, anchorY] = config.anchor ?? [0, 0];
    rects.forEach((rect) => {
      const rectWidth = rect.x2 - rect.x1;
      const rectHeight = rect.y2 - rect.y1;
      if (rectWidth <= 0 || rectHeight <= 0) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x1, rect.y1, rectWidth, rectHeight);
      ctx.clip();
      ctx.translate(anchorX, anchorY);
      ctx.fillStyle = pattern;
      ctx.fillRect(rect.x1 - anchorX, rect.y1 - anchorY, rectWidth, rectHeight);
      ctx.restore();
    });
    return { ok: true, data: { rects } };
  }
  rects.forEach((rect) => {
    const rectWidth = rect.x2 - rect.x1;
    const rectHeight = rect.y2 - rect.y1;
    if (rectWidth <= 0 || rectHeight <= 0) return;
    ctx.drawImage(
      patternCanvas,
      0,
      0,
      patternCanvas.width,
      patternCanvas.height,
      rect.x1,
      rect.y1,
      rectWidth,
      rectHeight
    );
  });
  return { ok: true, data: { rects } };
};

const loadImageFromDataUri = async (dom: DomPort, dataUri?: string): Promise<CanvasImageSource | null> => {
  if (!dataUri) return null;
  const img = dom.createImage();
  if (!img) return null;
  img.src = dataUri;
  const ready = await ensureImageReady(img, IMAGE_LOAD_TIMEOUT_MS);
  return ready ? img : null;
};

const isHtmlImage = (value: CanvasImageSource): value is HTMLImageElement => {
  const candidate = value as { naturalWidth?: unknown; naturalHeight?: unknown };
  return typeof candidate.naturalWidth === 'number' || typeof candidate.naturalHeight === 'number';
};

const ensureImageReady = async (img: HTMLImageElement, timeoutMs: number): Promise<boolean> => {
  if (isImageReady(img)) return true;
  if (typeof img.decode === 'function') {
    try {
      await withTimeout(img.decode(), timeoutMs);
    } catch (err) {
      return waitForImageLoad(img, timeoutMs);
    }
    return isImageReady(img);
  }
  return waitForImageLoad(img, timeoutMs);
};

const isImageReady = (img: HTMLImageElement): boolean => {
  const width = img.naturalWidth ?? img.width ?? 0;
  const height = img.naturalHeight ?? img.height ?? 0;
  return img.complete && width > 0 && height > 0;
};

const waitForImageLoad = (img: HTMLImageElement, timeoutMs: number): Promise<boolean> =>
  new Promise((resolve) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      img.removeEventListener('load', onLoad);
      img.removeEventListener('error', onError);
      if (timer) {
        clearTimeout(timer);
      }
    };
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(ok);
    };
    const onLoad = () => finish(true);
    const onError = () => finish(false);
    img.addEventListener('load', onLoad);
    img.addEventListener('error', onError);
    timer = setTimeout(() => finish(false), timeoutMs);
  });

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });

const resolveImageDim = (image: CanvasImageSource, key: 'width' | 'height'): number => {
  const candidate = image as { width?: unknown; height?: unknown; naturalWidth?: unknown; naturalHeight?: unknown };
  const natural = key === 'width' ? candidate.naturalWidth : candidate.naturalHeight;
  const value = natural ?? candidate[key] ?? 0;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

const isFiniteNumber = (value: unknown): value is number => Number.isFinite(value);


const analyzeTextureCoverage = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): TextureCoverage | null => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  try {
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    const totalPixels = width * height;
    let opaquePixels = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha === 0) continue;
      opaquePixels += 1;
      const idx = i / 4;
      const x = idx % width;
      const y = Math.floor(idx / width);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const opaqueRatio = totalPixels > 0 ? opaquePixels / totalPixels : 0;
    const bounds =
      opaquePixels > 0
        ? { x1: minX, y1: minY, x2: maxX, y2: maxY }
        : undefined;
    return { opaquePixels, totalPixels, opaqueRatio, bounds };
  } catch (err) {
    return null;
  }
};

const analyzeTextureCoverageInRects = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rects: UvPaintRect[]
): TextureCoverage | null => {
  if (!Array.isArray(rects) || rects.length === 0) return null;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  try {
    const mask = new Uint8Array(width * height);
    rects.forEach((rect) => {
      const x1 = clamp(Math.floor(rect.x1), 0, width);
      const x2 = clamp(Math.ceil(rect.x2), 0, width);
      const y1 = clamp(Math.floor(rect.y1), 0, height);
      const y2 = clamp(Math.ceil(rect.y2), 0, height);
      if (x2 <= x1 || y2 <= y1) return;
      for (let y = y1; y < y2; y += 1) {
        const rowStart = y * width + x1;
        const rowEnd = rowStart + (x2 - x1);
        mask.fill(1, rowStart, rowEnd);
      }
    });
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    let totalPixels = 0;
    let opaquePixels = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let i = 0; i < mask.length; i += 1) {
      if (mask[i] === 0) continue;
      totalPixels += 1;
      const alpha = data[i * 4 + 3];
      if (alpha === 0) continue;
      opaquePixels += 1;
      const x = i % width;
      const y = Math.floor(i / width);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    if (totalPixels === 0) return null;
    const opaqueRatio = totalPixels > 0 ? opaquePixels / totalPixels : 0;
    const bounds =
      opaquePixels > 0
        ? { x1: minX, y1: minY, x2: maxX, y2: maxY }
        : undefined;
    return { opaquePixels, totalPixels, opaqueRatio, bounds };
  } catch (err) {
    return null;
  }
};
