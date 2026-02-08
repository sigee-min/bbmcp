import type { BoneUpdate, SessionState, TrackedBone } from '../types';

export const addBone = (state: SessionState, bone: TrackedBone) => {
  state.bones.push(bone);
};

export const updateBone = (state: SessionState, name: string, updates: BoneUpdate): boolean => {
  const bone = state.bones.find((b) => b.name === name);
  if (!bone) return false;
  const oldName = bone.name;
  if (updates.id) bone.id = updates.id;
  const nextName = updates.newName;
  if (nextName && nextName !== oldName) {
    bone.name = nextName;
    state.bones.forEach((b) => {
      if (b.parent === oldName) b.parent = nextName;
    });
    state.cubes.forEach((c) => {
      if (c.bone === oldName) c.bone = nextName;
    });
  }
  if (updates.parent !== undefined) {
    bone.parent = updates.parent ?? undefined;
  }
  if (updates.pivot) bone.pivot = updates.pivot;
  if (updates.rotation) bone.rotation = updates.rotation;
  if (updates.scale) bone.scale = updates.scale;
  if (typeof updates.visibility === 'boolean') bone.visibility = updates.visibility;
  return true;
};

export const removeBones = (
  state: SessionState,
  names: string[] | Set<string>
): { removedBones: number; removedCubes: number } => {
  const nameSet = names instanceof Set ? names : new Set(names);
  const beforeBones = state.bones.length;
  const beforeCubes = state.cubes.length;
  state.bones = state.bones.filter((b) => !nameSet.has(b.name));
  state.cubes = state.cubes.filter((c) => !nameSet.has(c.bone));
  return {
    removedBones: beforeBones - state.bones.length,
    removedCubes: beforeCubes - state.cubes.length
  };
};


