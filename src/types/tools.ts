import {
  FormatKind,
  IncludeDiffOption,
  IncludeStateOption,
  IfRevisionOption,
  ProjectStateDetail,
  ToolResponse
} from './shared';
import { Capabilities } from './capabilities';
import { ProjectDiff, ProjectInfo, ProjectState, WithState } from './project';
import { RenderPreviewPayload, RenderPreviewResult } from './preview';

export type ToolName =
  | 'list_capabilities'
  | 'reload_plugin'
  | 'get_project_state'
  | 'get_project_diff'
  | 'list_projects'
  | 'select_project'
  | 'create_project'
  | 'reset_project'
  | 'import_texture'
  | 'update_texture'
  | 'delete_texture'
  | 'add_bone'
  | 'update_bone'
  | 'delete_bone'
  | 'add_cube'
  | 'update_cube'
  | 'delete_cube'
  | 'apply_rig_template'
  | 'create_animation_clip'
  | 'update_animation_clip'
  | 'delete_animation_clip'
  | 'set_keyframes'
  | 'export'
  | 'render_preview'
  | 'validate';

export interface CreateProjectPayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  format: FormatKind;
  name: string;
  confirmDiscard?: boolean;
  dialog?: Record<string, unknown>;
  confirmDialog?: boolean;
}

export type ListProjectsPayload = Record<string, never>;
export type ReloadPluginPayload = Record<string, never>;

export interface ResetProjectPayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {}

export interface SelectProjectPayload extends IncludeStateOption {
  id?: string;
}

export interface GetProjectStatePayload {
  detail?: ProjectStateDetail;
}

export interface GetProjectDiffPayload {
  sinceRevision: string;
  detail?: ProjectStateDetail;
}

export interface ImportTexturePayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  id?: string;
  name: string;
  dataUri?: string;
  path?: string;
}

export interface UpdateTexturePayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  id?: string;
  name?: string;
  newName?: string;
  dataUri?: string;
  path?: string;
}

export interface DeleteTexturePayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  id?: string;
  name?: string;
}

export interface AddBonePayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  id?: string;
  name: string;
  parent?: string;
  parentId?: string;
  pivot: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
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
}

export interface DeleteBonePayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  id?: string;
  name?: string;
}

export interface AddCubePayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  id?: string;
  name: string;
  from: [number, number, number];
  to: [number, number, number];
  bone?: string;
  boneId?: string;
  uv?: [number, number];
  inflate?: number;
  mirror?: boolean;
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
  uv?: [number, number];
  inflate?: number;
  mirror?: boolean;
}

export interface DeleteCubePayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  id?: string;
  name?: string;
}

export interface ApplyRigTemplatePayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  templateId: string;
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
}

export type ChannelKind = 'rot' | 'pos' | 'scale';

export interface KeyframePoint {
  time: number;
  value: [number, number, number];
  interp?: 'linear' | 'step' | 'catmullrom';
}

export interface SetKeyframesPayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  clipId?: string;
  clip: string;
  bone: string;
  channel: ChannelKind;
  keys: KeyframePoint[];
}

export interface ExportPayload extends IncludeStateOption {
  format: 'vanilla_json' | 'gecko_geo_anim' | 'animated_java';
  destPath: string;
}

export interface ValidatePayload extends IncludeStateOption {}

export interface ToolPayloadMap {
  list_capabilities: Record<string, never>;
  reload_plugin: ReloadPluginPayload;
  get_project_state: GetProjectStatePayload;
  get_project_diff: GetProjectDiffPayload;
  list_projects: ListProjectsPayload;
  select_project: SelectProjectPayload;
  create_project: CreateProjectPayload;
  reset_project: ResetProjectPayload;
  import_texture: ImportTexturePayload;
  update_texture: UpdateTexturePayload;
  delete_texture: DeleteTexturePayload;
  add_bone: AddBonePayload;
  update_bone: UpdateBonePayload;
  delete_bone: DeleteBonePayload;
  add_cube: AddCubePayload;
  update_cube: UpdateCubePayload;
  delete_cube: DeleteCubePayload;
  apply_rig_template: ApplyRigTemplatePayload;
  create_animation_clip: CreateAnimationClipPayload;
  update_animation_clip: UpdateAnimationClipPayload;
  delete_animation_clip: DeleteAnimationClipPayload;
  set_keyframes: SetKeyframesPayload;
  export: ExportPayload;
  render_preview: RenderPreviewPayload;
  validate: ValidatePayload;
}

export interface CreateProjectResult {
  id: string;
  format: FormatKind;
  name: string;
}

export interface ReloadPluginResult {
  ok: true;
}

export interface ListProjectsResult {
  projects: ProjectInfo[];
}

export interface SelectProjectResult {
  id: string;
  format: FormatKind;
  name: string | null;
  formatId?: string | null;
}

export interface GetProjectStateResult {
  project: ProjectState;
}

export interface GetProjectDiffResult {
  diff: ProjectDiff;
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

export interface ToolResultMap {
  list_capabilities: Capabilities;
  reload_plugin: ReloadPluginResult;
  get_project_state: GetProjectStateResult;
  get_project_diff: GetProjectDiffResult;
  list_projects: ListProjectsResult;
  select_project: WithState<SelectProjectResult>;
  create_project: WithState<CreateProjectResult>;
  reset_project: WithState<{ ok: true }>;
  import_texture: WithState<{ id: string; name: string; path?: string }>;
  update_texture: WithState<{ id: string; name: string }>;
  delete_texture: WithState<{ id: string; name: string }>;
  add_bone: WithState<{ id: string; name: string }>;
  update_bone: WithState<{ id: string; name: string }>;
  delete_bone: WithState<{ id: string; name: string; removedBones: number; removedCubes: number }>;
  add_cube: WithState<{ id: string; name: string }>;
  update_cube: WithState<{ id: string; name: string }>;
  delete_cube: WithState<{ id: string; name: string }>;
  apply_rig_template: WithState<{ templateId: string }>;
  create_animation_clip: WithState<{ id: string; name: string }>;
  update_animation_clip: WithState<{ id: string; name: string }>;
  delete_animation_clip: WithState<{ id: string; name: string }>;
  set_keyframes: WithState<{ clip: string; clipId?: string; bone: string }>;
  export: WithState<ExportResult>;
  render_preview: WithState<RenderPreviewResult>;
  validate: WithState<ValidateResult>;
}

export interface Dispatcher {
  handle<TName extends ToolName>(
    name: TName,
    payload: ToolPayloadMap[TName]
  ): ToolResponse<ToolResultMap[TName]>;
}
