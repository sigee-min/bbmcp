import type { Capabilities } from '../capabilities';
import type { ProjectState, WithState } from '../project';
import type { RenderPreviewResult } from '../preview';
import type { TextureUsageResult } from '../textureUsage';
import type { CubeFaceDirection, FormatKind } from '../shared';

type AtlasGroupPlan = {
  width: number;
  height: number;
  rect: [number, number, number, number];
  faceCount: number;
};

type AtlasTexturePlan = {
  textureId?: string;
  textureName: string;
  groups: AtlasGroupPlan[];
};

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

export interface PaintTextureResult {
  width: number;
  height: number;
  uvUsageId?: string;
  opsApplied?: number;
}

export interface PaintFacesResult {
  textureName: string;
  width: number;
  height: number;
  targets: number;
  facesApplied?: number;
  opsApplied?: number;
  changedPixels?: number;
  resolvedSource?: {
    coordSpace: 'face' | 'texture';
    width: number;
    height: number;
    faceUv?: [number, number, number, number];
  };
  recovery?: {
    applied: boolean;
    attempts: Array<{
      reason: string;
      steps: number;
      before?: { width: number; height: number };
      after?: { width: number; height: number };
    }>;
  };
}

export interface PaintMeshFaceResult {
  textureName: string;
  meshId?: string;
  meshName: string;
  scope: 'single_face' | 'all_faces';
  width: number;
  height: number;
  targets: number;
  facesApplied: number;
  opsApplied: number;
  changedPixels?: number;
  skippedFaces?: Array<{ faceId: string; reason: string }>;
  resolvedSource?: {
    coordSpace: 'face' | 'texture';
    width: number;
    height: number;
    faceUv?: [number, number, number, number];
  };
  recovery?: {
    applied: boolean;
    rollbackApplied?: boolean;
    attempts: Array<{
      reason: string;
      steps: number;
      before?: { width: number; height: number };
      after?: { width: number; height: number };
    }>;
  };
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

export interface AnimationFramePoseResult {
  clip: string;
  clipId?: string;
  frame: number;
  time: number;
  bones: number;
  channels: number;
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
  paint_faces: WithState<PaintFacesResult>;
  paint_mesh_face: WithState<PaintMeshFaceResult>;
  ensure_project: WithState<EnsureProjectResult>;
  delete_texture: WithState<{ id: string; name: string }>;
  assign_texture: WithState<{ textureId?: string; textureName: string; cubeCount: number; faces?: CubeFaceDirection[] }>;
  add_bone: WithState<{ id: string; name: string }>;
  update_bone: WithState<{ id: string; name: string }>;
  delete_bone: WithState<{ id: string; name: string; removedBones: number; removedCubes: number; deleted: DeletedTarget[] }>;
  add_cube: WithState<{ id: string; name: string }>;
  update_cube: WithState<{ id: string; name: string }>;
  delete_cube: WithState<{ id: string; name: string; deleted: DeletedTarget[] }>;
  add_mesh: WithState<{ id: string; name: string }>;
  update_mesh: WithState<{ id: string; name: string }>;
  delete_mesh: WithState<{ id: string; name: string; deleted: DeletedTarget[] }>;
  create_animation_clip: WithState<AnimationClipResult>;
  update_animation_clip: WithState<AnimationClipResult>;
  delete_animation_clip: WithState<AnimationClipResult & { deleted: DeletedTarget[] }>;
  set_frame_pose: WithState<AnimationFramePoseResult>;
  set_trigger_keyframes: WithState<AnimationTriggerResult>;
  export: WithState<ExportResult>;
  render_preview: WithState<RenderPreviewResult>;
  validate: WithState<ValidateResult>;
}
