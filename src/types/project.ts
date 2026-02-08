import type { TrackedAnimation, TrackedBone, TrackedCube, TrackedMesh, TrackedTexture } from '../session';
import type { CubeFaceDirection } from '../shared/toolConstants';
import { FormatKind, ProjectStateDetail } from './shared';

export interface ProjectDiffCounts {
  added: number;
  removed: number;
  changed: number;
}

export interface ProjectDiffCountsByKind {
  bones: ProjectDiffCounts;
  cubes: ProjectDiffCounts;
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


