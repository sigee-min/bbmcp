import type {
  SessionState,
  TrackedAnimation,
  TrackedAnimationChannel,
  TrackedAnimationTrigger,
  TrackedBone,
  TrackedCube,
  TrackedMesh,
  TrackedTexture
} from './types';
import type { AnimationUpdate, BoneUpdate, CubeUpdate, MeshUpdate, TextureUpdate } from './types';
import {
  addAnimation,
  addBone,
  addCube,
  addMesh,
  addTexture,
  removeAnimations,
  removeBones,
  removeCubes,
  removeMeshes,
  removeTextures,
  updateAnimation,
  updateBone,
  updateCube,
  updateMesh,
  updateTexture,
  upsertAnimationChannel,
  upsertAnimationTrigger
} from './mutators';

export type SessionMutation =
  | { type: 'add_bone'; bone: TrackedBone }
  | { type: 'update_bone'; name: string; updates: BoneUpdate }
  | { type: 'remove_bones'; names: string[] | Set<string> }
  | { type: 'add_cube'; cube: TrackedCube }
  | { type: 'update_cube'; name: string; updates: CubeUpdate }
  | { type: 'remove_cubes'; names: string[] | Set<string> }
  | { type: 'add_mesh'; mesh: TrackedMesh }
  | { type: 'update_mesh'; name: string; updates: MeshUpdate }
  | { type: 'remove_meshes'; names: string[] | Set<string> }
  | { type: 'add_texture'; texture: TrackedTexture }
  | { type: 'update_texture'; name: string; updates: TextureUpdate }
  | { type: 'remove_textures'; names: string[] | Set<string> }
  | { type: 'add_animation'; animation: TrackedAnimation }
  | { type: 'update_animation'; name: string; updates: AnimationUpdate }
  | { type: 'remove_animations'; names: string[] | Set<string> }
  | { type: 'upsert_animation_channel'; clip: string; channel: TrackedAnimationChannel }
  | { type: 'upsert_animation_trigger'; clip: string; trigger: TrackedAnimationTrigger };

type SessionMutationResultMap = {
  add_bone: void;
  update_bone: boolean;
  remove_bones: { removedBones: number; removedCubes: number };
  add_cube: void;
  update_cube: boolean;
  remove_cubes: number;
  add_mesh: void;
  update_mesh: boolean;
  remove_meshes: number;
  add_texture: void;
  update_texture: boolean;
  remove_textures: number;
  add_animation: void;
  update_animation: boolean;
  remove_animations: number;
  upsert_animation_channel: void;
  upsert_animation_trigger: void;
};

type MutationResult<T extends SessionMutation> = SessionMutationResultMap[T['type']];

export const applySessionMutation = <T extends SessionMutation>(
  state: SessionState,
  mutation: T
): MutationResult<T> => {
  switch (mutation.type) {
    case 'add_bone':
      addBone(state, mutation.bone);
      return undefined as MutationResult<T>;
    case 'update_bone':
      return updateBone(state, mutation.name, mutation.updates) as MutationResult<T>;
    case 'remove_bones':
      return removeBones(state, mutation.names) as MutationResult<T>;
    case 'add_cube':
      addCube(state, mutation.cube);
      return undefined as MutationResult<T>;
    case 'update_cube':
      return updateCube(state, mutation.name, mutation.updates) as MutationResult<T>;
    case 'remove_cubes':
      return removeCubes(state, mutation.names) as MutationResult<T>;
    case 'add_mesh':
      addMesh(state, mutation.mesh);
      return undefined as MutationResult<T>;
    case 'update_mesh':
      return updateMesh(state, mutation.name, mutation.updates) as MutationResult<T>;
    case 'remove_meshes':
      return removeMeshes(state, mutation.names) as MutationResult<T>;
    case 'add_texture':
      addTexture(state, mutation.texture);
      return undefined as MutationResult<T>;
    case 'update_texture':
      return updateTexture(state, mutation.name, mutation.updates) as MutationResult<T>;
    case 'remove_textures':
      return removeTextures(state, mutation.names) as MutationResult<T>;
    case 'add_animation':
      addAnimation(state, mutation.animation);
      return undefined as MutationResult<T>;
    case 'update_animation':
      return updateAnimation(state, mutation.name, mutation.updates) as MutationResult<T>;
    case 'remove_animations':
      return removeAnimations(state, mutation.names) as MutationResult<T>;
    case 'upsert_animation_channel':
      upsertAnimationChannel(state, mutation.clip, mutation.channel);
      return undefined as MutationResult<T>;
    case 'upsert_animation_trigger':
      upsertAnimationTrigger(state, mutation.clip, mutation.trigger);
      return undefined as MutationResult<T>;
    default:
      return undefined as MutationResult<T>;
  }
};
