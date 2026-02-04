import {
  FormatKind,
  IncludeDiffOption,
  IncludeStateOption,
  IfRevisionOption,
  ProjectStateDetail
} from '../shared';
import type { UvPaintSpec } from '../../domain/uv/paintSpec';
import type { CubeFaceDirection, FaceUvMap } from '../../domain/model';
import type {
  EnsureProjectMatch,
  EnsureProjectOnMismatch,
  EnsureProjectOnMissing,
  EnsureProjectAction,
  TexturePresetName
} from '../../shared/toolConstants';

export interface EnsureProjectPayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  action?: EnsureProjectAction;
  target?: { name?: string };
  format?: FormatKind;
  name?: string;
  match?: EnsureProjectMatch;
  onMismatch?: EnsureProjectOnMismatch;
  onMissing?: EnsureProjectOnMissing;
  confirmDiscard?: boolean;
  force?: boolean;
  dialog?: Record<string, unknown>;
}

export interface GenerateTexturePresetPayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  preset: TexturePresetName;
  width: number;
  height: number;
  uvUsageId: string;
  name?: string;
  targetId?: string;
  targetName?: string;
  mode?: 'create' | 'update';
  seed?: number;
  palette?: string[];
  uvPaint?: UvPaintSpec;
}

export interface AutoUvAtlasPayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  padding?: number;
  apply?: boolean;
}

export interface ReadTexturePayload {
  id?: string;
  name?: string;
  saveToTmp?: boolean;
  tmpName?: string;
  tmpPrefix?: string;
}

export type ExportTraceLogMode = 'auto' | 'writeFile' | 'export';

export interface ExportTraceLogPayload {
  mode?: ExportTraceLogMode;
  destPath?: string;
  fileName?: string;
}

export interface ReloadPluginsPayload {
  confirm?: boolean;
  delayMs?: number;
}

export interface GetProjectStatePayload {
  detail?: ProjectStateDetail;
  includeUsage?: boolean;
}

export interface SetProjectTextureResolutionPayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  width: number;
  height: number;
  modifyUv?: boolean;
}

export interface PreflightTexturePayload {
  textureId?: string;
  textureName?: string;
  includeUsage?: boolean;
}

export interface DeleteTexturePayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  id?: string;
  name?: string;
}

export interface AssignTexturePayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  textureId?: string;
  textureName?: string;
  cubeIds?: string[];
  cubeNames?: string[];
  faces?: CubeFaceDirection[];
}

export interface SetFaceUvPayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  cubeId?: string;
  cubeName?: string;
  faces: FaceUvMap;
}

export interface AddBonePayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  id?: string;
  name: string;
  parent?: string;
  parentId?: string;
  pivot?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  visibility?: boolean;
}

export interface UpdateBonePayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  id?: string;
  name?: string;
  newName?: string;
  parent?: string;
  parentId?: string;
  parentRoot?: boolean;
  pivot?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  visibility?: boolean;
}

export interface DeleteBonePayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  id?: string;
  name?: string;
  ids?: string[];
  names?: string[];
}

export interface AddCubePayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  id?: string;
  name: string;
  from: [number, number, number];
  to: [number, number, number];
  bone?: string;
  boneId?: string;
  origin?: [number, number, number];
  rotation?: [number, number, number];
  inflate?: number;
  mirror?: boolean;
  visibility?: boolean;
  boxUv?: boolean;
  uvOffset?: [number, number];
}

export interface UpdateCubePayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  id?: string;
  name?: string;
  newName?: string;
  bone?: string;
  boneId?: string;
  boneRoot?: boolean;
  from?: [number, number, number];
  to?: [number, number, number];
  origin?: [number, number, number];
  rotation?: [number, number, number];
  inflate?: number;
  mirror?: boolean;
  visibility?: boolean;
  boxUv?: boolean;
  uvOffset?: [number, number];
}

export interface DeleteCubePayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  id?: string;
  name?: string;
  ids?: string[];
  names?: string[];
}

export interface CreateAnimationClipPayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  id?: string;
  name: string;
  length: number;
  loop: boolean;
  fps: number;
}

export interface UpdateAnimationClipPayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  id?: string;
  name?: string;
  newName?: string;
  length?: number;
  loop?: boolean;
  fps?: number;
}

export interface DeleteAnimationClipPayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  id?: string;
  name?: string;
  ids?: string[];
  names?: string[];
}

export interface SetKeyframesPayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  clipId?: string;
  clip: string;
  bone: string;
  channel: 'rot' | 'pos' | 'scale';
  keys: [{ time: number; value: [number, number, number]; interp?: 'linear' | 'step' | 'catmullrom' }];
}

export interface SetTriggerKeyframesPayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  clipId?: string;
  clip: string;
  channel: 'sound' | 'particle' | 'timeline';
  keys: [{ time: number; value: string | string[] | Record<string, unknown> }];
}

export interface ExportPayload extends IncludeStateOption, IfRevisionOption {
  format: 'java_block_item_json' | 'gecko_geo_anim' | 'animated_java';
  destPath: string;
}

export interface ValidatePayload extends IncludeStateOption, IfRevisionOption {}

