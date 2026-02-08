import type {
  AnimationUpdate,
  BoneUpdate,
  CubeUpdate,
  MeshUpdate,
  SessionState,
  TextureUpdate,
  TrackedAnimation,
  TrackedAnimationChannel,
  TrackedAnimationTrigger,
  TrackedBone,
  TrackedCube,
  TrackedMesh,
  TrackedTexture
} from './types';
import { applySessionMutation } from './stateReducer';

export class SessionMutators {
  private readonly getState: () => SessionState;

  constructor(getState: () => SessionState) {
    this.getState = getState;
  }

  addBone(bone: TrackedBone) {
    applySessionMutation(this.getState(), { type: 'add_bone', bone });
  }

  updateBone(name: string, updates: BoneUpdate): boolean {
    return applySessionMutation(this.getState(), { type: 'update_bone', name, updates });
  }

  removeBones(names: string[] | Set<string>): { removedBones: number; removedCubes: number } {
    return applySessionMutation(this.getState(), { type: 'remove_bones', names });
  }

  addCube(cube: TrackedCube) {
    applySessionMutation(this.getState(), { type: 'add_cube', cube });
  }

  updateCube(name: string, updates: CubeUpdate): boolean {
    return applySessionMutation(this.getState(), { type: 'update_cube', name, updates });
  }

  removeCubes(names: string[] | Set<string>): number {
    return applySessionMutation(this.getState(), { type: 'remove_cubes', names });
  }

  addMesh(mesh: TrackedMesh) {
    applySessionMutation(this.getState(), { type: 'add_mesh', mesh });
  }

  updateMesh(name: string, updates: MeshUpdate): boolean {
    return applySessionMutation(this.getState(), { type: 'update_mesh', name, updates });
  }

  removeMeshes(names: string[] | Set<string>): number {
    return applySessionMutation(this.getState(), { type: 'remove_meshes', names });
  }

  addTexture(tex: TrackedTexture) {
    applySessionMutation(this.getState(), { type: 'add_texture', texture: tex });
  }

  updateTexture(name: string, updates: TextureUpdate): boolean {
    return applySessionMutation(this.getState(), { type: 'update_texture', name, updates });
  }

  removeTextures(names: string[] | Set<string>): number {
    return applySessionMutation(this.getState(), { type: 'remove_textures', names });
  }

  addAnimation(anim: TrackedAnimation) {
    applySessionMutation(this.getState(), { type: 'add_animation', animation: anim });
  }

  updateAnimation(name: string, updates: AnimationUpdate): boolean {
    return applySessionMutation(this.getState(), { type: 'update_animation', name, updates });
  }

  removeAnimations(names: string[] | Set<string>): number {
    return applySessionMutation(this.getState(), { type: 'remove_animations', names });
  }

  upsertAnimationChannel(clip: string, channel: TrackedAnimationChannel) {
    applySessionMutation(this.getState(), { type: 'upsert_animation_channel', clip, channel });
  }

  upsertAnimationTrigger(clip: string, trigger: TrackedAnimationTrigger) {
    applySessionMutation(this.getState(), { type: 'upsert_animation_trigger', clip, trigger });
  }
}
