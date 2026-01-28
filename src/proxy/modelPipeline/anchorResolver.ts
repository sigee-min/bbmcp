import type { ToolResponse } from '../../types';
import type { ModelSpec } from '../../spec';
import { err } from '../../services/toolResponse';
import type { NormalizedBone, NormalizedCube, Vec3 } from './types';
import {
  MODEL_ANCHOR_BONE_NOT_FOUND,
  MODEL_ANCHOR_CUBE_NOT_FOUND,
  MODEL_ANCHOR_CYCLE_DETECTED,
  MODEL_ANCHOR_NOT_FOUND,
  MODEL_ANCHORS_REQUIRED_FOR_IDS
} from '../../shared/messages';

export const applyAnchors = (
  model: ModelSpec,
  boneMap: Map<string, NormalizedBone>,
  cubeMap: Map<string, NormalizedCube>
): ToolResponse<void> => {
  const anchors = Array.isArray(model.anchors) ? model.anchors : [];
  const hasAnchorRefs =
    Array.isArray(model.bones) && model.bones.some((bone) => bone?.pivotAnchorId) ||
    Array.isArray(model.cubes) && model.cubes.some((cube) => cube?.centerAnchorId || cube?.originAnchorId);
  if (anchors.length === 0) {
    if (hasAnchorRefs) return err('invalid_payload', MODEL_ANCHORS_REQUIRED_FOR_IDS);
    return { ok: true, data: undefined };
  }

  let error: ToolResponse<void> | null = null;
  const fail = (message: string): null => {
    if (!error) {
      error = err<void>('invalid_payload', message);
    }
    return null;
  };

  const anchorSpecs = new Map<
    string,
    {
      target: { boneId?: string; cubeId?: string };
      offset?: Vec3;
    }
  >();
  anchors.forEach((anchor) => {
    if (!anchor || typeof anchor !== 'object') return;
    const id = anchor.id;
    if (!id) return;
    const target = anchor.target ?? {};
    anchorSpecs.set(id, {
      target: { boneId: target.boneId ?? undefined, cubeId: target.cubeId ?? undefined },
      offset: Array.isArray(anchor.offset) && anchor.offset.length === 3 ? anchor.offset : undefined
    });
  });

  const bonePivotMemo = new Map<string, Vec3>();
  const cubePlacementMemo = new Map<string, { from: Vec3; to: Vec3; origin: Vec3; center: Vec3 }>();
  const anchorPointMemo = new Map<string, Vec3>();

  const resolveAnchorPoint = (anchorId: string, stack: Set<string>): Vec3 | null => {
    if (anchorPointMemo.has(anchorId)) return anchorPointMemo.get(anchorId)!;
    const key = `anchor:${anchorId}`;
    if (stack.has(key)) return fail(MODEL_ANCHOR_CYCLE_DETECTED('anchor', anchorId));
    const anchor = anchorSpecs.get(anchorId);
    if (!anchor) return fail(MODEL_ANCHOR_NOT_FOUND(anchorId));
    stack.add(key);
    let base: Vec3 | null = null;
    if (anchor.target.boneId) {
      base = resolveBonePivot(anchor.target.boneId, stack);
    } else if (anchor.target.cubeId) {
      const placement = resolveCubePlacement(anchor.target.cubeId, stack);
      if (!placement) {
        stack.delete(key);
        return null;
      }
      const cube = cubeMap.get(anchor.target.cubeId);
      base = cube && (cube.explicit.origin || cube.originAnchorId) ? placement.origin : placement.center;
    }
    if (!base) {
      stack.delete(key);
      return null;
    }
    const offset = anchor.offset ?? [0, 0, 0];
    const point: Vec3 = [base[0] + offset[0], base[1] + offset[1], base[2] + offset[2]];
    anchorPointMemo.set(anchorId, point);
    stack.delete(key);
    return point;
  };

  const resolveBonePivot = (boneId: string, stack: Set<string>): Vec3 | null => {
    if (bonePivotMemo.has(boneId)) return bonePivotMemo.get(boneId)!;
    const key = `bone:${boneId}`;
    if (stack.has(key)) return fail(MODEL_ANCHOR_CYCLE_DETECTED('bone', boneId));
    const bone = boneMap.get(boneId);
    if (!bone) return fail(MODEL_ANCHOR_BONE_NOT_FOUND(boneId));
    stack.add(key);
    let pivot = bone.pivot;
    if (bone.pivotAnchorId) {
      const anchorPoint = resolveAnchorPoint(bone.pivotAnchorId, stack);
      if (!anchorPoint) {
        stack.delete(key);
        return null;
      }
      pivot = anchorPoint;
    }
    stack.delete(key);
    bonePivotMemo.set(boneId, pivot);
    return pivot;
  };

  const resolveCubePlacement = (
    cubeId: string,
    stack: Set<string>
  ): { from: Vec3; to: Vec3; origin: Vec3; center: Vec3 } | null => {
    if (cubePlacementMemo.has(cubeId)) return cubePlacementMemo.get(cubeId)!;
    const key = `cube:${cubeId}`;
    if (stack.has(key)) return fail(MODEL_ANCHOR_CYCLE_DETECTED('cube', cubeId));
    const cube = cubeMap.get(cubeId);
    if (!cube) return fail(MODEL_ANCHOR_CUBE_NOT_FOUND(cubeId));
    stack.add(key);
    const size: Vec3 = [cube.to[0] - cube.from[0], cube.to[1] - cube.from[1], cube.to[2] - cube.from[2]];
    const baseCenter: Vec3 = [
      (cube.from[0] + cube.to[0]) / 2,
      (cube.from[1] + cube.to[1]) / 2,
      (cube.from[2] + cube.to[2]) / 2
    ];
    let center = baseCenter;
    if (cube.centerAnchorId) {
      const anchorPoint = resolveAnchorPoint(cube.centerAnchorId, stack);
      if (!anchorPoint) {
        stack.delete(key);
        return null;
      }
      center = anchorPoint;
    }
    const from: Vec3 = cube.centerAnchorId
      ? [center[0] - size[0] / 2, center[1] - size[1] / 2, center[2] - size[2] / 2]
      : cube.from;
    const to: Vec3 = cube.centerAnchorId
      ? [center[0] + size[0] / 2, center[1] + size[1] / 2, center[2] + size[2] / 2]
      : cube.to;
    let origin: Vec3;
    if (cube.originAnchorId) {
      const anchorPoint = resolveAnchorPoint(cube.originAnchorId, stack);
      if (!anchorPoint) {
        stack.delete(key);
        return null;
      }
      origin = anchorPoint;
    } else if (cube.originFromSpec) {
      origin = cube.origin;
    } else {
      origin = center;
    }
    const placement = { from, to, origin, center };
    stack.delete(key);
    cubePlacementMemo.set(cubeId, placement);
    return placement;
  };

  for (const bone of boneMap.values()) {
    if (!bone.pivotAnchorId) continue;
    const pivot = resolveAnchorPoint(bone.pivotAnchorId, new Set());
    if (!pivot) break;
    bone.pivot = pivot;
    bone.explicit.pivot = true;
  }
  if (error) return error;

  for (const cube of cubeMap.values()) {
    if (!cube.centerAnchorId && !cube.originAnchorId) continue;
    const placement = resolveCubePlacement(cube.id, new Set());
    if (!placement) break;
    cube.from = placement.from;
    cube.to = placement.to;
    cube.origin = placement.origin;
    if (cube.centerAnchorId) {
      cube.explicit.fromTo = true;
      cube.explicit.origin = true;
    }
    if (cube.originAnchorId) {
      cube.explicit.origin = true;
    }
  }
  if (error) return error;

  return { ok: true, data: undefined };
};
