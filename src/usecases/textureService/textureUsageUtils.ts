import { CUBE_FACE_DIRECTIONS } from '../../shared/toolConstants';
import type { CubeFaceDirection, TextureUsageResult } from '../../ports/editor';
import type { SessionState } from '../../session';
import type { PreflightUsageSummary, PreflightUvBounds } from '@ashfox/contracts/types/internal';
import { buildTargetFilters, filterByTargetFilters } from '../../domain/targetFilters';

const VALID_CUBE_FACES: ReadonlySet<CubeFaceDirection> = new Set(CUBE_FACE_DIRECTIONS);

export const normalizeCubeFaces = (faces?: CubeFaceDirection[]): CubeFaceDirection[] | null => {
  if (!faces || faces.length === 0) return null;
  const normalized: CubeFaceDirection[] = [];
  for (const face of faces) {
    if (!VALID_CUBE_FACES.has(face)) {
      return null;
    }
    if (!normalized.includes(face)) {
      normalized.push(face);
    }
  }
  return normalized.length > 0 ? normalized : null;
};

export const resolveCubeTargets = (cubes: SessionState['cubes'], cubeIds?: string[], cubeNames?: string[]) => {
  const filters = buildTargetFilters(cubeIds, cubeNames);
  return filterByTargetFilters(cubes, filters);
};

export const summarizeTextureUsage = (usage: TextureUsageResult): PreflightUsageSummary => {
  let cubeCount = 0;
  let faceCount = 0;
  usage.textures.forEach((entry) => {
    cubeCount += entry.cubeCount;
    faceCount += entry.faceCount;
  });
  return {
    textureCount: usage.textures.length,
    cubeCount,
    faceCount,
    unresolvedCount: usage.unresolved?.length ?? 0
  };
};

export const computeUvBounds = (usage: TextureUsageResult): PreflightUvBounds | null => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let faceCount = 0;
  usage.textures.forEach((entry) => {
    entry.cubes.forEach((cube) => {
      cube.faces.forEach((face) => {
        if (!face.uv) return;
        const [x1, y1, x2, y2] = face.uv;
        const localMinX = Math.min(x1, x2);
        const localMinY = Math.min(y1, y2);
        const localMaxX = Math.max(x1, x2);
        const localMaxY = Math.max(y1, y2);
        if (localMinX < minX) minX = localMinX;
        if (localMinY < minY) minY = localMinY;
        if (localMaxX > maxX) maxX = localMaxX;
        if (localMaxY > maxY) maxY = localMaxY;
        faceCount += 1;
      });
    });
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
    faceCount
  };
};

export const recommendResolution = (
  bounds: PreflightUvBounds | null,
  current: { width: number; height: number } | undefined,
  maxSize: number
): { width: number; height: number; reason: string } | null => {
  if (!bounds) return null;
  const requiredWidth = Math.max(bounds.maxX, current?.width ?? 0);
  const requiredHeight = Math.max(bounds.maxY, current?.height ?? 0);
  const width = clampResolution(roundUpResolution(requiredWidth), maxSize);
  const height = clampResolution(roundUpResolution(requiredHeight), maxSize);
  if (current && width <= current.width && height <= current.height) return null;
  const reason = current ? 'uv_bounds_exceed_resolution' : 'resolution_missing';
  return { width, height, reason };
};

const roundUpResolution = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 16;
  if (value <= 16) return 16;
  return Math.ceil(value / 32) * 32;
};

const clampResolution = (value: number, maxSize: number): number => {
  if (value <= 0) return 16;
  if (value > maxSize) return maxSize;
  return value;
};

