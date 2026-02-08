import type { Snapshot } from '../model';

export const findDuplicates = (values: string[]): string[] => {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  values.forEach((value) => {
    if (seen.has(value)) {
      dupes.add(value);
    } else {
      seen.add(value);
    }
  });
  return [...dupes];
};

type CubeBounds = {
  name: string;
  bone: string;
  min: [number, number, number];
  max: [number, number, number];
};

type CubeContainment = {
  inner: string;
  outer: string;
};

const EPSILON = 1e-6;

export const findCubeContainments = (cubes: Snapshot['cubes']): CubeContainment[] => {
  const boundsByBone = new Map<string, CubeBounds[]>();
  cubes.forEach((cube) => {
    if (!isZeroRotation(cube.rotation)) return;
    const bounds = buildCubeBounds(cube);
    const list = boundsByBone.get(cube.bone) ?? [];
    list.push(bounds);
    boundsByBone.set(cube.bone, list);
  });

  const results: CubeContainment[] = [];
  const seen = new Set<string>();
  boundsByBone.forEach((entries) => {
    for (let i = 0; i < entries.length; i += 1) {
      const a = entries[i];
      for (let j = i + 1; j < entries.length; j += 1) {
        const b = entries[j];
        const aContainsB = containsBounds(a, b);
        const bContainsA = containsBounds(b, a);
        if (!aContainsB && !bContainsA) continue;
        if (aContainsB && bContainsA) {
          const inner = a.name <= b.name ? a.name : b.name;
          const outer = a.name <= b.name ? b.name : a.name;
          const key = `${inner}::${outer}`;
          if (seen.has(key)) continue;
          seen.add(key);
          results.push({ inner, outer });
          continue;
        }
        if (aContainsB) {
          const key = `${b.name}::${a.name}`;
          if (seen.has(key)) continue;
          seen.add(key);
          results.push({ inner: b.name, outer: a.name });
        } else if (bContainsA) {
          const key = `${a.name}::${b.name}`;
          if (seen.has(key)) continue;
          seen.add(key);
          results.push({ inner: a.name, outer: b.name });
        }
      }
    }
  });
  return results;
};

const buildCubeBounds = (cube: Snapshot['cubes'][number]): CubeBounds => {
  const inflate = Number.isFinite(cube.inflate) ? Number(cube.inflate) : 0;
  const min: [number, number, number] = [
    Math.min(cube.from[0], cube.to[0]) - inflate,
    Math.min(cube.from[1], cube.to[1]) - inflate,
    Math.min(cube.from[2], cube.to[2]) - inflate
  ];
  const max: [number, number, number] = [
    Math.max(cube.from[0], cube.to[0]) + inflate,
    Math.max(cube.from[1], cube.to[1]) + inflate,
    Math.max(cube.from[2], cube.to[2]) + inflate
  ];
  for (let i = 0; i < 3; i += 1) {
    if (min[i] > max[i]) {
      const swap = min[i];
      min[i] = max[i];
      max[i] = swap;
    }
  }
  return { name: cube.name, bone: cube.bone, min, max };
};

const containsBounds = (outer: CubeBounds, inner: CubeBounds): boolean =>
  outer.min[0] <= inner.min[0] + EPSILON &&
  outer.min[1] <= inner.min[1] + EPSILON &&
  outer.min[2] <= inner.min[2] + EPSILON &&
  outer.max[0] >= inner.max[0] - EPSILON &&
  outer.max[1] >= inner.max[1] - EPSILON &&
  outer.max[2] >= inner.max[2] - EPSILON;

const isZeroRotation = (rotation?: [number, number, number]): boolean =>
  !rotation || (rotation[0] === 0 && rotation[1] === 0 && rotation[2] === 0);
