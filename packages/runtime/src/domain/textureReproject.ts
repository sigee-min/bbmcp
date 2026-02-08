export type TextureRect = [number, number, number, number];

export type TextureReprojectMapping = {
  from: TextureRect;
  to: TextureRect;
};

type NormalizedRect = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const normalizeRange = (a: number, b: number, max: number): [number, number] | null => {
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(max) || max <= 0) return null;
  const lo = clamp(Math.min(a, b), 0, max);
  const hi = clamp(Math.max(a, b), 0, max);
  if (hi <= lo) return null;
  let start = clamp(Math.floor(lo), 0, max);
  let end = clamp(Math.ceil(hi), 0, max);
  if (end <= start) {
    if (start >= max) return null;
    end = start + 1;
  }
  return [start, end];
};

const normalizeRect = (rect: TextureRect, maxWidth: number, maxHeight: number): NormalizedRect | null => {
  const xRange = normalizeRange(rect[0], rect[2], maxWidth);
  const yRange = normalizeRange(rect[1], rect[3], maxHeight);
  if (!xRange || !yRange) return null;
  const [x1, x2] = xRange;
  const [y1, y2] = yRange;
  const width = x2 - x1;
  const height = y2 - y1;
  if (width <= 0 || height <= 0) return null;
  return { x1, y1, x2, y2, width, height };
};

export const reprojectTexturePixels = (params: {
  source: Uint8ClampedArray;
  sourceWidth: number;
  sourceHeight: number;
  destWidth: number;
  destHeight: number;
  mappings: TextureReprojectMapping[];
}): Uint8ClampedArray => {
  const destWidth = Math.trunc(params.destWidth);
  const destHeight = Math.trunc(params.destHeight);
  const dest = new Uint8ClampedArray(destWidth * destHeight * 4);
  const sourceWidth = Math.trunc(params.sourceWidth);
  const sourceHeight = Math.trunc(params.sourceHeight);
  const source = params.source;
  if (destWidth <= 0 || destHeight <= 0 || sourceWidth <= 0 || sourceHeight <= 0) {
    return dest;
  }
  for (const mapping of params.mappings) {
    const srcRect = normalizeRect(mapping.from, sourceWidth, sourceHeight);
    const dstRect = normalizeRect(mapping.to, destWidth, destHeight);
    if (!srcRect || !dstRect) continue;
    const srcW = srcRect.width;
    const srcH = srcRect.height;
    const dstW = dstRect.width;
    const dstH = dstRect.height;
    for (let y = 0; y < dstH; y += 1) {
      const srcY = srcRect.y1 + Math.min(srcH - 1, Math.floor(((y + 0.5) * srcH) / dstH));
      for (let x = 0; x < dstW; x += 1) {
        const srcX = srcRect.x1 + Math.min(srcW - 1, Math.floor(((x + 0.5) * srcW) / dstW));
        const srcIdx = (srcY * sourceWidth + srcX) * 4;
        const dstIdx = ((dstRect.y1 + y) * destWidth + (dstRect.x1 + x)) * 4;
        dest[dstIdx] = source[srcIdx];
        dest[dstIdx + 1] = source[srcIdx + 1];
        dest[dstIdx + 2] = source[srcIdx + 2];
        dest[dstIdx + 3] = source[srcIdx + 3];
      }
    }
  }
  return dest;
};
