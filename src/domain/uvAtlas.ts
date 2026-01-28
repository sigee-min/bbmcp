import type { DomainError, DomainResult } from './result';
import type { Cube, CubeFaceDirection, TextureUsage } from './model';
import { UvPolicyConfig, computeExpectedUvSize, getFaceDimensions } from './uvPolicy';
import {
  UV_ATLAS_CUBE_MISSING,
  UV_ATLAS_DERIVE_SIZE_FAILED,
  UV_ATLAS_EXCEEDS_MAX,
  UV_ATLAS_MAX_RESOLUTION_POSITIVE,
  UV_ATLAS_OVERFLOW,
  UV_ATLAS_RESOLUTION_POSITIVE,
  UV_ATLAS_UV_SIZE_EXCEEDS
} from '../shared/messages';

export type AtlasRect = { x1: number; y1: number; x2: number; y2: number };

export type AtlasAssignment = {
  cubeId?: string;
  cubeName: string;
  face: CubeFaceDirection;
  uv: [number, number, number, number];
};

export type AtlasGroupPlan = {
  width: number;
  height: number;
  rect: [number, number, number, number];
  faceCount: number;
};

export type AtlasTexturePlan = {
  textureId?: string;
  textureName: string;
  groups: AtlasGroupPlan[];
};

export type AtlasPlan = {
  resolution: { width: number; height: number };
  steps: number;
  textures: AtlasTexturePlan[];
  assignments: AtlasAssignment[];
};

type FaceRef = {
  cubeId?: string;
  cubeName: string;
  face: CubeFaceDirection;
};

type Group = {
  key: string;
  width: number;
  height: number;
  faces: FaceRef[];
};

type Placement = {
  group: Group;
  x: number;
  y: number;
};

type BuildContext = {
  usage: TextureUsage;
  cubes: Cube[];
  resolution: { width: number; height: number };
  maxResolution: { width: number; height: number };
  padding: number;
  policy: UvPolicyConfig;
};

export const buildUvAtlasPlan = (context: BuildContext): DomainResult<AtlasPlan> => {
  const startWidth = Math.trunc(context.resolution.width);
  const startHeight = Math.trunc(context.resolution.height);
  if (!Number.isFinite(startWidth) || !Number.isFinite(startHeight) || startWidth <= 0 || startHeight <= 0) {
    return fail('invalid_payload', UV_ATLAS_RESOLUTION_POSITIVE);
  }
  const maxWidth = Math.trunc(context.maxResolution.width);
  const maxHeight = Math.trunc(context.maxResolution.height);
  if (!Number.isFinite(maxWidth) || !Number.isFinite(maxHeight) || maxWidth <= 0 || maxHeight <= 0) {
    return fail('invalid_payload', UV_ATLAS_MAX_RESOLUTION_POSITIVE);
  }
  const padding = Math.max(0, Math.trunc(context.padding));
  const cubeById = new Map<string, Cube>();
  const cubeByName = new Map<string, Cube>();
  context.cubes.forEach((cube) => {
    if (cube.id) cubeById.set(cube.id, cube);
    cubeByName.set(cube.name, cube);
  });
  const baseResolution = { width: startWidth, height: startHeight };
  let width = startWidth;
  let height = startHeight;
  let steps = 0;
  while (true) {
    const planRes = buildPlanForResolution(context.usage, cubeById, cubeByName, {
      width,
      height,
      padding,
      policy: context.policy,
      baseResolution
    });
    if (planRes.ok) {
      return {
        ok: true,
        data: {
          resolution: { width, height },
          steps,
          textures: planRes.data.textures,
          assignments: planRes.data.assignments
        }
      };
    }
    const reason = planRes.error.details?.reason;
    if (reason !== 'atlas_overflow') {
      return planRes;
    }
    const nextWidth = width * 2;
    const nextHeight = height * 2;
    if (nextWidth > maxWidth || nextHeight > maxHeight) {
      return fail('invalid_state', UV_ATLAS_EXCEEDS_MAX, {
        width,
        height,
        nextWidth,
        nextHeight,
        maxWidth,
        maxHeight
      });
    }
    width = nextWidth;
    height = nextHeight;
    steps += 1;
  }
};

const buildPlanForResolution = (
  usage: TextureUsage,
  cubeById: Map<string, Cube>,
  cubeByName: Map<string, Cube>,
  config: {
    width: number;
    height: number;
    padding: number;
    policy: UvPolicyConfig;
    baseResolution: { width: number; height: number };
  }
): DomainResult<{ textures: AtlasTexturePlan[]; assignments: AtlasAssignment[] }> => {
  const textures: AtlasTexturePlan[] = [];
  const assignments: AtlasAssignment[] = [];
  for (const entry of usage.textures) {
    if (entry.faceCount === 0) continue;
    const groupsRes = buildGroups(entry, cubeById, cubeByName, config);
    if (!groupsRes.ok) return groupsRes;
    const groups = groupsRes.data;
    const placementsRes = packGroups(groups, config.width, config.height, config.padding);
    if (!placementsRes.ok) return placementsRes;
    const placements = placementsRes.data;
    const plans: AtlasGroupPlan[] = [];
    placements.forEach((placement) => {
      const rect: [number, number, number, number] = [
        placement.x,
        placement.y,
        placement.x + placement.group.width,
        placement.y + placement.group.height
      ];
      plans.push({
        width: placement.group.width,
        height: placement.group.height,
        rect,
        faceCount: placement.group.faces.length
      });
      placement.group.faces.forEach((face) => {
        assignments.push({
          cubeId: face.cubeId,
          cubeName: face.cubeName,
          face: face.face,
          uv: rect
        });
      });
    });
    textures.push({
      textureId: entry.id ?? undefined,
      textureName: entry.name,
      groups: plans
    });
  }
  return { ok: true, data: { textures, assignments } };
};

const buildGroups = (
  entry: TextureUsage['textures'][number],
  cubeById: Map<string, Cube>,
  cubeByName: Map<string, Cube>,
  config: {
    width: number;
    height: number;
    padding: number;
    policy: UvPolicyConfig;
    baseResolution: { width: number; height: number };
  }
): DomainResult<Group[]> => {
  const groups = new Map<string, Group>();
  for (const cube of entry.cubes) {
    const target = cube.id ? cubeById.get(cube.id) : undefined;
    const resolved = target ?? cubeByName.get(cube.name);
    if (!resolved) {
      return fail('invalid_state', UV_ATLAS_CUBE_MISSING(cube.name), {
        textureName: entry.name,
        cubeName: cube.name
      });
    }
    for (const face of cube.faces) {
      const dims = getFaceDimensions(resolved, face.face);
      const expected = computeExpectedUvSize(dims, config.baseResolution, config.policy);
      if (!expected) {
        return fail('invalid_state', UV_ATLAS_DERIVE_SIZE_FAILED(cube.name, face.face), {
          textureName: entry.name,
          cubeName: cube.name,
          face: face.face,
          dimensions: dims,
          resolution: config.baseResolution
        });
      }
      const width = Math.max(1, Math.round(expected.width));
      const height = Math.max(1, Math.round(expected.height));
      if (width > config.width || height > config.height) {
        return fail('invalid_state', UV_ATLAS_UV_SIZE_EXCEEDS(cube.name, face.face), {
          textureName: entry.name,
          cubeName: cube.name,
          face: face.face,
          expected: { width, height },
          resolution: { width: config.width, height: config.height }
        });
      }
      const key = `${width}x${height}`;
      const group = groups.get(key) ?? { key, width, height, faces: [] };
      group.faces.push({ cubeId: cube.id, cubeName: cube.name, face: face.face });
      groups.set(key, group);
    }
  }
  return { ok: true, data: Array.from(groups.values()) };
};

const packGroups = (
  groups: Group[],
  width: number,
  height: number,
  padding: number
): DomainResult<Placement[]> => {
  const sorted = [...groups].sort((a, b) => {
    if (b.height !== a.height) return b.height - a.height;
    if (b.width !== a.width) return b.width - a.width;
    return a.key.localeCompare(b.key);
  });
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  const placements: Placement[] = [];
  for (const group of sorted) {
    if (group.width > width || group.height > height) {
      return overflow(width, height, group.width, group.height);
    }
    if (x + group.width > width) {
      x = 0;
      y += rowHeight + padding;
      rowHeight = 0;
    }
    if (y + group.height > height) {
      return overflow(width, height, group.width, group.height);
    }
    placements.push({ group, x, y });
    x += group.width + padding;
    rowHeight = Math.max(rowHeight, group.height);
  }
  return { ok: true, data: placements };
};

const overflow = (width: number, height: number, rectWidth: number, rectHeight: number): DomainResult<never> =>
  fail('invalid_state', UV_ATLAS_OVERFLOW, {
    reason: 'atlas_overflow',
    resolution: { width, height },
    rect: { width: rectWidth, height: rectHeight }
  });

const fail = (code: DomainError['code'], message: string, details?: Record<string, unknown>): DomainResult<never> => ({
  ok: false,
  error: { code, message, details }
});
