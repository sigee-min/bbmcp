import type { Cube, CubeFaceDirection } from '../model';

export type UvPolicyConfig = {
  modelUnitsPerBlock: number;
  pixelsPerBlock?: number;
  scaleTolerance: number;
  tinyThreshold: number;
  autoMaxResolution?: number;
  autoMaxRetries?: number;
};

export const DEFAULT_UV_POLICY: UvPolicyConfig = {
  modelUnitsPerBlock: 16,
  pixelsPerBlock: 16,
  scaleTolerance: 0.1,
  tinyThreshold: 2,
  autoMaxResolution: 0,
  autoMaxRetries: 2
};

type FaceDimensions = {
  width: number;
  height: number;
};

export type ExpectedUvSize = {
  width: number;
  height: number;
  exceedsTexture: boolean;
};

const abs = (value: number) => Math.abs(value);

export const normalizePixelsPerBlock = (value: unknown, fallback?: number): number | undefined => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.trunc(numeric);
  }
  if (Number.isFinite(fallback) && (fallback ?? 0) > 0) {
    return Math.trunc(fallback as number);
  }
  return undefined;
};

export const getFaceDimensions = (cube: Cube, face: CubeFaceDirection): FaceDimensions => {
  const sizeX = abs(cube.to[0] - cube.from[0]);
  const sizeY = abs(cube.to[1] - cube.from[1]);
  const sizeZ = abs(cube.to[2] - cube.from[2]);
  switch (face) {
    case 'north':
    case 'south':
      return { width: sizeX, height: sizeY };
    case 'east':
    case 'west':
      return { width: sizeZ, height: sizeY };
    case 'up':
    case 'down':
      return { width: sizeX, height: sizeZ };
  }
};

const computeExpectedUvSizeInternal = (
  face: FaceDimensions,
  texture: { width: number; height: number },
  policy: UvPolicyConfig,
  options?: { allowOverflow?: boolean }
): ExpectedUvSize | null => {
  if (policy.modelUnitsPerBlock <= 0) return null;
  if (texture.width <= 0 || texture.height <= 0) return null;
  const pixelsPerBlock = normalizePixelsPerBlock(policy.pixelsPerBlock);
  const baseWidth = pixelsPerBlock ?? texture.width;
  const baseHeight = pixelsPerBlock ?? texture.height;
  const ppuX = baseWidth / policy.modelUnitsPerBlock;
  const ppuY = baseHeight / policy.modelUnitsPerBlock;
  const width = Math.round(face.width * ppuX);
  const height = Math.round(face.height * ppuY);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  const exceedsTexture = width > texture.width || height > texture.height;
  if (exceedsTexture && !options?.allowOverflow) return null;
  return { width, height, exceedsTexture };
};

export const computeExpectedUvSizeWithOverflow = (
  face: FaceDimensions,
  texture: { width: number; height: number },
  policy: UvPolicyConfig
): ExpectedUvSize | null => computeExpectedUvSizeInternal(face, texture, policy, { allowOverflow: true });



