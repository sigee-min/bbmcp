import type { TextureOpLike } from '../../domain/textureOps';

export type Rect = { x1: number; y1: number; x2: number; y2: number };

export type OpBounds = { x1: number; y1: number; x2: number; y2: number };

export const mergeRects = (rects: Rect[]): Rect | null => {
  if (!Array.isArray(rects) || rects.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  rects.forEach((rect) => {
    minX = Math.min(minX, rect.x1);
    minY = Math.min(minY, rect.y1);
    maxX = Math.max(maxX, rect.x2);
    maxY = Math.max(maxY, rect.y2);
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
  return { x1: minX, y1: minY, x2: maxX, y2: maxY };
};

export const getRectSpan = (min: number, max: number): number => {
  const span = Math.ceil(max - min);
  return Number.isFinite(span) && span > 0 ? span : 1;
};

export const getTextureOpBounds = (op: TextureOpLike): OpBounds => {
  switch (op.op) {
    case 'set_pixel': {
      const x = Math.round(op.x);
      const y = Math.round(op.y);
      return { x1: x, y1: y, x2: x + 1, y2: y + 1 };
    }
    case 'fill_rect':
    case 'draw_rect':
      return {
        x1: Math.min(op.x, op.x + op.width),
        y1: Math.min(op.y, op.y + op.height),
        x2: Math.max(op.x, op.x + op.width),
        y2: Math.max(op.y, op.y + op.height)
      };
    case 'draw_line': {
      const lineWidth = Math.max(1, Math.trunc(op.lineWidth ?? 1));
      const radius = Math.max(0, Math.floor(lineWidth / 2));
      return {
        x1: Math.min(op.x1, op.x2) - radius,
        y1: Math.min(op.y1, op.y2) - radius,
        x2: Math.max(op.x1, op.x2) + radius + 1,
        y2: Math.max(op.y1, op.y2) + radius + 1
      };
    }
    default:
      return { x1: 0, y1: 0, x2: 0, y2: 0 };
  }
};

const doesBoundsIntersect = (a: Rect, b: Rect): boolean => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;

export const doesBoundsIntersectCanvas = (bounds: OpBounds, width: number, height: number): boolean =>
  doesBoundsIntersect(bounds, { x1: 0, y1: 0, x2: width, y2: height });

export const doesBoundsIntersectRects = (bounds: OpBounds, rects: Rect[]): boolean =>
  rects.some((rect) => doesBoundsIntersect(bounds, rect));

export const overlayPatchRects = (
  targetPixels: Uint8ClampedArray,
  patchPixels: Uint8ClampedArray,
  rects: Rect[],
  width: number,
  height: number
) => {
  rects.forEach((rect) => {
    const startX = Math.max(0, Math.floor(rect.x1));
    const startY = Math.max(0, Math.floor(rect.y1));
    const endX = Math.min(width, Math.ceil(rect.x2));
    const endY = Math.min(height, Math.ceil(rect.y2));
    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        const idx = (y * width + x) * 4;
        targetPixels[idx] = patchPixels[idx];
        targetPixels[idx + 1] = patchPixels[idx + 1];
        targetPixels[idx + 2] = patchPixels[idx + 2];
        targetPixels[idx + 3] = patchPixels[idx + 3];
      }
    }
  });
};

export const overlayTextureSpaceRects = (
  targetPixels: Uint8ClampedArray,
  textureSpacePixels: Uint8ClampedArray,
  rects: Rect[],
  width: number,
  height: number
) => {
  rects.forEach((rect) => {
    const startX = Math.max(0, Math.floor(rect.x1));
    const startY = Math.max(0, Math.floor(rect.y1));
    const endX = Math.min(width, Math.ceil(rect.x2));
    const endY = Math.min(height, Math.ceil(rect.y2));
    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        const idx = (y * width + x) * 4;
        targetPixels[idx] = textureSpacePixels[idx];
        targetPixels[idx + 1] = textureSpacePixels[idx + 1];
        targetPixels[idx + 2] = textureSpacePixels[idx + 2];
        targetPixels[idx + 3] = textureSpacePixels[idx + 3];
      }
    }
  });
};

export const countChangedPixels = (before: Uint8ClampedArray, after: Uint8ClampedArray): number => {
  if (before.length !== after.length) return 0;
  let count = 0;
  for (let i = 0; i < before.length; i += 4) {
    if (
      before[i] !== after[i] ||
      before[i + 1] !== after[i + 1] ||
      before[i + 2] !== after[i + 2] ||
      before[i + 3] !== after[i + 3]
    ) {
      count += 1;
    }
  }
  return count;
};

export const countOpaquePixels = (data: Uint8ClampedArray): number => {
  let count = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 8) count += 1;
  }
  return count;
};

export const isSuspiciousOpaqueDrop = (beforeOpaquePixels: number, afterOpaquePixels: number): boolean => {
  if (!Number.isFinite(beforeOpaquePixels) || !Number.isFinite(afterOpaquePixels)) return false;
  if (beforeOpaquePixels < 256) return false;
  if (afterOpaquePixels >= beforeOpaquePixels) return false;
  const minAllowed = Math.max(64, Math.floor(beforeOpaquePixels * 0.05));
  return afterOpaquePixels < minAllowed;
};
