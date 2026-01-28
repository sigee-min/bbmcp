import type { ToolResponse } from '../../types';
import { err } from '../../services/toolResponse';
import { vec2Equal, vecEqual } from '../../domain/geometry';
import { DEFAULT_ROTATION, DEFAULT_SCALE } from './constants';
import type {
  ExistingBone,
  ExistingCube,
  ModelPlan,
  NormalizedBone,
  NormalizedCube,
  NormalizedModel,
  PlanOp
} from './types';
import {
  MODEL_PLAN_BONE_EXISTS,
  MODEL_PLAN_BONE_NOT_FOUND,
  MODEL_PLAN_CUBE_EXISTS,
  MODEL_PLAN_CUBE_NOT_FOUND
} from '../../shared/messages';

type BoneChanges = Partial<NormalizedBone> & { newName?: string; parentRoot?: boolean };
type CubeChanges = Partial<NormalizedCube> & { newName?: string; boneRoot?: boolean };

const computeBoneChanges = (
  bone: NormalizedBone,
  existing: ExistingBone,
  mode: 'create' | 'merge' | 'replace' | 'patch',
  desiredBoneNameById: Map<string, string>
): BoneChanges | null => {
  const changes: BoneChanges = {};
  const desiredParentName = bone.parentId ? desiredBoneNameById.get(bone.parentId) ?? bone.parentId : null;
  const parentChanged =
    desiredParentName !== undefined &&
    ((desiredParentName === null && existing.parent) ||
      (desiredParentName && desiredParentName !== existing.parent));

  if (mode === 'replace' || bone.explicit.parentId) {
    if (parentChanged) {
      changes.parentId = bone.parentId ?? null;
      if (bone.parentId === null) {
        changes.parentRoot = true;
      }
    }
  }
  if (mode === 'replace' || bone.explicit.name) {
    if (bone.name !== existing.name) changes.newName = bone.name;
  }
  if (mode === 'replace' || bone.explicit.pivot) {
    if (!vecEqual(bone.pivot, existing.pivot)) changes.pivot = bone.pivot;
  }
  if (mode === 'replace' || bone.explicit.rotation) {
    if (!vecEqual(bone.rotation, existing.rotation ?? DEFAULT_ROTATION)) changes.rotation = bone.rotation;
  }
  if (mode === 'replace' || bone.explicit.scale) {
    if (!vecEqual(bone.scale, existing.scale ?? DEFAULT_SCALE)) changes.scale = bone.scale;
  }
  if (mode === 'replace' || bone.explicit.visibility) {
    if (bone.visibility !== existing.visibility) changes.visibility = bone.visibility;
  }

  return Object.keys(changes).length > 0 ? changes : null;
};

const computeCubeChanges = (
  cube: NormalizedCube,
  existing: ExistingCube,
  mode: 'create' | 'merge' | 'replace' | 'patch',
  desiredBoneNameById: Map<string, string>
): CubeChanges | null => {
  const changes: CubeChanges = {};
  const desiredParentName = desiredBoneNameById.get(cube.parentId) ?? cube.parentId;
  const parentChanged = desiredParentName !== existing.bone;

  if (mode === 'replace' || cube.explicit.parentId) {
    if (parentChanged) {
      changes.parentId = cube.parentId;
    }
  }
  if (mode === 'replace' || cube.explicit.name) {
    if (cube.name !== existing.name) changes.newName = cube.name;
  }
  if (mode === 'replace' || cube.explicit.fromTo) {
    if (!vecEqual(cube.from, existing.from) || !vecEqual(cube.to, existing.to)) {
      changes.from = cube.from;
      changes.to = cube.to;
    }
  }
  if (mode === 'replace' || cube.explicit.origin) {
    const existingOrigin = existing.origin ?? [
      (existing.from[0] + existing.to[0]) / 2,
      (existing.from[1] + existing.to[1]) / 2,
      (existing.from[2] + existing.to[2]) / 2
    ];
    if (!vecEqual(cube.origin, existingOrigin)) changes.origin = cube.origin;
  }
  if (mode === 'replace' || cube.explicit.rotation) {
    if (!vecEqual(cube.rotation, existing.rotation ?? DEFAULT_ROTATION)) changes.rotation = cube.rotation;
  }
  if (mode === 'replace' || cube.explicit.inflate) {
    if (cube.inflate !== existing.inflate) changes.inflate = cube.inflate;
  }
  if (mode === 'replace' || cube.explicit.mirror) {
    if (cube.mirror !== existing.mirror) changes.mirror = cube.mirror;
  }
  if (mode === 'replace' || cube.explicit.visibility) {
    if (cube.visibility !== existing.visibility) changes.visibility = cube.visibility;
  }
  if (mode === 'replace' || cube.explicit.boxUv) {
    if (cube.boxUv !== existing.boxUv) changes.boxUv = cube.boxUv;
  }
  if (mode === 'replace' || cube.explicit.uvOffset) {
    if (cube.uvOffset && (!existing.uvOffset || !vec2Equal(cube.uvOffset, existing.uvOffset))) {
      changes.uvOffset = cube.uvOffset;
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
};

export const buildPlan = (
  desired: NormalizedModel,
  existingBones: ExistingBone[],
  existingCubes: ExistingCube[],
  mode: 'create' | 'merge' | 'replace' | 'patch',
  deleteOrphans: boolean
): ToolResponse<ModelPlan> => {
  const boneById = new Map(existingBones.filter((b) => b.id).map((b) => [b.id as string, b]));
  const boneByName = new Map(existingBones.map((b) => [b.name, b]));
  const cubeById = new Map(existingCubes.filter((c) => c.id).map((c) => [c.id as string, c]));
  const cubeByName = new Map(existingCubes.map((c) => [c.name, c]));

  const desiredBoneIds = new Set(desired.bones.map((bone) => bone.id));
  const desiredBoneNames = new Set(desired.bones.map((bone) => bone.name));
  const desiredCubeIds = new Set(desired.cubes.map((cube) => cube.id));
  const desiredCubeNames = new Set(desired.cubes.map((cube) => cube.name));

  const ops: PlanOp[] = [];
  let createBones = 0;
  let updateBones = 0;
  let deleteBones = 0;
  let createCubes = 0;
  let updateCubes = 0;
  let deleteCubes = 0;

  const desiredBoneNameById = new Map(desired.bones.map((bone) => [bone.id, bone.name]));

  for (const bone of desired.bones) {
    const existing = (bone.id && boneById.get(bone.id)) || boneByName.get(bone.name);
    if (!existing) {
      if (mode === 'patch') {
        return err('invalid_payload', MODEL_PLAN_BONE_NOT_FOUND(bone.name));
      }
      ops.push({ op: 'create_bone', bone });
      createBones += 1;
      continue;
    }
    if (mode === 'create') {
      return err('invalid_payload', MODEL_PLAN_BONE_EXISTS(bone.name));
    }

    const changes = computeBoneChanges(bone, existing, mode, desiredBoneNameById);
    if (changes) {
      ops.push({ op: 'update_bone', bone, changes });
      updateBones += 1;
    }
  }

  for (const cube of desired.cubes) {
    const existing = (cube.id && cubeById.get(cube.id)) || cubeByName.get(cube.name);
    if (!existing) {
      if (mode === 'patch') {
        return err('invalid_payload', MODEL_PLAN_CUBE_NOT_FOUND(cube.name));
      }
      ops.push({ op: 'create_cube', cube });
      createCubes += 1;
      continue;
    }
    if (mode === 'create') {
      return err('invalid_payload', MODEL_PLAN_CUBE_EXISTS(cube.name));
    }

    const changes = computeCubeChanges(cube, existing, mode, desiredBoneNameById);
    if (changes) {
      ops.push({ op: 'update_cube', cube, changes });
      updateCubes += 1;
    }
  }

  if ((mode === 'replace' || deleteOrphans) && deleteOrphans) {
    existingCubes.forEach((cube) => {
      if (!cube.id || !desiredCubeIds.has(cube.id)) {
        if (!cube.id && desiredCubeNames.has(cube.name)) return;
        ops.push({ op: 'delete_cube', id: cube.id, name: cube.name });
        deleteCubes += 1;
      }
    });

    existingBones.forEach((bone) => {
      if (!bone.id || !desiredBoneIds.has(bone.id)) {
        if (!bone.id && desiredBoneNames.has(bone.name)) return;
        ops.push({ op: 'delete_bone', id: bone.id, name: bone.name });
        deleteBones += 1;
      }
    });
  }

  return {
    ok: true,
    data: {
      ops,
      summary: { createBones, updateBones, deleteBones, createCubes, updateCubes, deleteCubes }
    }
  };
};

export const sortOps = (ops: PlanOp[], bones: NormalizedBone[]): PlanOp[] => {
  const boneOrder = new Map<string, number>();
  const visit = (id: string, stack: Set<string>) => {
    if (boneOrder.has(id)) return;
    if (stack.has(id)) return;
    stack.add(id);
    const bone = bones.find((b) => b.id === id);
    if (bone?.parentId) visit(bone.parentId, stack);
    boneOrder.set(id, boneOrder.size);
    stack.delete(id);
  };
  bones.forEach((bone) => visit(bone.id, new Set()));

  const priority = (op: PlanOp): number => {
    switch (op.op) {
      case 'create_bone':
        return 10;
      case 'update_bone':
        return 20;
      case 'create_cube':
        return 30;
      case 'update_cube':
        return 40;
      case 'delete_cube':
        return 50;
      case 'delete_bone':
        return 60;
      default:
        return 100;
    }
  };

  return [...ops].sort((a, b) => {
    if ((a.op === 'create_bone' || a.op === 'update_bone') && (b.op === 'create_bone' || b.op === 'update_bone')) {
      const aId = a.bone.id;
      const bId = b.bone.id;
      return (boneOrder.get(aId) ?? 0) - (boneOrder.get(bId) ?? 0);
    }
    return priority(a) - priority(b);
  });
};
