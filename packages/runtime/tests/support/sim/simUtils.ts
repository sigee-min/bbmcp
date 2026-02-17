import type { TextureResolution } from '../../../src/ports/editor';
import type { ToolError } from '/contracts/types/internal';
import type { CubeFace, CubeFaceDirection, CubeInstance } from '../../../src/types/blockbench';
import { CUBE_FACE_DIRECTIONS } from '../../../src/shared/toolConstants';
import { computeExpectedUvSizeWithOverflow, DEFAULT_UV_POLICY } from '../../../src/domain/uv/policy';

export const ensureFaces = (cube: CubeInstance): Record<string, CubeFace> => {
  const faces = cube.faces ?? {};
  CUBE_FACE_DIRECTIONS.forEach((face) => {
    if (!faces[face]) faces[face] = { texture: false };
  });
  cube.faces = faces;
  return faces;
};

export const normalizeSize = (value?: number): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value <= 0) return null;
  return Math.trunc(value);
};

export const normalizeVec3 = (value?: [number, number, number] | { x: number; y: number; z: number }) => {
  if (!value) return null;
  if (Array.isArray(value)) return [value[0], value[1], value[2]] as [number, number, number];
  return [value.x ?? 0, value.y ?? 0, value.z ?? 0] as [number, number, number];
};

export const normalizeVec2 = (value?: [number, number] | { x: number; y: number }) => {
  if (!value) return null;
  if (Array.isArray(value)) return [value[0], value[1]] as [number, number];
  return [value.x ?? 0, value.y ?? 0] as [number, number];
};

export const resolveUvOrigin = (cube: CubeInstance): [number, number] => {
  const offset = normalizeVec2(cube.uv_offset);
  if (offset) return offset;
  const uv = normalizeVec2(cube.uv);
  if (uv) return uv;
  return [0, 0];
};

export const buildBoxUvLayout = (
  cube: CubeInstance,
  origin: [number, number],
  resolution: TextureResolution
): Record<CubeFaceDirection, [number, number, number, number]> => {
  const from = normalizeVec3(cube.from) ?? [0, 0, 0];
  const to = normalizeVec3(cube.to) ?? [0, 0, 0];
  const sizeX = Math.abs(to[0] - from[0]);
  const sizeY = Math.abs(to[1] - from[1]);
  const sizeZ = Math.abs(to[2] - from[2]);
  const policy = DEFAULT_UV_POLICY;

  const resolveSize = (width: number, height: number): { width: number; height: number } => {
    const expected = computeExpectedUvSizeWithOverflow({ width, height }, resolution, policy);
    if (expected && !expected.exceedsTexture) return { width: expected.width, height: expected.height };
    return { width, height };
  };

  const northSize = resolveSize(sizeX, sizeY);
  const eastSize = resolveSize(sizeZ, sizeY);
  const upSize = resolveSize(sizeX, sizeZ);
  const depthWidth = eastSize.width;
  const depthHeight = upSize.height;
  const sideHeight = northSize.height;
  const [u, v] = origin;

  return {
    west: [u, v + depthHeight, u + depthWidth, v + depthHeight + sideHeight],
    north: [u + depthWidth, v + depthHeight, u + depthWidth + northSize.width, v + depthHeight + sideHeight],
    east: [
      u + depthWidth + northSize.width,
      v + depthHeight,
      u + depthWidth + northSize.width + depthWidth,
      v + depthHeight + sideHeight
    ],
    south: [
      u + depthWidth + northSize.width + depthWidth,
      v + depthHeight,
      u + depthWidth + northSize.width + depthWidth + northSize.width,
      v + depthHeight + sideHeight
    ],
    up: [u + depthWidth, v, u + depthWidth + northSize.width, v + depthHeight],
    down: [u + depthWidth + northSize.width, v, u + depthWidth + northSize.width + northSize.width, v + depthHeight]
  };
};

export const scaleVec2 = (
  value: [number, number] | { x: number; y: number },
  scaleX: number,
  scaleY: number
): [number, number] => {
  const vec = normalizeVec2(value) ?? [0, 0];
  return [vec[0] * scaleX, vec[1] * scaleY];
};

export const error = (code: ToolError['code'], message: string): ToolError => ({ code, message });

