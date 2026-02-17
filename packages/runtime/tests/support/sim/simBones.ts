import type { BoneCommand, UpdateBoneCommand, DeleteBoneCommand } from '../../../src/ports/editor';
import type { ToolError } from '/contracts/types/internal';
import type { BlockbenchSimState } from './simTypes';
import { error } from './simUtils';

export type SimBoneContext = {
  state: BlockbenchSimState;
};

export const createBoneOps = (ctx: SimBoneContext) => {
  const addBone = (params: BoneCommand): ToolError | null => {
    const exists = ctx.state.bones.find((bone) => bone.id === params.id || bone.name === params.name);
    if (exists) return error('invalid_payload', `Bone already exists: ${params.name}`);
    ctx.state.bones.push({
      id: params.id,
      name: params.name,
      parent: params.parent,
      pivot: params.pivot,
      rotation: params.rotation,
      scale: params.scale,
      visibility: params.visibility
    });
    return null;
  };

  const updateBone = (params: UpdateBoneCommand): ToolError | null => {
    const target = ctx.state.bones.find((bone) => bone.id === params.id || bone.name === params.name);
    if (!target) return error('invalid_payload', `Bone not found: ${params.name ?? params.id ?? 'unknown'}`);
    if (params.newName) target.name = params.newName;
    if (params.parentRoot) {
      target.parent = undefined;
    } else if (params.parent !== undefined) {
      target.parent = params.parent ?? undefined;
    }
    if (params.pivot) target.pivot = params.pivot;
    if (params.rotation) target.rotation = params.rotation;
    if (params.scale) target.scale = params.scale;
    if (params.visibility !== undefined) target.visibility = params.visibility;
    return null;
  };

  const deleteBone = (params: DeleteBoneCommand): ToolError | null => {
    const before = ctx.state.bones.length;
    ctx.state.bones = ctx.state.bones.filter(
      (bone) => !((params.id && bone.id === params.id) || (params.name && bone.name === params.name))
    );
    if (before === ctx.state.bones.length) {
      return error('invalid_payload', `Bone not found: ${params.name ?? params.id ?? 'unknown'}`);
    }
    return null;
  };

  return { addBone, updateBone, deleteBone };
};
