import type { FillRectShadeLike } from './textureOps';
import { clamp } from './math';

export type RgbaLike = { r: number; g: number; b: number; a: number };

type FillShadeDirection = 'tl_br' | 'tr_bl' | 'top_bottom' | 'left_right';

export type NormalizedFillShade = {
  intensity: number;
  edge: number;
  noise: number;
  seed: number;
  lightDir: FillShadeDirection;
};

export const resolveFillRectShade = (
  shade: FillRectShadeLike | undefined,
  xStart: number,
  yStart: number,
  xEnd: number,
  yEnd: number,
  color: RgbaLike
): NormalizedFillShade | null => {
  if (shade === false) return null;
  const config = shade === undefined || shade === true ? {} : shade;
  if (config.enabled === false) return null;
  const lightDir = resolveLightDir(config.lightDir);
  const intensity = clampUnit(config.intensity ?? 0.22);
  const edge = clampUnit(config.edge ?? 0.12);
  const noise = clampUnit(config.noise ?? 0.06);
  const seed = Number.isFinite(config.seed)
    ? Math.trunc(config.seed as number)
    : hashSeed(
        xStart,
        yStart,
        xEnd,
        yEnd,
        color.r,
        color.g,
        color.b,
        color.a
      );
  return {
    intensity,
    edge,
    noise,
    seed,
    lightDir
  };
};

export const applyShadedFillRect = (
  data: Uint8ClampedArray,
  textureWidth: number,
  xStart: number,
  yStart: number,
  xEnd: number,
  yEnd: number,
  color: RgbaLike,
  shade: NormalizedFillShade
) => {
  const rectWidth = Math.max(1, xEnd - xStart);
  const rectHeight = Math.max(1, yEnd - yStart);
  const tinyRect = rectWidth * rectHeight <= 4;
  const thinRect = rectWidth <= 2 || rectHeight <= 2;
  const intensity = tinyRect ? shade.intensity * 0.3 : shade.intensity;
  const edge = thinRect ? 0 : shade.edge;
  const noise = thinRect ? 0 : shade.noise;
  const edgeSpan = Math.max(1, Math.floor(Math.min(rectWidth, rectHeight) / 2));

  for (let yy = yStart; yy < yEnd; yy += 1) {
    const v = rectHeight <= 1 ? 0.5 : (yy - yStart) / (rectHeight - 1);
    for (let xx = xStart; xx < xEnd; xx += 1) {
      const u = rectWidth <= 1 ? 0.5 : (xx - xStart) / (rectWidth - 1);
      const dir = directionalShade(u, v, shade.lightDir);
      const distX = Math.min(xx - xStart, xEnd - 1 - xx);
      const distY = Math.min(yy - yStart, yEnd - 1 - yy);
      const borderDist = Math.min(distX, distY);
      const edgeRatio = 1 - clamp(borderDist / edgeSpan, 0, 1);
      const jitter = (hashToUnit(xx, yy, shade.seed) * 2 - 1) * noise;
      const delta = -dir * intensity - edgeRatio * edge + jitter;
      const scale = 1 + delta;
      const idx = (yy * textureWidth + xx) * 4;
      data[idx] = clamp(Math.round(color.r * scale), 0, 255);
      data[idx + 1] = clamp(Math.round(color.g * scale), 0, 255);
      data[idx + 2] = clamp(Math.round(color.b * scale), 0, 255);
      data[idx + 3] = color.a;
    }
  }
};

const clampUnit = (value: number): number => clamp(Number(value), 0, 1);

const resolveLightDir = (value: unknown): FillShadeDirection => {
  if (value === 'tr_bl' || value === 'top_bottom' || value === 'left_right') return value;
  return 'tl_br';
};

const directionalShade = (u: number, v: number, dir: FillShadeDirection): number => {
  switch (dir) {
    case 'tr_bl':
      return v - u;
    case 'top_bottom':
      return v * 2 - 1;
    case 'left_right':
      return u * 2 - 1;
    case 'tl_br':
    default:
      return u + v - 1;
  }
};

const hashSeed = (...values: number[]): number => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < values.length; i += 1) {
    h ^= Math.trunc(values[i]) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};

const hashToUnit = (x: number, y: number, seed: number): number => {
  let h = (seed ^ Math.imul(Math.trunc(x), 0x9e3779b1) ^ Math.imul(Math.trunc(y), 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 0xffffffff;
};
