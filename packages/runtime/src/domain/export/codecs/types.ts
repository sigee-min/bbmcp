import type { NonGltfExportFormat } from '../types';
import type { AnimationTimePolicy } from '../../animation/timePolicy';

export type CanonicalAnimationChannel = 'rot' | 'pos' | 'scale';
export type CanonicalTriggerType = 'sound' | 'particle' | 'timeline';
export type CanonicalInterpolation = 'linear' | 'step' | 'catmullrom';

export interface CanonicalCube {
  id?: string;
  name: string;
  bone: string;
  from: [number, number, number];
  to: [number, number, number];
  origin?: [number, number, number];
  rotation?: [number, number, number];
  uv?: [number, number];
  uvOffset?: [number, number];
  inflate?: number;
  mirror?: boolean;
}

export interface CanonicalBone {
  id?: string;
  name: string;
  parent?: string;
  pivot: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  cubes: CanonicalCube[];
}

export interface CanonicalChannelKey {
  time: number;
  vector: [number | string, number | string, number | string];
  interp?: CanonicalInterpolation;
  easing?: string;
  easingArgs?: unknown[];
  pre?: [number | string, number | string, number | string];
  post?: [number | string, number | string, number | string];
  bezier?: unknown;
}

export interface CanonicalAnimationChannelTrack {
  bone: string;
  channel: CanonicalAnimationChannel;
  keys: CanonicalChannelKey[];
}

export interface CanonicalTriggerKey {
  time: number;
  value: string | string[] | Record<string, unknown>;
}

export interface CanonicalAnimationTriggerTrack {
  type: CanonicalTriggerType;
  keys: CanonicalTriggerKey[];
}

export interface CanonicalAnimation {
  id?: string;
  name: string;
  length: number;
  loop: boolean;
  fps?: number;
  channels: CanonicalAnimationChannelTrack[];
  triggers: CanonicalAnimationTriggerTrack[];
}

export interface CanonicalMeshVertex {
  id: string;
  pos: [number, number, number];
}

export interface CanonicalMeshFaceUv {
  vertexId: string;
  uv: [number, number];
}

export interface CanonicalMeshFace {
  id?: string;
  vertices: string[];
  uv?: CanonicalMeshFaceUv[];
  texture?: string | false;
}

export interface CanonicalMesh {
  id?: string;
  name: string;
  bone?: string;
  origin?: [number, number, number];
  rotation?: [number, number, number];
  vertices: CanonicalMeshVertex[];
  faces: CanonicalMeshFace[];
}

export interface CanonicalTexture {
  id?: string;
  name: string;
  path?: string;
  width?: number;
  height?: number;
}

export interface CanonicalExportModel {
  name: string;
  formatId: string | null;
  texture: { width: number; height: number };
  timePolicy: AnimationTimePolicy;
  bones: CanonicalBone[];
  cubes: CanonicalCube[];
  meshes: CanonicalMesh[];
  textures: CanonicalTexture[];
  animations: CanonicalAnimation[];
}

export type ArtifactPath =
  | { mode: 'destination' }
  | { mode: 'base_suffix'; suffix: string };

export interface CodecArtifact {
  id: string;
  data: unknown;
  path: ArtifactPath;
  primary?: boolean;
}

export interface CodecEncodeResult {
  artifacts: CodecArtifact[];
  warnings?: string[];
  lossy?: boolean;
}

export interface ExportCodecStrategy {
  readonly format: NonGltfExportFormat;
  encode(model: CanonicalExportModel): CodecEncodeResult;
}
