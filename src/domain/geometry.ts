export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export const isZeroSize = (size: Vec3) => size[0] === 0 && size[1] === 0 && size[2] === 0;

export const vecEqual = (a: Vec3, b: Vec3, epsilon = 1e-6) =>
  Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon && Math.abs(a[2] - b[2]) <= epsilon;

export const vec2Equal = (a: Vec2, b: Vec2, epsilon = 1e-6) =>
  Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;

export const snapVec3 = (value: Vec3, grid?: number): Vec3 => {
  if (!grid || grid <= 0) return value;
  const snap = (v: number) => Math.round(v / grid) * grid;
  return [snap(value[0]), snap(value[1]), snap(value[2])];
};

export const applyBounds = (value: Vec3, bounds?: { min?: Vec3; max?: Vec3 }): Vec3 => {
  if (!bounds) return value;
  const min = bounds.min ?? value;
  const max = bounds.max ?? value;
  return [
    Math.min(Math.max(value[0], min[0] ?? value[0]), max[0] ?? value[0]),
    Math.min(Math.max(value[1], min[1] ?? value[1]), max[1] ?? value[1]),
    Math.min(Math.max(value[2], min[2] ?? value[2]), max[2] ?? value[2])
  ];
};

export const rotatePoint = (point: Vec3, axis: 'x' | 'y' | 'z', angleDeg: number, center: Vec3): Vec3 => {
  const angle = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = point[0] - center[0];
  const y = point[1] - center[1];
  const z = point[2] - center[2];
  if (axis === 'x') {
    return [x + center[0], y * cos - z * sin + center[1], y * sin + z * cos + center[2]];
  }
  if (axis === 'y') {
    return [x * cos + z * sin + center[0], y + center[1], -x * sin + z * cos + center[2]];
  }
  return [x * cos - y * sin + center[0], x * sin + y * cos + center[1], z + center[2]];
};

export const mirrorRotation = (rotation: Vec3, axis: 'x' | 'y' | 'z'): Vec3 => {
  if (axis === 'x') return [rotation[0], -rotation[1], -rotation[2]];
  if (axis === 'y') return [-rotation[0], rotation[1], -rotation[2]];
  return [-rotation[0], -rotation[1], rotation[2]];
};
