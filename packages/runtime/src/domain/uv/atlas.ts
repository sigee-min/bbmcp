import type { DomainError, DomainResult } from '../result';
import type { Cube, CubeFaceDirection, TextureUsage } from '../model';
import { UvPolicyConfig } from './policy';
import { buildGroups } from './atlasGroups';
import { packGroups } from './atlasPacking';

export type UvAtlasMessages = {
  resolutionPositive: string;
  maxResolutionPositive: string;
  exceedsMax: string;
  cubeMissing: (name: string) => string;
  deriveSizeFailed: (cube: string, face: string) => string;
  uvSizeExceeds: (cube: string, face: string) => string;
  overflow: string;
};

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

type BuildContext = {
  usage: TextureUsage;
  cubes: Cube[];
  resolution: { width: number; height: number };
  baseResolution?: { width: number; height: number };
  maxResolution: { width: number; height: number };
  padding: number;
  policy: UvPolicyConfig;
  messages: UvAtlasMessages;
};

export const buildUvAtlasPlan = (context: BuildContext): DomainResult<AtlasPlan> => {
  const prepared = prepareBuildContext(context);
  if (!prepared.ok) return prepared;

  let width = prepared.data.start.width;
  let height = prepared.data.start.height;
  let steps = 0;
  while (true) {
    const planRes = buildPlanForResolution(context.usage, prepared.data.cubeById, prepared.data.cubeByName, {
      width,
      height,
      padding: prepared.data.padding,
      policy: context.policy,
      baseResolution: prepared.data.base,
      messages: context.messages
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
    const nextRes = nextResolutionStep(width, height, prepared.data.max, context.messages);
    if (!nextRes.ok) return nextRes;
    width = nextRes.data.width;
    height = nextRes.data.height;
    steps += 1;
  }
};

type PreparedBuildContext = {
  start: { width: number; height: number };
  base: { width: number; height: number };
  max: { width: number; height: number };
  padding: number;
  cubeById: Map<string, Cube>;
  cubeByName: Map<string, Cube>;
};

const prepareBuildContext = (context: BuildContext): DomainResult<PreparedBuildContext> => {
  const startWidth = toPositiveInt(context.resolution.width);
  const startHeight = toPositiveInt(context.resolution.height);
  if (!startWidth || !startHeight) {
    return fail('invalid_payload', context.messages.resolutionPositive);
  }

  const baseWidth =
    context.baseResolution?.width !== undefined ? toPositiveInt(context.baseResolution.width) : startWidth;
  const baseHeight =
    context.baseResolution?.height !== undefined ? toPositiveInt(context.baseResolution.height) : startHeight;
  if (!baseWidth || !baseHeight) {
    return fail('invalid_payload', context.messages.resolutionPositive);
  }

  const maxWidth = toPositiveInt(context.maxResolution.width);
  const maxHeight = toPositiveInt(context.maxResolution.height);
  if (!maxWidth || !maxHeight) {
    return fail('invalid_payload', context.messages.maxResolutionPositive);
  }

  const lookup = buildCubeLookup(context.cubes);
  return {
    ok: true,
    data: {
      start: { width: startWidth, height: startHeight },
      base: { width: baseWidth, height: baseHeight },
      max: { width: maxWidth, height: maxHeight },
      padding: Math.max(0, Math.trunc(context.padding)),
      cubeById: lookup.byId,
      cubeByName: lookup.byName
    }
  };
};

const toPositiveInt = (value: number): number | null => {
  const normalized = Math.trunc(value);
  if (!Number.isFinite(normalized) || normalized <= 0) return null;
  return normalized;
};

const buildCubeLookup = (cubes: Cube[]): { byId: Map<string, Cube>; byName: Map<string, Cube> } => {
  const byId = new Map<string, Cube>();
  const byName = new Map<string, Cube>();
  cubes.forEach((cube) => {
    if (cube.id) byId.set(cube.id, cube);
    byName.set(cube.name, cube);
  });
  return { byId, byName };
};

const nextResolutionStep = (
  width: number,
  height: number,
  max: { width: number; height: number },
  messages: UvAtlasMessages
): DomainResult<{ width: number; height: number }> => {
  const nextWidth = width * 2;
  const nextHeight = height * 2;
  if (nextWidth > max.width || nextHeight > max.height) {
    return fail('invalid_state', messages.exceedsMax, {
      width,
      height,
      nextWidth,
      nextHeight,
      maxWidth: max.width,
      maxHeight: max.height
    });
  }
  return { ok: true, data: { width: nextWidth, height: nextHeight } };
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
    messages: UvAtlasMessages;
  }
): DomainResult<{ textures: AtlasTexturePlan[]; assignments: AtlasAssignment[] }> => {
  const textures: AtlasTexturePlan[] = [];
  const assignments: AtlasAssignment[] = [];
  for (const entry of usage.textures) {
    if (entry.faceCount === 0) continue;
    const groupsRes = buildGroups(entry, cubeById, cubeByName, config);
    if (!groupsRes.ok) return groupsRes;
    const groups = groupsRes.data;
    const placementsRes = packGroups(groups, config.width, config.height, config.padding, config.messages);
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

const fail = (code: DomainError['code'], message: string, details?: Record<string, unknown>): DomainResult<never> => ({
  ok: false,
  error: { code, message, details }
});




