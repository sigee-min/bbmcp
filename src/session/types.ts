import type { FormatKind } from '../types/internal';
import type { TextureFrameOrderType, TextureMeta, TexturePbrChannel, TextureRenderMode, TextureRenderSides } from '../types/texture';
import type { AnimationTimePolicy } from '../domain/animation/timePolicy';
import type { MeshUvPolicy } from '../domain/mesh/autoUv';

export interface TrackedBone {
  id?: string;
  name: string;
  parent?: string;
  pivot: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  visibility?: boolean;
}

export interface TrackedCube {
  id?: string;
  name: string;
  from: [number, number, number];
  to: [number, number, number];
  bone: string;
  origin?: [number, number, number];
  rotation?: [number, number, number];
  uv?: [number, number];
  uvOffset?: [number, number];
  inflate?: number;
  mirror?: boolean;
  visibility?: boolean;
  boxUv?: boolean;
}

export interface TrackedMeshVertex {
  id: string;
  pos: [number, number, number];
}

export interface TrackedMeshFaceUv {
  vertexId: string;
  uv: [number, number];
}

export interface TrackedMeshFace {
  id?: string;
  vertices: string[];
  uv?: TrackedMeshFaceUv[];
  texture?: string | false;
}

export interface TrackedMesh {
  id?: string;
  name: string;
  bone?: string;
  origin?: [number, number, number];
  rotation?: [number, number, number];
  visibility?: boolean;
  uvPolicy?: MeshUvPolicy;
  vertices: TrackedMeshVertex[];
  faces: TrackedMeshFace[];
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

export type BoneUpdate = {
  id?: string;
  newName?: string;
  parent?: string | null;
  pivot?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  visibility?: boolean;
};

export type CubeUpdate = {
  id?: string;
  newName?: string;
  bone?: string;
  from?: [number, number, number];
  to?: [number, number, number];
  origin?: [number, number, number];
  rotation?: [number, number, number];
  uv?: [number, number];
  uvOffset?: [number, number];
  inflate?: number;
  mirror?: boolean;
  visibility?: boolean;
  boxUv?: boolean;
};

export type MeshUpdate = {
  id?: string;
  newName?: string;
  bone?: string | null;
  origin?: [number, number, number];
  rotation?: [number, number, number];
  visibility?: boolean;
  uvPolicy?: MeshUvPolicy;
  vertices?: TrackedMeshVertex[];
  faces?: TrackedMeshFace[];
};

export type TextureUpdate = {
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
};

export type AnimationUpdate = {
  id?: string;
  newName?: string;
  length?: number;
  loop?: boolean;
  fps?: number;
};

export interface SessionState {
  id: string | null;
  format: FormatKind | null;
  formatId?: string | null;
  name: string | null;
  dirty?: boolean;
  uvPixelsPerBlock?: number;
  bones: TrackedBone[];
  cubes: TrackedCube[];
  meshes?: TrackedMesh[];
  textures: TrackedTexture[];
  animations: TrackedAnimation[];
  animationsStatus?: 'available' | 'unavailable';
  animationTimePolicy: AnimationTimePolicy;
}


