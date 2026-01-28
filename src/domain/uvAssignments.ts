import { CUBE_FACE_DIRECTIONS } from './model';
import type { CubeFaceDirection } from './model';
import type { DomainResult } from './result';
import { fail, ok } from './result';
import {
  UV_ASSIGNMENTS_REQUIRED,
  UV_ASSIGNMENT_OBJECT_REQUIRED,
  UV_ASSIGNMENT_TARGET_REQUIRED,
  UV_ASSIGNMENT_CUBE_IDS_STRING_ARRAY,
  UV_ASSIGNMENT_CUBE_NAMES_STRING_ARRAY,
  UV_ASSIGNMENT_FACES_REQUIRED,
  UV_ASSIGNMENT_FACES_NON_EMPTY,
  UV_ASSIGNMENT_INVALID_FACE,
  UV_ASSIGNMENT_UV_FORMAT,
  UV_ASSIGNMENT_UV_NUMBERS
} from '../shared/messages';

export type UvFaceMap = Partial<Record<CubeFaceDirection, [number, number, number, number]>>;

export type UvAssignmentSpecLike = {
  cubeId?: string;
  cubeName?: string;
  cubeIds?: string[];
  cubeNames?: string[];
  faces: UvFaceMap;
};

export const validateUvAssignments = (
  assignments: UvAssignmentSpecLike[]
): DomainResult<{ valid: true }> => {
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return fail('invalid_payload', UV_ASSIGNMENTS_REQUIRED, { reason: 'assignments_required' });
  }
  for (const assignment of assignments) {
    if (!assignment || typeof assignment !== 'object') {
      return fail('invalid_payload', UV_ASSIGNMENT_OBJECT_REQUIRED, { reason: 'assignment_object_required' });
    }
    const hasTarget =
      Boolean(assignment.cubeId) ||
      Boolean(assignment.cubeName) ||
      (Array.isArray(assignment.cubeIds) && assignment.cubeIds.length > 0) ||
      (Array.isArray(assignment.cubeNames) && assignment.cubeNames.length > 0);
    if (!hasTarget) {
      return fail('invalid_payload', UV_ASSIGNMENT_TARGET_REQUIRED, { reason: 'target_required' });
    }
    if (assignment.cubeIds && !assignment.cubeIds.every((id: unknown) => typeof id === 'string')) {
      return fail('invalid_payload', UV_ASSIGNMENT_CUBE_IDS_STRING_ARRAY, { reason: 'cube_ids_string_array' });
    }
    if (assignment.cubeNames && !assignment.cubeNames.every((name: unknown) => typeof name === 'string')) {
      return fail('invalid_payload', UV_ASSIGNMENT_CUBE_NAMES_STRING_ARRAY, { reason: 'cube_names_string_array' });
    }
    if (!assignment.faces || typeof assignment.faces !== 'object') {
      return fail('invalid_payload', UV_ASSIGNMENT_FACES_REQUIRED, { reason: 'faces_required' });
    }
    const faceEntries = Object.entries(assignment.faces);
    if (faceEntries.length === 0) {
      return fail('invalid_payload', UV_ASSIGNMENT_FACES_NON_EMPTY, { reason: 'faces_non_empty' });
    }
    for (const [faceKey, uv] of faceEntries) {
      if (!VALID_FACES.has(faceKey as CubeFaceDirection)) {
        return fail('invalid_payload', UV_ASSIGNMENT_INVALID_FACE(faceKey), {
          reason: 'invalid_face',
          face: faceKey
        });
      }
      if (!Array.isArray(uv) || uv.length !== 4) {
        return fail('invalid_payload', UV_ASSIGNMENT_UV_FORMAT(faceKey), {
          reason: 'uv_format',
          face: faceKey
        });
      }
      if (!uv.every((value) => Number.isFinite(value))) {
        return fail('invalid_payload', UV_ASSIGNMENT_UV_NUMBERS(faceKey), {
          reason: 'uv_numbers',
          face: faceKey
        });
      }
    }
  }
  return ok({ valid: true });
};

const VALID_FACES = new Set<CubeFaceDirection>(CUBE_FACE_DIRECTIONS);
