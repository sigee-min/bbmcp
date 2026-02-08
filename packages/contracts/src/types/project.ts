import type { TextureFrameOrderType, TextureMeta, TexturePbrChannel, TextureRenderMode, TextureRenderSides } from './texture';
import type { CubeFaceDirection, FormatKind, ProjectStateDetail } from './shared';

type MeshSymmetryAxis = 'none' | 'x' | 'y' | 'z';

type MeshUvPolicy = {
  symmetryAxis?: MeshSymmetryAxis;
  texelDensity?: number;
  padding?: number;
};

interface TrackedBone {
  id?: string;
  name: string;
  parent?: string;
  pivot: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  visibility?: boolean;
}

interface TrackedCube {
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

interface TrackedMeshVertex {
  id: string;
  pos: [number, number, number];
}

interface TrackedMeshFaceUv {
  vertexId: string;
  uv: [number, number];
}

interface TrackedMeshFace {
  id?: string;
  vertices: string[];
  uv?: TrackedMeshFaceUv[];
  texture?: string | false;
}

interface TrackedMesh {
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

interface TrackedTexture {
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

interface TrackedAnimationChannel {
  bone: string;
  channel: 'rot' | 'pos' | 'scale';
  keys: { time: number; value: [number, number, number]; interp?: 'linear' | 'step' | 'catmullrom' }[];
}

interface TrackedAnimationTrigger {
  type: 'sound' | 'particle' | 'timeline';
  keys: { time: number; value: string | string[] | Record<string, unknown> }[];
}

interface TrackedAnimation {
  id?: string;
  name: string;
  length: number;
  loop: boolean;
  fps?: number;
  channels?: TrackedAnimationChannel[];
  triggers?: TrackedAnimationTrigger[];
}

export interface ProjectDiffCounts {
  added: number;
  removed: number;
  changed: number;
}

export interface ProjectDiffCountsByKind {
  bones: ProjectDiffCounts;
  cubes: ProjectDiffCounts;
  meshes?: ProjectDiffCounts;
  textures: ProjectDiffCounts;
  animations: ProjectDiffCounts;
}

export interface ProjectDiffEntry<T> {
  key: string;
  item: T;
}

export interface ProjectDiffChange<T> {
  key: string;
  before: T;
  after: T;
}

export interface ProjectDiffSet<T> {
  added: Array<ProjectDiffEntry<T>>;
  removed: Array<ProjectDiffEntry<T>>;
  changed: Array<ProjectDiffChange<T>>;
}

export interface ProjectDiff {
  sinceRevision: string;
  currentRevision: string;
  baseMissing?: boolean;
  counts: ProjectDiffCountsByKind;
  bones?: ProjectDiffSet<TrackedBone>;
  cubes?: ProjectDiffSet<TrackedCube>;
  meshes?: ProjectDiffSet<TrackedMesh>;
  textures?: ProjectDiffSet<TrackedTexture>;
  animations?: ProjectDiffSet<TrackedAnimation>;
}

export interface ProjectState {
  id: string;
  active: boolean;
  name: string | null;
  format: FormatKind | null;
  formatId?: string | null;
  dirty?: boolean;
  revision: string;
  textureResolution?: { width: number; height: number };
  uvPixelsPerBlock?: number;
  textureUsage?: ProjectTextureUsage;
  counts: {
    bones: number;
    cubes: number;
    meshes?: number;
    meshVertices?: number;
    meshFaces?: number;
    textures: number;
    animations: number;
  };
  bones?: TrackedBone[];
  cubes?: TrackedCube[];
  meshes?: TrackedMesh[];
  textures?: TrackedTexture[];
  animations?: TrackedAnimation[];
}

export type ProjectTextureUsageFace = {
  face: CubeFaceDirection;
  uv?: [number, number, number, number];
};

export type ProjectTextureUsageCube = {
  id?: string;
  name: string;
  faces: ProjectTextureUsageFace[];
};

export type ProjectTextureUsageEntry = {
  id?: string;
  name: string;
  cubeCount: number;
  faceCount: number;
  cubes: ProjectTextureUsageCube[];
};

export type ProjectTextureUsageUnresolved = {
  textureRef: string;
  cubeId?: string;
  cubeName: string;
  face: CubeFaceDirection;
};

export type ProjectTextureUsage = {
  textures: ProjectTextureUsageEntry[];
  unresolved?: ProjectTextureUsageUnresolved[];
};

export interface ProjectInfo {
  id: string;
  name: string | null;
  format: FormatKind | null;
  formatId?: string | null;
}

export type WithState<T> = T & { state?: ProjectState | null; diff?: ProjectDiff | null; revision?: string };

export type { ProjectStateDetail };
