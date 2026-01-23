import { FormatKind, ToolResponse, ToolError } from './types';
import { TextureFrameOrderType, TextureMeta, TexturePbrChannel, TextureRenderMode, TextureRenderSides } from './types/texture';

export interface TrackedBone {
  id?: string;
  name: string;
  parent?: string;
  pivot: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

export interface TrackedCube {
  id?: string;
  name: string;
  from: [number, number, number];
  to: [number, number, number];
  bone: string;
  uv?: [number, number];
  inflate?: number;
  mirror?: boolean;
}

export interface TrackedTexture {
  id?: string;
  name: string;
  path?: string;
  width?: number;
  height?: number;
  contentHash?: string;
  namespace?: TextureMeta['namespace'];
  folder?: TextureMeta['folder'];
  particle?: TextureMeta['particle'];
  visible?: TextureMeta['visible'];
  renderMode?: TextureRenderMode;
  renderSides?: TextureRenderSides;
  pbrChannel?: TexturePbrChannel;
  group?: TextureMeta['group'];
  frameTime?: TextureMeta['frameTime'];
  frameOrderType?: TextureFrameOrderType;
  frameOrder?: TextureMeta['frameOrder'];
  frameInterpolate?: TextureMeta['frameInterpolate'];
  internal?: TextureMeta['internal'];
  keepSize?: TextureMeta['keepSize'];
}

export interface TrackedAnimationChannel {
  bone: string;
  channel: 'rot' | 'pos' | 'scale';
  keys: { time: number; value: [number, number, number]; interp?: 'linear' | 'step' | 'catmullrom' }[];
}

export interface TrackedAnimationTrigger {
  type: 'sound' | 'particle' | 'timeline';
  keys: { time: number; value: string | string[] | Record<string, unknown> }[];
}

export interface TrackedAnimation {
  id?: string;
  name: string;
  length: number;
  loop: boolean;
  fps?: number;
  channels?: TrackedAnimationChannel[];
  triggers?: TrackedAnimationTrigger[];
}

export interface SessionState {
  id: string | null;
  format: FormatKind | null;
  formatId?: string | null;
  name: string | null;
  dirty?: boolean;
  bones: TrackedBone[];
  cubes: TrackedCube[];
  textures: TrackedTexture[];
  animations: TrackedAnimation[];
  animationsStatus?: 'available' | 'unavailable';
}

export class ProjectSession {
  private state: SessionState = {
    id: null,
    format: null,
    formatId: null,
    name: null,
    dirty: undefined,
    bones: [],
    cubes: [],
    textures: [],
    animations: [],
    animationsStatus: 'available'
  };

  create(
    format: FormatKind,
    name: string,
    formatId?: string | null
  ): ToolResponse<{ id: string; format: FormatKind; name: string }> {
    const id = `${Date.now()}`;
    this.state = {
      id,
      format,
      formatId: formatId ?? null,
      name,
      dirty: undefined,
      bones: [],
      cubes: [],
      textures: [],
      animations: [],
      animationsStatus: 'available'
    };
    return { ok: true, data: { id, format, name } };
  }

  attach(snapshot: SessionState): ToolResponse<{ id: string; format: FormatKind; name: string | null }> {
    if (!snapshot.format) {
      return { ok: false, error: { code: 'invalid_state', message: 'No active project.' } };
    }
    const id = snapshot.id ?? `${Date.now()}`;
    const format = snapshot.format;
    const name = snapshot.name ?? null;
    this.state = {
      id,
      format,
      formatId: snapshot.formatId ?? null,
      name,
      dirty: snapshot.dirty,
      bones: [...snapshot.bones],
      cubes: [...snapshot.cubes],
      textures: [...snapshot.textures],
      animations: snapshot.animations.map((anim) => ({
        ...anim,
        channels: anim.channels ? anim.channels.map((ch) => ({ ...ch, keys: [...ch.keys] })) : undefined,
        triggers: anim.triggers ? anim.triggers.map((tr) => ({ ...tr, keys: [...tr.keys] })) : undefined
      })),
      animationsStatus: snapshot.animationsStatus ?? 'available'
    };
    return { ok: true, data: { id, format, name } };
  }

  reset(): ToolResponse<{ ok: true }> {
    this.state = {
      id: null,
      format: null,
      formatId: null,
      name: null,
      dirty: undefined,
      bones: [],
      cubes: [],
      textures: [],
      animations: [],
      animationsStatus: 'available'
    };
    return { ok: true, data: { ok: true } };
  }

  snapshot(): SessionState {
    return {
      ...this.state,
      bones: [...this.state.bones],
      cubes: [...this.state.cubes],
      textures: [...this.state.textures],
      animations: this.state.animations.map((anim) => ({
        ...anim,
        channels: anim.channels ? anim.channels.map((ch) => ({ ...ch, keys: [...ch.keys] })) : undefined,
        triggers: anim.triggers ? anim.triggers.map((tr) => ({ ...tr, keys: [...tr.keys] })) : undefined
      })),
      animationsStatus: this.state.animationsStatus
    };
  }

  ensureActive(): ToolError | null {
    if (!this.state.id || !this.state.format) {
      return { code: 'invalid_state', message: 'No active project.', details: { reason: 'no_active_project' } };
    }
    return null;
  }

  addBone(bone: TrackedBone) {
    this.state.bones.push(bone);
  }

  updateBone(
    name: string,
    updates: {
      id?: string;
      newName?: string;
      parent?: string | null;
      pivot?: [number, number, number];
      rotation?: [number, number, number];
      scale?: [number, number, number];
    }
  ): boolean {
    const bone = this.state.bones.find((b) => b.name === name);
    if (!bone) return false;
    const oldName = bone.name;
    if (updates.id) bone.id = updates.id;
    const nextName = updates.newName;
    if (nextName && nextName !== oldName) {
      bone.name = nextName;
      this.state.bones.forEach((b) => {
        if (b.parent === oldName) b.parent = nextName;
      });
      this.state.cubes.forEach((c) => {
        if (c.bone === oldName) c.bone = nextName;
      });
    }
    if (updates.parent !== undefined) {
      bone.parent = updates.parent ?? undefined;
    }
    if (updates.pivot) bone.pivot = updates.pivot;
    if (updates.rotation) bone.rotation = updates.rotation;
    if (updates.scale) bone.scale = updates.scale;
    return true;
  }

  removeBones(names: string[] | Set<string>): { removedBones: number; removedCubes: number } {
    const nameSet = names instanceof Set ? names : new Set(names);
    const beforeBones = this.state.bones.length;
    const beforeCubes = this.state.cubes.length;
    this.state.bones = this.state.bones.filter((b) => !nameSet.has(b.name));
    this.state.cubes = this.state.cubes.filter((c) => !nameSet.has(c.bone));
    return {
      removedBones: beforeBones - this.state.bones.length,
      removedCubes: beforeCubes - this.state.cubes.length
    };
  }

  addCube(cube: TrackedCube) {
    this.state.cubes.push(cube);
  }

  updateCube(
    name: string,
    updates: {
      id?: string;
      newName?: string;
      bone?: string;
      from?: [number, number, number];
      to?: [number, number, number];
      uv?: [number, number];
      inflate?: number;
      mirror?: boolean;
    }
  ): boolean {
    const cube = this.state.cubes.find((c) => c.name === name);
    if (!cube) return false;
    if (updates.id) cube.id = updates.id;
    if (updates.newName && updates.newName !== cube.name) cube.name = updates.newName;
    if (updates.bone) cube.bone = updates.bone;
    if (updates.from) cube.from = updates.from;
    if (updates.to) cube.to = updates.to;
    if (updates.uv) cube.uv = updates.uv;
    if (typeof updates.inflate === 'number') cube.inflate = updates.inflate;
    if (typeof updates.mirror === 'boolean') cube.mirror = updates.mirror;
    return true;
  }

  removeCubes(names: string[] | Set<string>): number {
    const nameSet = names instanceof Set ? names : new Set(names);
    const before = this.state.cubes.length;
    this.state.cubes = this.state.cubes.filter((c) => !nameSet.has(c.name));
    return before - this.state.cubes.length;
  }

  addTexture(tex: TrackedTexture) {
    this.state.textures.push(tex);
  }

  updateTexture(
    name: string,
    updates: {
      id?: string;
      newName?: string;
      path?: string;
      width?: number;
      height?: number;
      contentHash?: string;
      namespace?: TextureMeta['namespace'];
      folder?: TextureMeta['folder'];
      particle?: TextureMeta['particle'];
      visible?: TextureMeta['visible'];
      renderMode?: TextureRenderMode;
      renderSides?: TextureRenderSides;
      pbrChannel?: TexturePbrChannel;
      group?: TextureMeta['group'];
      frameTime?: TextureMeta['frameTime'];
      frameOrderType?: TextureFrameOrderType;
      frameOrder?: TextureMeta['frameOrder'];
      frameInterpolate?: TextureMeta['frameInterpolate'];
      internal?: TextureMeta['internal'];
      keepSize?: TextureMeta['keepSize'];
    }
  ): boolean {
    const tex = this.state.textures.find((t) => t.name === name);
    if (!tex) return false;
    if (updates.id) tex.id = updates.id;
    if (updates.newName && updates.newName !== tex.name) tex.name = updates.newName;
    if (updates.path !== undefined) tex.path = updates.path;
    if (typeof updates.width === 'number') tex.width = updates.width;
    if (typeof updates.height === 'number') tex.height = updates.height;
    if (updates.contentHash !== undefined) tex.contentHash = updates.contentHash;
    if (updates.namespace !== undefined) tex.namespace = updates.namespace;
    if (updates.folder !== undefined) tex.folder = updates.folder;
    if (updates.particle !== undefined) tex.particle = updates.particle;
    if (updates.visible !== undefined) tex.visible = updates.visible;
    if (updates.renderMode !== undefined) tex.renderMode = updates.renderMode;
    if (updates.renderSides !== undefined) tex.renderSides = updates.renderSides;
    if (updates.pbrChannel !== undefined) tex.pbrChannel = updates.pbrChannel;
    if (updates.group !== undefined) tex.group = updates.group;
    if (updates.frameTime !== undefined) tex.frameTime = updates.frameTime;
    if (updates.frameOrderType !== undefined) tex.frameOrderType = updates.frameOrderType;
    if (updates.frameOrder !== undefined) tex.frameOrder = updates.frameOrder;
    if (updates.frameInterpolate !== undefined) tex.frameInterpolate = updates.frameInterpolate;
    if (updates.internal !== undefined) tex.internal = updates.internal;
    if (updates.keepSize !== undefined) tex.keepSize = updates.keepSize;
    return true;
  }

  removeTextures(names: string[] | Set<string>): number {
    const nameSet = names instanceof Set ? names : new Set(names);
    const before = this.state.textures.length;
    this.state.textures = this.state.textures.filter((t) => !nameSet.has(t.name));
    return before - this.state.textures.length;
  }

  addAnimation(anim: TrackedAnimation) {
    this.state.animations.push(anim);
  }

  updateAnimation(
    name: string,
    updates: {
      id?: string;
      newName?: string;
      length?: number;
      loop?: boolean;
      fps?: number;
    }
  ): boolean {
    const anim = this.state.animations.find((a) => a.name === name);
    if (!anim) return false;
    if (updates.id) anim.id = updates.id;
    if (updates.newName && updates.newName !== anim.name) anim.name = updates.newName;
    if (typeof updates.length === 'number') anim.length = updates.length;
    if (typeof updates.loop === 'boolean') anim.loop = updates.loop;
    if (typeof updates.fps === 'number') anim.fps = updates.fps;
    return true;
  }

  removeAnimations(names: string[] | Set<string>): number {
    const nameSet = names instanceof Set ? names : new Set(names);
    const before = this.state.animations.length;
    this.state.animations = this.state.animations.filter((a) => !nameSet.has(a.name));
    return before - this.state.animations.length;
  }

  upsertAnimationChannel(clip: string, channel: TrackedAnimationChannel) {
    const anim = this.state.animations.find((a) => a.name === clip);
    if (!anim) return;
    anim.channels ??= [];
    const existingIndex = anim.channels.findIndex(
      (ch) => ch.bone === channel.bone && ch.channel === channel.channel
    );
    if (existingIndex >= 0) {
      anim.channels[existingIndex] = channel;
    } else {
      anim.channels.push(channel);
    }
  }

  upsertAnimationTrigger(clip: string, trigger: TrackedAnimationTrigger) {
    const anim = this.state.animations.find((a) => a.name === clip);
    if (!anim) return;
    anim.triggers ??= [];
    const existingIndex = anim.triggers.findIndex((tr) => tr.type === trigger.type);
    if (existingIndex >= 0) {
      anim.triggers[existingIndex] = trigger;
    } else {
      anim.triggers.push(trigger);
    }
  }
}
