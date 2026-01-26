import {
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

export interface ModelPart {
  id: string;
  size: [number, number, number];
  offset: [number, number, number];
  inflate?: number;
  mirror?: boolean;
  pivot?: [number, number, number];
  parent?: string;
}

export interface ModelSpec {
  rigTemplate: RigTemplateKind;
  parts: ModelPart[];
}

export interface ApplyModelSpecPayload {
  model: ModelSpec;
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

export interface ApplyEntitySpecPayload {
  format: EntityFormat;
  targetVersion?: GeckoLibTargetVersion;
  ensureProject?: boolean | EntityEnsureProjectOptions;
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
  includeState?: boolean;
  includeDiff?: boolean;
  diffDetail?: ProjectStateDetail;
  ifRevision?: string;
}





