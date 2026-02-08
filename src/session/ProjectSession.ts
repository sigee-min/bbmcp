import type { FormatKind, ToolError, ToolResponse } from '../types/internal';
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
import type { AnimationTimePolicy } from '../domain/animation/timePolicy';
import { SessionStateStore } from './SessionStateStore';
import { SessionMutators } from './SessionMutators';

export class ProjectSession {
  private readonly store = new SessionStateStore();
  private readonly mutators = new SessionMutators(() => this.store.getState());

  create(
    format: FormatKind,
    name: string,
    formatId?: string | null
  ): ToolResponse<{ id: string; format: FormatKind; name: string }> {
    return this.store.create(format, name, formatId);
  }

  attach(snapshot: SessionState): ToolResponse<{ id: string; format: FormatKind; name: string | null }> {
    return this.store.attach(snapshot);
  }

  reset(): ToolResponse<{ ok: true }> {
    return this.store.reset();
  }

  snapshot(): SessionState {
    return this.store.snapshot();
  }

  setAnimationTimePolicy(policy?: Partial<AnimationTimePolicy>) {
    this.store.setAnimationTimePolicy(policy);
  }

  setUvPixelsPerBlock(value?: number) {
    this.store.setUvPixelsPerBlock(value);
  }

  ensureActive(): ToolError | null {
    return this.store.ensureActive();
  }

  addBone(bone: TrackedBone) {
    this.mutators.addBone(bone);
  }

  updateBone(name: string, updates: BoneUpdate): boolean {
    return this.mutators.updateBone(name, updates);
  }

  removeBones(names: string[] | Set<string>): { removedBones: number; removedCubes: number } {
    return this.mutators.removeBones(names);
  }

  addCube(cube: TrackedCube) {
    this.mutators.addCube(cube);
  }

  updateCube(name: string, updates: CubeUpdate): boolean {
    return this.mutators.updateCube(name, updates);
  }

  removeCubes(names: string[] | Set<string>): number {
    return this.mutators.removeCubes(names);
  }

  addMesh(mesh: TrackedMesh) {
    this.mutators.addMesh(mesh);
  }

  updateMesh(name: string, updates: MeshUpdate): boolean {
    return this.mutators.updateMesh(name, updates);
  }

  removeMeshes(names: string[] | Set<string>): number {
    return this.mutators.removeMeshes(names);
  }

  addTexture(tex: TrackedTexture) {
    this.mutators.addTexture(tex);
  }

  updateTexture(name: string, updates: TextureUpdate): boolean {
    return this.mutators.updateTexture(name, updates);
  }

  removeTextures(names: string[] | Set<string>): number {
    return this.mutators.removeTextures(names);
  }

  addAnimation(anim: TrackedAnimation) {
    this.mutators.addAnimation(anim);
  }

  updateAnimation(name: string, updates: AnimationUpdate): boolean {
    return this.mutators.updateAnimation(name, updates);
  }

  removeAnimations(names: string[] | Set<string>): number {
    return this.mutators.removeAnimations(names);
  }

  upsertAnimationChannel(clip: string, channel: TrackedAnimationChannel) {
    this.mutators.upsertAnimationChannel(clip, channel);
  }

  upsertAnimationTrigger(clip: string, trigger: TrackedAnimationTrigger) {
    this.mutators.upsertAnimationTrigger(clip, trigger);
  }
}

