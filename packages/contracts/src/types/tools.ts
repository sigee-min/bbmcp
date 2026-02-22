import type { ToolResponse, ToolName } from './shared';
import type { RenderPreviewPayload } from './preview';
import type {
  AddBonePayload,
  AddCubePayload,
  AssignTexturePayload,
  AutoUvAtlasPayload,
  CreateAnimationClipPayload,
  DeleteAnimationClipPayload,
  DeleteBonePayload,
  DeleteCubePayload,
  DeleteTexturePayload,
  EnsureProjectPayload,
  ExportPayload,
  ExportTraceLogMode,
  ExportTraceLogPayload,
  GetProjectStatePayload,
  PaintFacesPayload,
  PaintTexturePayload,
  PreflightTexturePayload,
  ReadTexturePayload,
  ReloadPluginsPayload,
  SetFaceUvPayload,
  SetFramePosePayload,
  SetProjectTextureResolutionPayload,
  SetTriggerKeyframesPayload,
  UpdateAnimationClipPayload,
  UpdateBonePayload,
  UpdateCubePayload,
  UvPaintMapping,
  UvPaintScope,
  UvPaintSource,
  UvPaintSpec,
  UvPaintTarget,
  ValidatePayload
} from './tools/payloads';
import type {
  AutoUvAtlasResult,
  EnsureProjectResult,
  ExportResult,
  ExportTraceLogResult,
  GetProjectStateResult,
  PaintFacesResult,
  PaintTextureResult,
  PreflightTextureResult,
  PreflightUsageSummary,
  PreflightUvBounds,
  ReadTextureResult,
  ReloadPluginsResult,
  SetProjectTextureResolutionResult,
  ToolResultMap,
  ValidateFinding,
  ValidateResult
} from './tools/results';
import type {
  CubeFaceDirection,
  EnsureProjectAction,
  EnsureProjectMatch,
  EnsureProjectOnMismatch,
  EnsureProjectOnMissing
} from './shared';

export type {
  ToolName,
  EnsureProjectMatch,
  EnsureProjectOnMismatch,
  EnsureProjectOnMissing,
  EnsureProjectAction,
  CubeFaceDirection
};

export type { UvPaintMapping, UvPaintScope, UvPaintSource, UvPaintSpec, UvPaintTarget };

export type {
  AddBonePayload,
  AddCubePayload,
  AssignTexturePayload,
  AutoUvAtlasPayload,
  CreateAnimationClipPayload,
  DeleteAnimationClipPayload,
  DeleteBonePayload,
  DeleteCubePayload,
  DeleteTexturePayload,
  EnsureProjectPayload,
  ExportPayload,
  ExportTraceLogPayload,
  ExportTraceLogMode,
  GetProjectStatePayload,
  PaintTexturePayload,
  PaintFacesPayload,
  PreflightTexturePayload,
  ReadTexturePayload,
  ReloadPluginsPayload,
  SetFramePosePayload,
  SetFaceUvPayload,
  SetProjectTextureResolutionPayload,
  SetTriggerKeyframesPayload,
  UpdateBonePayload,
  UpdateCubePayload,
  UpdateAnimationClipPayload,
  ValidatePayload
};

export type {
  AutoUvAtlasResult,
  EnsureProjectResult,
  ExportResult,
  ExportTraceLogResult,
  GetProjectStateResult,
  PaintTextureResult,
  PaintFacesResult,
  PreflightUvBounds,
  PreflightUsageSummary,
  PreflightTextureResult,
  ReadTextureResult,
  ReloadPluginsResult,
  SetProjectTextureResolutionResult,
  ToolResultMap,
  ValidateFinding,
  ValidateResult
};

export interface ToolPayloadMap {
  list_capabilities: Record<string, never>;
  get_project_state: GetProjectStatePayload;
  preflight_texture: PreflightTexturePayload;
  read_texture: ReadTexturePayload;
  export_trace_log: ExportTraceLogPayload;
  reload_plugins: ReloadPluginsPayload;
  paint_faces: PaintFacesPayload;
  ensure_project: EnsureProjectPayload;
  delete_texture: DeleteTexturePayload;
  assign_texture: AssignTexturePayload;
  add_bone: AddBonePayload;
  update_bone: UpdateBonePayload;
  delete_bone: DeleteBonePayload;
  add_cube: AddCubePayload;
  update_cube: UpdateCubePayload;
  delete_cube: DeleteCubePayload;
  create_animation_clip: CreateAnimationClipPayload;
  update_animation_clip: UpdateAnimationClipPayload;
  delete_animation_clip: DeleteAnimationClipPayload;
  set_frame_pose: SetFramePosePayload;
  set_trigger_keyframes: SetTriggerKeyframesPayload;
  export: ExportPayload;
  render_preview: RenderPreviewPayload;
  validate: ValidatePayload;
}

export interface DispatcherExecutionContext {
  mcpSessionId?: string;
  mcpAccountId?: string;
  mcpSystemRoles?: string[];
  mcpWorkspaceId?: string;
  mcpApiKeySpace?: 'workspace' | 'service';
  mcpApiKeyId?: string;
}

export interface Dispatcher {
  handle<TName extends ToolName>(
    name: TName,
    payload: ToolPayloadMap[TName],
    context?: DispatcherExecutionContext
  ): Promise<ToolResponse<ToolResultMap[TName]>>;
}
