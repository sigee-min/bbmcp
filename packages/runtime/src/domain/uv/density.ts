import type { Cube, TextureUsage } from '../model';
import type { UvPolicyConfig } from './policy';
import { getFaceDimensions } from './policy';

export const estimateUvPixelsPerBlock = (
  usage: TextureUsage,
  cubes: Cube[],
  policy: Pick<UvPolicyConfig, 'modelUnitsPerBlock'>
): number | null => {
  const samples: number[] = [];
  const cubeById = new Map<string, Cube>();
  const cubeByName = new Map<string, Cube | null>();
  cubes.forEach((cube) => {
    if (cube.id) cubeById.set(cube.id, cube);
    if (cubeByName.has(cube.name)) {
      cubeByName.set(cube.name, null);
    } else {
      cubeByName.set(cube.name, cube);
    }
  });

  usage.textures.forEach((entry) => {
    entry.cubes.forEach((cube) => {
      const resolved = cube.id ? cubeById.get(cube.id) : undefined;
      const byName = cubeByName.get(cube.name);
      const target = resolved ?? byName ?? undefined;
      if (!target) return;
      cube.faces.forEach((face) => {
        const uv = face.uv;
        if (!uv) return;
        const dims = getFaceDimensions(target, face.face);
        if (dims.width <= 0 || dims.height <= 0) return;
        const actualWidth = Math.abs(uv[2] - uv[0]);
        const actualHeight = Math.abs(uv[3] - uv[1]);
        if (!Number.isFinite(actualWidth) || !Number.isFinite(actualHeight)) return;
        if (actualWidth <= 0 || actualHeight <= 0) return;
        const pxPerBlockX = (actualWidth / dims.width) * policy.modelUnitsPerBlock;
        const pxPerBlockY = (actualHeight / dims.height) * policy.modelUnitsPerBlock;
        if (Number.isFinite(pxPerBlockX) && pxPerBlockX > 0) samples.push(pxPerBlockX);
        if (Number.isFinite(pxPerBlockY) && pxPerBlockY > 0) samples.push(pxPerBlockY);
      });
    });
  });

  if (samples.length === 0) return null;
  const median = computeMedian(samples);
  if (!Number.isFinite(median) || median <= 0) return null;
  return Math.max(1, Math.round(median));
};

const computeMedian = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};
