import type { Capabilities } from '../capabilities';
import type { ProjectState, WithState } from '../project';
import type { RenderPreviewResult } from '../preview';
import type { TextureUsageResult } from '../textureUsage';
import type { FormatKind } from '../shared';
import type { CubeFaceDirection } from '../../domain/model';
import type { AtlasTexturePlan } from '../../domain/uv/atlas';

export interface EnsureProjectResult {
  action: 'created' | 'reused' | 'deleted';
  project: { id: string; format: FormatKind; name: string | null; formatId?: string | null };
}

export interface ReadTextureResult {
  texture: {
    id?: string;
    name?: string;
    mimeType: string;
    dataUri: string;
    width?: number;
    height?: number;
    byteLength?: number;
    hash?: string;
  };
  saved?: {
    texture: {
      path: string;
      mime: string;
      byteLength: number;
      width?: number;
      height?: number;
    };
  };
}

export interface ExportTraceLogResult {
  uri?: string;
  path?: string;
  fileName?: string;
  mode?: 'auto' | 'writeFile' | 'export';
  byteLength?: number;
}

export interface ReloadPluginsResult {
  scheduled: true;
  delayMs: number;
  method: 'devReload';
}

export interface GenerateTexturePresetResult {
  width: number;
  height: number;
  seed: number;
  coverage: {
    opaquePixels: number;
    totalPixels: number;
    opaqueRatio: number;
    bounds?: { x1: number; y1: number; x2: number; y2: number };
  };
  uvUsageId?: string;
  note?: string;
  textures?: Array<{ name: string; width: number; height: number }>;
}

export interface AutoUvAtlasResult {
  applied: boolean;
  steps: number;
  resolution: { width: number; height: number };
  textures: AtlasTexturePlan[];
}

export interface GetProjectStateResult {
  project: ProjectState;
}

export interface SetProjectTextureResolutionResult {
  width: number;
  height: number;
}

export interface PreflightUvBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  faceCount: number;
}

export interface PreflightUsageSummary {
  textureCount: number;
  cubeCount: number;
  faceCount: number;
  unresolvedCount: number;
}

export type PreflightWarningCode =
  | 'uv_no_rects'
  | 'uv_unresolved_refs'
  | 'uv_bounds_exceed'
  | 'uv_overlap'
  | 'uv_scale_mismatch'
  | 'uv_rect_small'
  | 'uv_rect_skewed';

export interface PreflightTextureResult {
  uvUsageId: string;
  textureResolution?: { width: number; height: number };
  usageSummary: PreflightUsageSummary;
  uvBounds?: PreflightUvBounds;
  recommendedResolution?: { width: number; height: number; reason: string };
  warnings?: string[];
  warningCodes?: PreflightWarningCode[];
  textureUsage?: TextureUsageResult;
}

export interface ExportResult {
  path: string;
}

export type ValidateFinding = {
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
};

export interface ValidateResult {
  findings: ValidateFinding[];
}

export interface AnimationClipResult {
  id: string;
  name: string;
}

export interface DeletedTarget {
  id?: string;
  name: string;
}

export interface AnimationKeyframeResult {
  clip: string;
  clipId?: string;
  bone: string;
}

export interface AnimationTriggerResult {
  clip: string;
  clipId?: string;
  channel: string;
}

export interface ToolResultMap {
  list_capabilities: Capabilities;
  get_project_state: GetProjectStateResult;
  read_texture: ReadTextureResult;
  export_trace_log: ExportTraceLogResult;
  reload_plugins: ReloadPluginsResult;
  generate_texture_preset: WithState<GenerateTexturePresetResult>;
  auto_uv_atlas: WithState<AutoUvAtlasResult>;
  set_project_texture_resolution: WithState<SetProjectTextureResolutionResult>;
  preflight_texture: PreflightTextureResult;
  ensure_project: WithState<EnsureProjectResult>;
  delete_texture: WithState<{ id: string; name: string }>;
  assign_texture: WithState<{ textureId?: string; textureName: string; cubeCount: number; faces?: CubeFaceDirection[] }>;
  set_face_uv: WithState<{
    cubeId?: string;
    cubeName: string;
    faces: CubeFaceDirection[];
    warnings?: string[];
    warningCodes?: string[];
  }>;
  add_bone: WithState<{ id: string; name: string }>;
  update_bone: WithState<{ id: string; name: string }>;
  delete_bone: WithState<{ id: string; name: string; removedBones: number; removedCubes: number; deleted: DeletedTarget[] }>;
  add_cube: WithState<{ id: string; name: string }>;
  update_cube: WithState<{ id: string; name: string }>;
  delete_cube: WithState<{ id: string; name: string; deleted: DeletedTarget[] }>;
  create_animation_clip: WithState<AnimationClipResult>;
  update_animation_clip: WithState<AnimationClipResult>;
  delete_animation_clip: WithState<AnimationClipResult & { deleted: DeletedTarget[] }>;
  set_keyframes: WithState<AnimationKeyframeResult>;
  set_trigger_keyframes: WithState<AnimationTriggerResult>;
  export: WithState<ExportResult>;
  render_preview: WithState<RenderPreviewResult>;
  validate: WithState<ValidateResult>;
}

