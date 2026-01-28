import type { ModelSpec } from '../spec';
import type { DomainResult } from './result';
import { fail, ok } from './result';
import {
  MODEL_SPEC_ANCHOR_BONE_ID_INVALID,
  MODEL_SPEC_ANCHOR_CUBE_ID_INVALID,
  MODEL_SPEC_ANCHOR_ID_DUPLICATE,
  MODEL_SPEC_ANCHOR_ID_REQUIRED,
  MODEL_SPEC_ANCHOR_NOT_FOUND,
  MODEL_SPEC_ANCHOR_OBJECT,
  MODEL_SPEC_ANCHOR_OFFSET_INVALID,
  MODEL_SPEC_ANCHOR_REF_STRING,
  MODEL_SPEC_ANCHOR_REQUIRED,
  MODEL_SPEC_ANCHOR_TARGET_INVALID,
  MODEL_SPEC_ANCHORS_ARRAY,
  MODEL_SPEC_BONES_ARRAY,
  MODEL_SPEC_CUBES_ARRAY,
  MODEL_SPEC_INSTANCES_ARRAY,
  MODEL_SPEC_REQUIRED
} from '../shared/messages';

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export const validateModelSpec = (model: ModelSpec): DomainResult<{ valid: true }> => {
  if (!model || typeof model !== 'object') return fail('invalid_payload', MODEL_SPEC_REQUIRED);
  if (model.anchors !== undefined && !Array.isArray(model.anchors)) {
    return fail('invalid_payload', MODEL_SPEC_ANCHORS_ARRAY);
  }
  if (model.bones !== undefined && !Array.isArray(model.bones)) {
    return fail('invalid_payload', MODEL_SPEC_BONES_ARRAY);
  }
  if (model.cubes !== undefined && !Array.isArray(model.cubes)) {
    return fail('invalid_payload', MODEL_SPEC_CUBES_ARRAY);
  }
  if (model.instances !== undefined && !Array.isArray(model.instances)) {
    return fail('invalid_payload', MODEL_SPEC_INSTANCES_ARRAY);
  }

  const anchors = Array.isArray(model.anchors) ? model.anchors : [];
  const anchorIds = new Set<string>();

  for (const anchor of anchors) {
    if (!anchor || typeof anchor !== 'object') {
      return fail('invalid_payload', MODEL_SPEC_ANCHOR_OBJECT);
    }
    if (typeof anchor.id !== 'string' || anchor.id.trim().length === 0) {
      return fail('invalid_payload', MODEL_SPEC_ANCHOR_ID_REQUIRED);
    }
    if (anchorIds.has(anchor.id)) {
      return fail('invalid_payload', MODEL_SPEC_ANCHOR_ID_DUPLICATE(anchor.id));
    }
    anchorIds.add(anchor.id);
    const target = anchor.target as { boneId?: unknown; cubeId?: unknown } | undefined;
    const boneId = target?.boneId;
    const cubeId = target?.cubeId;
    if ((boneId && cubeId) || (!boneId && !cubeId)) {
      return fail('invalid_payload', MODEL_SPEC_ANCHOR_TARGET_INVALID(anchor.id));
    }
    if (boneId !== undefined && (typeof boneId !== 'string' || boneId.trim().length === 0)) {
      return fail('invalid_payload', MODEL_SPEC_ANCHOR_BONE_ID_INVALID(anchor.id));
    }
    if (cubeId !== undefined && (typeof cubeId !== 'string' || cubeId.trim().length === 0)) {
      return fail('invalid_payload', MODEL_SPEC_ANCHOR_CUBE_ID_INVALID(anchor.id));
    }
    if (anchor.offset !== undefined) {
      if (!Array.isArray(anchor.offset) || anchor.offset.length !== 3 || !anchor.offset.every(isFiniteNumber)) {
        return fail('invalid_payload', MODEL_SPEC_ANCHOR_OFFSET_INVALID(anchor.id));
      }
    }
  }

  const bones = Array.isArray(model.bones) ? model.bones : [];
  const cubes = Array.isArray(model.cubes) ? model.cubes : [];

  const assertAnchorRef = (anchorId: unknown, label: string): DomainResult<null> | null => {
    if (anchorId === undefined) return null;
    if (typeof anchorId !== 'string' || anchorId.trim().length === 0) {
      return fail('invalid_payload', MODEL_SPEC_ANCHOR_REF_STRING(label));
    }
    if (anchors.length === 0) {
      return fail('invalid_payload', MODEL_SPEC_ANCHOR_REQUIRED(label));
    }
    if (!anchorIds.has(anchorId)) {
      return fail('invalid_payload', MODEL_SPEC_ANCHOR_NOT_FOUND(anchorId));
    }
    return null;
  };

  for (const bone of bones) {
    const err = assertAnchorRef(bone?.pivotAnchorId, 'bone pivotAnchorId');
    if (err) return err as DomainResult<{ valid: true }>;
  }

  for (const cube of cubes) {
    const centerErr = assertAnchorRef(cube?.centerAnchorId, 'cube centerAnchorId');
    if (centerErr) return centerErr as DomainResult<{ valid: true }>;
    const originErr = assertAnchorRef(cube?.originAnchorId, 'cube originAnchorId');
    if (originErr) return originErr as DomainResult<{ valid: true }>;
  }

  return ok({ valid: true });
};
