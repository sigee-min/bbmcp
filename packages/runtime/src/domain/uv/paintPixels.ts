import type { DomainResult } from '../result';
import type { UvPaintRect } from './paintTypes';
import { clamp } from '../math';
import { normalizeUvPaintRects, UvPaintRectMessages } from './paintRects';

export type UvPaintPixelMessages = {
  rectsRequired: (label: string) => string;
  sourceTargetPositive: (label: string) => string;
  sourceDataMismatch: (label: string) => string;
  rects: UvPaintRectMessages;
};

export type UvPaintPixelConfig = {
  rects: UvPaintRect[];
  mapping: 'stretch' | 'tile';
  padding: number;
  anchor: [number, number];
};

export const applyUvPaintPixels = (input: {
  source: { width: number; height: number; data: Uint8ClampedArray };
  target: { width: number; height: number };
  config: UvPaintPixelConfig;
  label: string;
  messages: UvPaintPixelMessages;
}): DomainResult<{ data: Uint8ClampedArray; rects: UvPaintRect[] }> => {
  const { source, target, config, label, messages } = input;
  if (!Array.isArray(config.rects) || config.rects.length === 0) {
    return err('invalid_payload', messages.rectsRequired(label));
  }
  const sourceWidth = Math.trunc(source.width);
  const sourceHeight = Math.trunc(source.height);
  const targetWidth = Math.trunc(target.width);
  const targetHeight = Math.trunc(target.height);
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
    return err('invalid_payload', messages.sourceTargetPositive(label));
  }
  if (source.data.length !== sourceWidth * sourceHeight * 4) {
    return err('invalid_payload', messages.sourceDataMismatch(label));
  }
  const normalized = normalizeUvPaintRects(
    config.rects,
    config.padding,
    targetWidth,
    targetHeight,
    label,
    messages.rects
  );
  if (!normalized.ok) return normalized;
  const rects = normalized.data;
  const out = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  const mapping = config.mapping ?? 'stretch';
  const anchor = Array.isArray(config.anchor) ? config.anchor : [0, 0];
  if (mapping === 'tile') {
    const [anchorX, anchorY] = anchor;
    rects.forEach((rect) => {
      const xStart = clamp(Math.floor(rect.x1), 0, targetWidth);
      const xEnd = clamp(Math.ceil(rect.x2), 0, targetWidth);
      const yStart = clamp(Math.floor(rect.y1), 0, targetHeight);
      const yEnd = clamp(Math.ceil(rect.y2), 0, targetHeight);
      for (let y = yStart; y < yEnd; y += 1) {
        const sy = mod(Math.floor(y - anchorY), sourceHeight);
        for (let x = xStart; x < xEnd; x += 1) {
          const sx = mod(Math.floor(x - anchorX), sourceWidth);
          copyPixel(source.data, sourceWidth, out, targetWidth, sx, sy, x, y);
        }
      }
    });
    return { ok: true, data: { data: out, rects } };
  }
  rects.forEach((rect) => {
    const rectWidth = rect.x2 - rect.x1;
    const rectHeight = rect.y2 - rect.y1;
    if (rectWidth <= 0 || rectHeight <= 0) return;
    const xStart = clamp(Math.floor(rect.x1), 0, targetWidth);
    const xEnd = clamp(Math.ceil(rect.x2), 0, targetWidth);
    const yStart = clamp(Math.floor(rect.y1), 0, targetHeight);
    const yEnd = clamp(Math.ceil(rect.y2), 0, targetHeight);
    for (let y = yStart; y < yEnd; y += 1) {
      const v = (y + 0.5 - rect.y1) / rectHeight;
      const sy = clamp(Math.floor(v * sourceHeight), 0, sourceHeight - 1);
      for (let x = xStart; x < xEnd; x += 1) {
        const u = (x + 0.5 - rect.x1) / rectWidth;
        const sx = clamp(Math.floor(u * sourceWidth), 0, sourceWidth - 1);
        copyPixel(source.data, sourceWidth, out, targetWidth, sx, sy, x, y);
      }
    }
  });
  return { ok: true, data: { data: out, rects } };
};

const copyPixel = (
  source: Uint8ClampedArray,
  sourceWidth: number,
  target: Uint8ClampedArray,
  targetWidth: number,
  sx: number,
  sy: number,
  tx: number,
  ty: number
) => {
  const sIdx = (sy * sourceWidth + sx) * 4;
  const tIdx = (ty * targetWidth + tx) * 4;
  target[tIdx] = source[sIdx];
  target[tIdx + 1] = source[sIdx + 1];
  target[tIdx + 2] = source[sIdx + 2];
  target[tIdx + 3] = source[sIdx + 3];
};

const mod = (value: number, modulus: number): number => {
  const result = value % modulus;
  return result < 0 ? result + modulus : result;
};

const err = (code: 'invalid_payload', message: string): DomainResult<never> => ({
  ok: false,
  error: { code, message }
});




