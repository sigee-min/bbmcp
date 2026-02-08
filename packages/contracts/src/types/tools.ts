import type { ToolResponse, ToolName } from './shared';
import type { RenderPreviewPayload } from './preview';
import type {
  AddBonePayload,
  AddCubePayload,
  AddMeshPayload,
  AssignTexturePayload,
  AutoUvAtlasPayload,
  CreateAnimationClipPayload,
  DeleteAnimationClipPayload,
  DeleteBonePayload,
  DeleteCubePayload,
  DeleteMeshPayload,
  DeleteTexturePayload,
  EnsureProjectPayload,
  ExportPayload,
  ExportTraceLogMode,
  ExportTraceLogPayload,
  GetProjectStatePayload,
  PaintFacesPayload,
  PaintMeshFacePayload,
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
  UpdateMeshPayload,
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
  PaintMeshFaceResult,
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
  AddMeshPayload,
  AssignTexturePayload,
  AutoUvAtlasPayload,
  CreateAnimationClipPayload,
  DeleteAnimationClipPayload,
  DeleteBonePayload,
  DeleteCubePayload,
  DeleteMeshPayload,
  DeleteTexturePayload,
  EnsureProjectPayload,
  ExportPayload,
  ExportTraceLogPayload,
  ExportTraceLogMode,
  GetProjectStatePayload,
  PaintTexturePayload,
  PaintFacesPayload,
  PaintMeshFacePayload,
  PreflightTexturePayload,
  ReadTexturePayload,
  ReloadPluginsPayload,
  SetFramePosePayload,
  SetFaceUvPayload,
  SetProjectTextureResolutionPayload,
  SetTriggerKeyframesPayload,
  UpdateBonePayload,
  UpdateCubePayload,
  UpdateMeshPayload,
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
  PaintMeshFaceResult,
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
  read_texture: ReadTexturePayload;
  export_trace_log: ExportTraceLogPayload;
  reload_plugins: ReloadPluginsPayload;
  paint_faces: PaintFacesPayload;
  paint_mesh_face: PaintMeshFacePayload;
  ensure_project: EnsureProjectPayload;
  delete_texture: DeleteTexturePayload;
  assign_texture: AssignTexturePayload;
  add_bone: AddBonePayload;
  update_bone: UpdateBonePayload;
  delete_bone: DeleteBonePayload;
  add_cube: AddCubePayload;
  update_cube: UpdateCubePayload;
  delete_cube: DeleteCubePayload;
  add_mesh: AddMeshPayload;
  update_mesh: UpdateMeshPayload;
  delete_mesh: DeleteMeshPayload;
  create_animation_clip: CreateAnimationClipPayload;
  update_animation_clip: UpdateAnimationClipPayload;
  delete_animation_clip: DeleteAnimationClipPayload;
  set_frame_pose: SetFramePosePayload;
  set_trigger_keyframes: SetTriggerKeyframesPayload;
  export: ExportPayload;
  render_preview: RenderPreviewPayload;
  validate: ValidatePayload;
}

export interface Dispatcher {
  handle<TName extends ToolName>(
    name: TName,
    payload: ToolPayloadMap[TName]
  ): Promise<ToolResponse<ToolResultMap[TName]>>;
}
