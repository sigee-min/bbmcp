import { hashTextToHex } from '../../shared/hash';
import { buildRigTemplate } from '../../templates';
import { applyBounds, isZeroSize, mirrorRotation, rotatePoint, snapVec3 } from '../../domain/geometry';
import type { ModelBoneSpec, ModelCubeSpec, ModelInstance, ModelSpec } from '../../spec';
import type { ToolResponse } from '../../types';
import { err } from '../../services/toolResponse';
import { applyAnchors } from './anchorResolver';
import { DEFAULT_PIVOT, DEFAULT_ROTATION, DEFAULT_SCALE } from './constants';
import type { NormalizedBone, NormalizedCube, NormalizedModel, Vec3 } from './types';
import { isResponseError } from '../guardHelpers';
import {
  MODEL_BONE_ID_REQUIRED_EXPLICIT,
  MODEL_BONE_ID_REQUIRED_EXPLICIT_FIX,
  MODEL_BONE_PARENT_MISSING,
  MODEL_CUBE_BOUNDS_MISSING,
  MODEL_CUBE_ID_REQUIRED_EXPLICIT,
  MODEL_CUBE_ID_REQUIRED_EXPLICIT_FIX,
  MODEL_CUBE_PARENT_BONE_MISSING,
  MODEL_DUPLICATE_BONE_ID,
  MODEL_DUPLICATE_BONE_NAME,
  MODEL_DUPLICATE_CUBE_ID,
  MODEL_DUPLICATE_CUBE_NAME,
  MODEL_INSTANCE_MIRROR_SOURCE_MISSING,
  MODEL_INSTANCE_OBJECT_REQUIRED,
  MODEL_INSTANCE_RADIAL_COUNT_INVALID,
  MODEL_INSTANCE_RADIAL_SOURCE_MISSING,
  MODEL_INSTANCE_REPEAT_COUNT_INVALID,
  MODEL_INSTANCE_REPEAT_SOURCE_MISSING,
  MODEL_INSTANCE_UNKNOWN,
  MODEL_REQUIRED,
  TOO_MANY_CUBES
} from '../../shared/messages';

const sanitizeId = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');

const resolveId = (
  kind: 'bone' | 'cube',
  specId: string | undefined,
  specName: string | undefined,
  parentId: string | null | undefined,
  index: number,
  policy: 'explicit' | 'stable_path' | 'hash'
): string => {
  if (specId) return specId;
  const label = specName ?? `${kind}_${index}`;
  if (policy === 'explicit') {
    return '';
  }
  const base = `${kind}:${parentId ?? 'root'}:${label}`;
  if (policy === 'hash') {
    return `${kind}_${hashTextToHex(base)}`;
  }
  const sanitized = sanitizeId(base);
  return sanitized ? sanitized : `${kind}_${hashTextToHex(base)}`;
};

const resolveCubeBounds = (cube: ModelCubeSpec): { from: Vec3; to: Vec3; explicit: boolean } | null => {
  if (cube.from && cube.to) {
    return { from: cube.from, to: cube.to, explicit: true };
  }
  if (cube.center && cube.size) {
    const half: Vec3 = [cube.size[0] / 2, cube.size[1] / 2, cube.size[2] / 2];
    return {
      from: [cube.center[0] - half[0], cube.center[1] - half[1], cube.center[2] - half[2]],
      to: [cube.center[0] + half[0], cube.center[1] + half[1], cube.center[2] + half[2]],
      explicit: true
    };
  }
  return null;
};

const applyInstances = (
  instances: ModelInstance[],
  cubeMap: Map<string, NormalizedCube>,
  warnings: string[]
): ToolResponse<void> => {
  const nextCubes: NormalizedCube[] = [];

  const ensureUniqueId = (id: string): boolean => !cubeMap.has(id) && !nextCubes.some((cube) => cube.id === id);

  for (const instance of instances) {
    if (!instance || typeof instance !== 'object') {
      return err('invalid_payload', MODEL_INSTANCE_OBJECT_REQUIRED);
    }
    if (instance.type === 'mirror') {
      const source = cubeMap.get(instance.sourceCubeId);
      if (!source) return err('invalid_payload', MODEL_INSTANCE_MIRROR_SOURCE_MISSING(instance.sourceCubeId));
      const axis = instance.axis ?? 'x';
      const about = typeof instance.about === 'number' ? instance.about : 0;
      const id = instance.newId ?? `${source.id}_mirror_${axis}`;
      if (!ensureUniqueId(id)) return err('invalid_payload', MODEL_DUPLICATE_CUBE_ID(id));
      const from = [...source.from] as Vec3;
      const to = [...source.to] as Vec3;
      const origin = [...source.origin] as Vec3;
      const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
      const mirrorAxis = (value: number) => 2 * about - value;
      const a = mirrorAxis(from[idx]);
      const b = mirrorAxis(to[idx]);
      const mirroredFrom = [...from] as Vec3;
      const mirroredTo = [...to] as Vec3;
      mirroredFrom[idx] = Math.min(a, b);
      mirroredTo[idx] = Math.max(a, b);
      origin[idx] = mirrorAxis(origin[idx]);
      const rotation = mirrorRotation(source.rotation, axis);
      nextCubes.push({
        ...source,
        id,
        name: instance.newName ?? id,
        from: mirroredFrom,
        to: mirroredTo,
        origin,
        rotation,
        explicit: { ...source.explicit }
      });
      continue;
    }
    if (instance.type === 'repeat') {
      const source = cubeMap.get(instance.sourceCubeId);
      if (!source) return err('invalid_payload', MODEL_INSTANCE_REPEAT_SOURCE_MISSING(instance.sourceCubeId));
      const count = Math.trunc(instance.count);
      if (!Number.isFinite(count) || count <= 0) {
        return err('invalid_payload', MODEL_INSTANCE_REPEAT_COUNT_INVALID);
      }
      const delta = instance.delta ?? [0, 0, 0];
      for (let i = 1; i <= count; i += 1) {
        const id = `${instance.prefix ?? source.id}_r${i}`;
        if (!ensureUniqueId(id)) return err('invalid_payload', MODEL_DUPLICATE_CUBE_ID(id));
        const offset: Vec3 = [delta[0] * i, delta[1] * i, delta[2] * i];
        nextCubes.push({
          ...source,
          id,
          name: id,
          from: [source.from[0] + offset[0], source.from[1] + offset[1], source.from[2] + offset[2]],
          to: [source.to[0] + offset[0], source.to[1] + offset[1], source.to[2] + offset[2]],
          origin: [source.origin[0] + offset[0], source.origin[1] + offset[1], source.origin[2] + offset[2]],
          explicit: { ...source.explicit }
        });
      }
      continue;
    }
    if (instance.type === 'radial') {
      const source = cubeMap.get(instance.sourceCubeId);
      if (!source) return err('invalid_payload', MODEL_INSTANCE_RADIAL_SOURCE_MISSING(instance.sourceCubeId));
      const count = Math.trunc(instance.count);
      if (!Number.isFinite(count) || count <= 1) {
        return err('invalid_payload', MODEL_INSTANCE_RADIAL_COUNT_INVALID);
      }
      const axis = instance.axis ?? 'y';
      const center = instance.center ?? [0, 0, 0];
      const startAngle = instance.startAngle ?? 0;
      const size: Vec3 = [
        source.to[0] - source.from[0],
        source.to[1] - source.from[1],
        source.to[2] - source.from[2]
      ];
      const baseCenter: Vec3 = [
        (source.from[0] + source.to[0]) / 2,
        (source.from[1] + source.to[1]) / 2,
        (source.from[2] + source.to[2]) / 2
      ];
      const baseOffset: Vec3 = [
        baseCenter[0] - center[0],
        baseCenter[1] - center[1],
        baseCenter[2] - center[2]
      ];
      const offsetLen = Math.hypot(baseOffset[0], baseOffset[1], baseOffset[2]);
      const targetRadius = typeof instance.radius === 'number' ? Math.max(0, instance.radius) : offsetLen;
      const scale = offsetLen > 0 ? targetRadius / offsetLen : targetRadius > 0 ? 1 : 0;
      const radialOffset: Vec3 = [
        offsetLen > 0 ? baseOffset[0] * scale : targetRadius,
        offsetLen > 0 ? baseOffset[1] * scale : 0,
        offsetLen > 0 ? baseOffset[2] * scale : 0
      ];
      for (let i = 1; i <= count; i += 1) {
        const angle = startAngle + (360 / count) * i;
        const id = `${instance.prefix ?? source.id}_r${i}`;
        if (!ensureUniqueId(id)) return err('invalid_payload', MODEL_DUPLICATE_CUBE_ID(id));
        const rotatedCenter = rotatePoint(
          [center[0] + radialOffset[0], center[1] + radialOffset[1], center[2] + radialOffset[2]],
          axis,
          angle,
          center
        );
        const rotatedOrigin = rotatePoint(source.origin, axis, angle, center);
        const rotation = [...source.rotation] as Vec3;
        const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
        rotation[axisIndex] = rotation[axisIndex] + angle;
        nextCubes.push({
          ...source,
          id,
          name: id,
          from: [
            rotatedCenter[0] - size[0] / 2,
            rotatedCenter[1] - size[1] / 2,
            rotatedCenter[2] - size[2] / 2
          ],
          to: [
            rotatedCenter[0] + size[0] / 2,
            rotatedCenter[1] + size[1] / 2,
            rotatedCenter[2] + size[2] / 2
          ],
          origin: rotatedOrigin,
          rotation,
          explicit: { ...source.explicit }
        });
      }
      continue;
    }
    warnings.push(MODEL_INSTANCE_UNKNOWN((instance as { type?: string }).type ?? 'unknown'));
  }

  nextCubes.forEach((cube) => cubeMap.set(cube.id, cube));
  return { ok: true, data: undefined };
};

export const normalizeModelSpec = (model: ModelSpec, maxCubes: number): ToolResponse<NormalizedModel> => {
  if (!model || typeof model !== 'object') {
    return err('invalid_payload', MODEL_REQUIRED);
  }

  const warnings: string[] = [];
  const policies = model.policies ?? {};
  const idPolicy = policies.idPolicy ?? 'stable_path';
  const defaultParentId = policies.defaultParentId ?? 'root';
  const enforceRoot = policies.enforceRoot ?? true;
  const snapGrid = policies.snap?.grid;
  const bounds = policies.bounds;

  const bones = Array.isArray(model.bones) ? model.bones : [];
  const cubes = Array.isArray(model.cubes) ? model.cubes : [];
  let error: ToolResponse<NormalizedModel> | null = null;
  const fail = (message: string, fix?: string): null => {
    if (!error) {
      error = err('invalid_payload', message, undefined, fix);
    }
    return null;
  };

  const boneMap = new Map<string, NormalizedBone>();
  const cubeMap = new Map<string, NormalizedCube>();

  const rigTemplate = model.rigTemplate ?? 'empty';
  const templateParts = buildRigTemplate(rigTemplate, []);
  templateParts.forEach((part) => {
    const id = part.id;
    if (!id) return;
    if (!boneMap.has(id)) {
      boneMap.set(id, {
        id,
        name: id,
        parentId: part.parent ?? null,
        pivot: snapVec3(part.pivot ?? DEFAULT_PIVOT, snapGrid),
        rotation: DEFAULT_ROTATION,
        scale: DEFAULT_SCALE,
        explicit: {
          name: false,
          parentId: part.parent !== undefined,
          pivot: part.pivot !== undefined,
          rotation: false,
          scale: false,
          visibility: false
        }
      });
    }
    if (isZeroSize(part.size)) return;
    const from: Vec3 = [part.offset[0], part.offset[1], part.offset[2]];
    const to: Vec3 = [part.offset[0] + part.size[0], part.offset[1] + part.size[1], part.offset[2] + part.size[2]];
    if (!cubeMap.has(id)) {
      cubeMap.set(id, {
        id,
        name: id,
        parentId: id,
        from: snapVec3(from, snapGrid),
        to: snapVec3(to, snapGrid),
        origin: snapVec3(part.pivot ?? DEFAULT_PIVOT, snapGrid),
        originFromSpec: part.pivot !== undefined,
        rotation: DEFAULT_ROTATION,
        inflate: part.inflate,
        mirror: part.mirror,
        explicit: {
          name: false,
          parentId: true,
          fromTo: true,
          origin: part.pivot !== undefined,
          rotation: false,
          inflate: part.inflate !== undefined,
          mirror: part.mirror !== undefined,
          visibility: false,
          boxUv: false,
          uvOffset: false
        }
      });
    }
  });

  const resolveBone = (spec: ModelBoneSpec, index: number): NormalizedBone | null => {
    const parentId = spec.parentId === undefined ? (spec.id === 'root' ? null : defaultParentId) : spec.parentId;
    const id = resolveId('bone', spec.id, spec.name, parentId, index, idPolicy);
    if (!id) {
      return fail(
        MODEL_BONE_ID_REQUIRED_EXPLICIT,
        MODEL_BONE_ID_REQUIRED_EXPLICIT_FIX
      );
    }
    const name = spec.name ?? id;
    return {
      id,
      name,
      parentId: parentId ?? null,
      pivot: snapVec3(spec.pivot ?? DEFAULT_PIVOT, snapGrid),
      pivotAnchorId: spec.pivotAnchorId,
      rotation: spec.rotation ?? DEFAULT_ROTATION,
      scale: spec.scale ?? DEFAULT_SCALE,
      visibility: spec.visibility,
      explicit: {
        name: spec.name !== undefined,
        parentId: spec.parentId !== undefined,
        pivot: spec.pivot !== undefined || spec.pivotAnchorId !== undefined,
        rotation: spec.rotation !== undefined,
        scale: spec.scale !== undefined,
        visibility: spec.visibility !== undefined
      }
    };
  };

  const resolveCube = (spec: ModelCubeSpec, index: number): NormalizedCube | null => {
    const parentId = spec.parentId ?? defaultParentId;
    const id = resolveId('cube', spec.id, spec.name, parentId, index, idPolicy);
    if (!id) {
      return fail(
        MODEL_CUBE_ID_REQUIRED_EXPLICIT,
        MODEL_CUBE_ID_REQUIRED_EXPLICIT_FIX
      );
    }
    const boundsRes = resolveCubeBounds(spec);
    if (!boundsRes) return fail(MODEL_CUBE_BOUNDS_MISSING(spec.name ?? id));
    const from = snapVec3(boundsRes.from, snapGrid);
    const to = snapVec3(boundsRes.to, snapGrid);
    const center: Vec3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
    const origin = snapVec3(spec.origin ?? center, snapGrid);
    return {
      id,
      name: spec.name ?? id,
      parentId,
      from,
      to,
      origin,
      originFromSpec: spec.origin !== undefined,
      originAnchorId: spec.originAnchorId,
      centerAnchorId: spec.centerAnchorId,
      rotation: spec.rotation ?? DEFAULT_ROTATION,
      inflate: spec.inflate,
      mirror: spec.mirror,
      visibility: spec.visibility,
      boxUv: spec.boxUv,
      uvOffset: spec.uvOffset,
      explicit: {
        name: spec.name !== undefined,
        parentId: spec.parentId !== undefined,
        fromTo: boundsRes.explicit || spec.centerAnchorId !== undefined,
        origin: spec.origin !== undefined || spec.originAnchorId !== undefined,
        rotation: spec.rotation !== undefined,
        inflate: spec.inflate !== undefined,
        mirror: spec.mirror !== undefined,
        visibility: spec.visibility !== undefined,
        boxUv: spec.boxUv !== undefined,
        uvOffset: spec.uvOffset !== undefined
      }
    };
  };

  bones.forEach((bone, index) => {
    const resolved = resolveBone(bone, index);
    if (!resolved) return;
    boneMap.set(resolved.id, resolved);
  });
  if (error) return error;

  cubes.forEach((cube, index) => {
    const resolved = resolveCube(cube, index);
    if (!resolved) return;
    cubeMap.set(resolved.id, resolved);
  });
  if (error) return error;

  if (enforceRoot && !boneMap.has('root')) {
    boneMap.set('root', {
      id: 'root',
      name: 'root',
      parentId: null,
      pivot: DEFAULT_PIVOT,
      rotation: DEFAULT_ROTATION,
      scale: DEFAULT_SCALE,
      explicit: {
        name: false,
        parentId: false,
        pivot: false,
        rotation: false,
        scale: false,
        visibility: false
      }
    });
  }

  const boneIds = new Set<string>();
  const boneNames = new Set<string>();
  for (const bone of boneMap.values()) {
    if (boneIds.has(bone.id)) return err('invalid_payload', MODEL_DUPLICATE_BONE_ID(bone.id));
    boneIds.add(bone.id);
    if (boneNames.has(bone.name)) return err('invalid_payload', MODEL_DUPLICATE_BONE_NAME(bone.name));
    boneNames.add(bone.name);
  }

  const cubeIds = new Set<string>();
  const cubeNames = new Set<string>();
  for (const cube of cubeMap.values()) {
    if (cubeIds.has(cube.id)) return err('invalid_payload', MODEL_DUPLICATE_CUBE_ID(cube.id));
    cubeIds.add(cube.id);
    if (cubeNames.has(cube.name)) return err('invalid_payload', MODEL_DUPLICATE_CUBE_NAME(cube.name));
    cubeNames.add(cube.name);
  }

  for (const bone of boneMap.values()) {
    if (bone.parentId && !boneMap.has(bone.parentId)) {
      return err('invalid_payload', MODEL_BONE_PARENT_MISSING(bone.parentId));
    }
  }

  for (const cube of cubeMap.values()) {
    if (!boneMap.has(cube.parentId)) {
      return err('invalid_payload', MODEL_CUBE_PARENT_BONE_MISSING(cube.parentId));
    }
  }

  const anchorRes = applyAnchors(model, boneMap, cubeMap);
  if (isResponseError(anchorRes)) return anchorRes;

  const instances = Array.isArray(model.instances) ? model.instances : [];
  if (instances.length > 0) {
    const applyRes = applyInstances(instances, cubeMap, warnings);
    if (isResponseError(applyRes)) return applyRes;
  }

  if (cubeMap.size > maxCubes) {
    return err('invalid_payload', TOO_MANY_CUBES(cubeMap.size, maxCubes));
  }

  const boundedBones = Array.from(boneMap.values()).map((bone) => ({
    ...bone,
    pivot: applyBounds(snapVec3(bone.pivot, snapGrid), bounds),
    rotation: bone.rotation,
    scale: bone.scale
  }));

  const boundedCubes = Array.from(cubeMap.values()).map((cube) => ({
    ...cube,
    from: applyBounds(snapVec3(cube.from, snapGrid), bounds),
    to: applyBounds(snapVec3(cube.to, snapGrid), bounds),
    origin: applyBounds(snapVec3(cube.origin, snapGrid), bounds)
  }));

  return { ok: true, data: { bones: boundedBones, cubes: boundedCubes, warnings } };
};
