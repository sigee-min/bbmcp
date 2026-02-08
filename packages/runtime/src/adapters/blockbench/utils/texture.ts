import type { TextureInstance } from '../../../types/blockbench';

const pickPositive = (...values: Array<number | undefined>) => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  }
  return undefined;
};

export const readTextureSize = (
  tex: TextureInstance | null | undefined
): { width?: number; height?: number } => {
  if (!tex) return {};
  const width = pickPositive(tex.canvas?.width, tex.width, tex.img?.naturalWidth, tex.img?.width);
  const height = pickPositive(tex.canvas?.height, tex.height, tex.img?.naturalHeight, tex.img?.height);
  return { width, height };
};
