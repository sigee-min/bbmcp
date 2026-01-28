import {
  FormatKind,
  EnsureProjectMatch,
  EnsureProjectOnMismatch,
  EnsureProjectOnMissing,
  CubeFaceDirection,
  ProjectStateDetail,
  TexturePresetName,
  UvPaintMapping,
  UvPaintScope,
  UvPaintSource,
  UvPaintSpec,
  UvPaintTarget
} from './types';
import type { FaceUvMap } from './domain/model';
import type {
  EntityFormat,
  GeckoLibTargetVersion,
  RigTemplateKind
} from './shared/toolConstants';

export type { RigTemplateKind, ProxyTool, EntityFormat, GeckoLibTargetVersion } from './shared/toolConstants';

export type ModelIdPolicy = 'explicit' | 'stable_path' | 'hash';

export type ModelSpecUnits = 'px';

export type ModelInstance =
  | {
      type: 'mirror';
      sourceCubeId: string;
      axis: 'x' | 'y' | 'z';
      about?: number;
      newId?: string;
      newName?: string;
    }
  | {
      type: 'repeat';
      sourceCubeId: string;
      count: number;
      delta: [number, number, number];
      prefix?: string;
    }
  | {
      type: 'radial';
      sourceCubeId: string;
      count: number;
      axis: 'x' | 'y' | 'z';
      radius: number;
      center?: [number, number, number];
      startAngle?: number;
      prefix?: string;
    };

export type ModelAnchor = {
  id: string;
  target: { boneId?: string; cubeId?: string };
  offset?: [number, number, number];
};

export type ModelBoneSpec = {
  id?: string;
  name?: string;
  parentId?: string | null;
  pivot?: [number, number, number];
  pivotAnchorId?: string;
  rotation?: [number, number, number];
  scale?: [number, number, number];
  visibility?: boolean;
};

export type ModelCubeSpec = {
  id?: string;
  name?: string;
  parentId?: string;
  from?: [number, number, number];
  to?: [number, number, number];
  center?: [number, number, number];
  size?: [number, number, number];
  origin?: [number, number, number];
  originAnchorId?: string;
  centerAnchorId?: string;
  rotation?: [number, number, number];
  inflate?: number;
  mirror?: boolean;
  visibility?: boolean;
  boxUv?: boolean;
  uvOffset?: [number, number];
};

export type ModelSpec = {
  units?: ModelSpecUnits;
  rigTemplate?: RigTemplateKind;
  bones?: ModelBoneSpec[];
  cubes?: ModelCubeSpec[];
  instances?: ModelInstance[];
  anchors?: ModelAnchor[];
  policies?: {
    idPolicy?: ModelIdPolicy;
    defaultParentId?: string;
    enforceRoot?: boolean;
    snap?: { grid?: number };
    bounds?: { min?: [number, number, number]; max?: [number, number, number] };
  };
};

export type ModelEnsureProjectOptions = {
  format?: FormatKind;
  name?: string;
  match?: EnsureProjectMatch;
  onMismatch?: EnsureProjectOnMismatch;
  onMissing?: EnsureProjectOnMissing;
  confirmDiscard?: boolean;
  confirmDialog?: boolean;
  dialog?: Record<string, unknown>;
};

export interface ModelPipelinePayload {
  model: ModelSpec;
  mode?: 'create' | 'merge' | 'replace' | 'patch';
  ensureProject?: ModelEnsureProjectOptions;
  deleteOrphans?: boolean;
  planOnly?: boolean;
  preview?: {
    mode: 'fixed' | 'turntable';
    angle?: [number, number] | [number, number, number];
    clip?: string;
    timeSeconds?: number;
    durationSeconds?: number;
    fps?: number;
    output?: 'single' | 'sequence';
    saveToTmp?: boolean;
    tmpName?: string;
    tmpPrefix?: string;
  };
  validate?: boolean;
  export?: { format: 'java_block_item_json' | 'gecko_geo_anim' | 'animated_java'; destPath: string };
  includeState?: boolean;
  includeDiff?: boolean;
  diffDetail?: ProjectStateDetail;
  ifRevision?: string;
}

export interface TextureSpec {
  mode?: 'create' | 'update';
  id?: string;
  targetId?: string;
  targetName?: string;
  name?: string;
  width?: number;
  height?: number;
  background?: string;
  useExisting?: boolean;
  detectNoChange?: boolean;
  uvPaint?: UvPaintSpec;
  ops?: TextureOp[];
}

export type { UvPaintScope, UvPaintMapping, UvPaintTarget, UvPaintSource, UvPaintSpec };
export type TextureOp =
  | { op: 'set_pixel'; x: number; y: number; color: string }
  | { op: 'fill_rect'; x: number; y: number; width: number; height: number; color: string }
  | { op: 'draw_rect'; x: number; y: number; width: number; height: number; color: string; lineWidth?: number }
  | { op: 'draw_line'; x1: number; y1: number; x2: number; y2: number; color: string; lineWidth?: number };

export type UvFaceDirection = CubeFaceDirection;

export type UvFaceMap = FaceUvMap;

export type UvAssignmentSpec = {
  cubeId?: string;
  cubeName?: string;
  cubeIds?: string[];
  cubeNames?: string[];
  faces: UvFaceMap;
};

export interface ApplyUvSpecPayload {
  assignments: UvAssignmentSpec[];
  uvUsageId: string;
  includeState?: boolean;
  includeDiff?: boolean;
  diffDetail?: ProjectStateDetail;
  ifRevision?: string;
}

export interface ApplyTextureSpecPayload {
  textures: TextureSpec[];
  uvUsageId: string;
  autoRecover?: boolean;
  includeState?: boolean;
  includeDiff?: boolean;
  diffDetail?: ProjectStateDetail;
  ifRevision?: string;
}

export type EntityAnimationChannel = {
  bone: string;
  channel: 'rot' | 'pos' | 'scale';
  keys: { time: number; value: [number, number, number]; interp?: 'linear' | 'step' | 'catmullrom' }[];
};

export type EntityAnimationTriggerType = 'sound' | 'particle' | 'timeline';

export type EntityAnimationTrigger = {
  type: EntityAnimationTriggerType;
  keys: { time: number; value: string | string[] | Record<string, unknown> }[];
};

export type EntityAnimationSpec = {
  name: string;
  length: number;
  loop: boolean;
  fps?: number;
  mode?: 'create' | 'update';
  channels?: EntityAnimationChannel[];
  triggers?: EntityAnimationTrigger[];
};

export type EntityEnsureProjectOptions = {
  name?: string;
  match?: EnsureProjectMatch;
  onMismatch?: EnsureProjectOnMismatch;
  onMissing?: EnsureProjectOnMissing;
  confirmDiscard?: boolean;
  confirmDialog?: boolean;
  dialog?: Record<string, unknown>;
};

export interface EntityPipelinePayload {
  format: EntityFormat;
  targetVersion?: GeckoLibTargetVersion;
  ensureProject?: boolean | EntityEnsureProjectOptions;
  planOnly?: boolean;
  model?: ModelSpec;
  textures?: TextureSpec[];
  uvUsageId?: string;
  autoRecover?: boolean;
  animations?: EntityAnimationSpec[];
  includeState?: boolean;
  includeDiff?: boolean;
  diffDetail?: ProjectStateDetail;
  ifRevision?: string;
}

export type TexturePipelineAssign = {
  textureId?: string;
  textureName?: string;
  cubeIds?: string[];
  cubeNames?: string[];
  faces?: CubeFaceDirection[];
};

export type TexturePipelineUv = {
  assignments: UvAssignmentSpec[];
};

export type TexturePipelinePreset = {
  preset: TexturePresetName;
  width: number;
  height: number;
  name?: string;
  targetId?: string;
  targetName?: string;
  mode?: 'create' | 'update';
  seed?: number;
  palette?: string[];
  uvPaint?: UvPaintSpec;
};

export type TexturePipelinePreflight = {
  includeUsage?: boolean;
};

export type TexturePipelinePreview = {
  mode: 'fixed' | 'turntable';
  angle?: [number, number] | [number, number, number];
  clip?: string;
  timeSeconds?: number;
  durationSeconds?: number;
  fps?: number;
  output?: 'single' | 'sequence';
  saveToTmp?: boolean;
  tmpName?: string;
  tmpPrefix?: string;
};

export interface TexturePipelinePayload {
  assign?: TexturePipelineAssign[];
  uv?: TexturePipelineUv;
  textures?: TextureSpec[];
  presets?: TexturePipelinePreset[];
  autoRecover?: boolean;
  preflight?: TexturePipelinePreflight;
  preview?: TexturePipelinePreview;
  planOnly?: boolean;
  includeState?: boolean;
  includeDiff?: boolean;
  diffDetail?: ProjectStateDetail;
  ifRevision?: string;
}





