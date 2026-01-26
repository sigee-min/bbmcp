import {
  FormatKind,
  IncludeDiffOption,
  IncludeStateOption,
  IfRevisionOption,
  ProjectStateDetail,
  ToolResponse
} from './shared';
import { Capabilities } from './capabilities';
import { BlockPipelineMode, BlockPipelineOnConflict, BlockPipelineTextures, BlockVariant } from './blockPipeline';
import { ProjectState, WithState } from './project';
import { RenderPreviewPayload, RenderPreviewResult } from './preview';
import type { UvPaintSpec } from '../domain/uvPaintSpec';
import type { CubeFaceDirection, FaceUvMap } from '../domain/model';
import type {
  EnsureProjectMatch,
  EnsureProjectOnMismatch,
  EnsureProjectOnMissing,
  TexturePresetName,
  ToolName
} from '../shared/toolConstants';

export type { UvPaintMapping, UvPaintScope, UvPaintSource, UvPaintSpec, UvPaintTarget } from '../domain/uvPaintSpec';
export type { CubeFaceDirection } from '../domain/model';

export type { ToolName, EnsureProjectMatch, EnsureProjectOnMismatch, EnsureProjectOnMissing, TexturePresetName };

export interface EnsureProjectPayload extends IncludeStateOption, IncludeDiffOption, IfRevisionOption {
  format?: FormatKind;
  name?: string;
  match?: EnsureProjectMatch;
  onMismatch?: EnsureProjectOnMismatch;
  onMissing?: EnsureProjectOnMissing;
  confirmDiscard?: boolean;
  dialog?: Record<string, unknown>;
  confirmDialog?: boolean;
}

export interface GenerateBlockPipelinePayload {
  name: string;
  texture: string;
  namespace?: string;
  variants?: BlockVariant[];
  textures?: BlockPipelineTextures;
  onConflict?: BlockPipelineOnConflict;
  mode?: BlockPipelineMode;
  ifRevision?: string;
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

export interface ReloadPluginsPayload {
  confirm?: boolean;
  delayMs?: number;
}

export interface GetProjectStatePayload {
  detail?: ProjectStateDetail;
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

export interface ExportPayload extends IncludeStateOption {
  format: 'java_block_item_json' | 'gecko_geo_anim' | 'animated_java';
  destPath: string;
}

export interface ValidatePayload extends IncludeStateOption {}

export interface ToolPayloadMap {
  list_capabilities: Record<string, never>;
  get_project_state: GetProjectStatePayload;
  read_texture: ReadTexturePayload;
  reload_plugins: ReloadPluginsPayload;
  generate_texture_preset: GenerateTexturePresetPayload;
  auto_uv_atlas: AutoUvAtlasPayload;
  set_project_texture_resolution: SetProjectTextureResolutionPayload;
  preflight_texture: PreflightTexturePayload;
  ensure_project: EnsureProjectPayload;
  generate_block_pipeline: GenerateBlockPipelinePayload;
  delete_texture: DeleteTexturePayload;
  assign_texture: AssignTexturePayload;
  set_face_uv: SetFaceUvPayload;
  add_bone: AddBonePayload;
  update_bone: UpdateBonePayload;
  delete_bone: DeleteBonePayload;
  add_cube: AddCubePayload;
  update_cube: UpdateCubePayload;
  delete_cube: DeleteCubePayload;
  apply_rig_template: ApplyRigTemplatePayload;
  export: ExportPayload;
  render_preview: RenderPreviewPayload;
  validate: ValidatePayload;
}

export interface EnsureProjectResult {
  action: 'created' | 'reused';
  project: {
    id: string;
    format: FormatKind;
    name: string | null;
    formatId?: string | null;
  };
}

export type GenerateBlockPipelineResource = {
  uri: string;
  kind: 'blockstate' | 'model' | 'item';
  name: string;
  mimeType: string;
};

export interface GenerateBlockPipelineResult {
  name: string;
  namespace: string;
  variants: BlockVariant[];
  mode: BlockPipelineMode;
  onConflict: BlockPipelineOnConflict;
  resources: GenerateBlockPipelineResource[];
  assets: {
    blockstates: Record<string, unknown>;
    models: Record<string, unknown>;
    items: Record<string, unknown>;
  };
  versionSuffix?: string;
  notes?: string[];
}

export interface ReadTextureResult {
  texture: {
    id?: string;
    name: string;
    width?: number;
    height?: number;
    path?: string;
    dataUri: string;
    mimeType: string;
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

export interface ReloadPluginsResult {
  scheduled: true;
  delayMs: number;
  method: 'devReload';
}

export type TextureCoverage = {
  opaquePixels: number;
  totalPixels: number;
  opaqueRatio: number;
  bounds?: { x1: number; y1: number; x2: number; y2: number };
};

export interface GenerateTexturePresetResult {
  textureId: string;
  textureName: string;
  preset: TexturePresetName;
  mode: 'create' | 'update';
  width: number;
  height: number;
  seed: number;
  coverage?: TextureCoverage;
}

export interface AutoUvAtlasGroup {
  width: number;
  height: number;
  rect: [number, number, number, number];
  faceCount: number;
}

export interface AutoUvAtlasTexturePlan {
  textureId?: string;
  textureName: string;
  groups: AutoUvAtlasGroup[];
}

export interface AutoUvAtlasResult {
  applied: boolean;
  steps: number;
  resolution: { width: number; height: number };
  textures: AutoUvAtlasTexturePlan[];
}

export interface GetProjectStateResult {
  project: ProjectState;
}

export interface SetProjectTextureResolutionResult {
  width: number;
  height: number;
}

export interface GetTextureUsageCube {
  id?: string;
  name: string;
  faces: Array<{ face: CubeFaceDirection; uv?: [number, number, number, number] }>;
}

export interface GetTextureUsageEntry {
  id?: string;
  name: string;
  cubeCount: number;
  faceCount: number;
  cubes: GetTextureUsageCube[];
}

export interface GetTextureUsageUnresolved {
  textureRef: string;
  cubeId?: string;
  cubeName: string;
  face: CubeFaceDirection;
}

export interface GetTextureUsageResult {
  textures: GetTextureUsageEntry[];
  unresolved?: GetTextureUsageUnresolved[];
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

export interface PreflightTextureResult {
  uvUsageId: string;
  textureResolution?: { width: number; height: number };
  usageSummary: PreflightUsageSummary;
  uvBounds?: PreflightUvBounds;
  recommendedResolution?: { width: number; height: number; reason: string };
  warnings?: string[];
  textureUsage?: GetTextureUsageResult;
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
  get_project_state: GetProjectStateResult;
  read_texture: ReadTextureResult;
  reload_plugins: ReloadPluginsResult;
  generate_texture_preset: WithState<GenerateTexturePresetResult>;
  auto_uv_atlas: WithState<AutoUvAtlasResult>;
  set_project_texture_resolution: WithState<SetProjectTextureResolutionResult>;
  preflight_texture: PreflightTextureResult;
  ensure_project: WithState<EnsureProjectResult>;
  generate_block_pipeline: WithState<GenerateBlockPipelineResult>;
  delete_texture: WithState<{ id: string; name: string }>;
  assign_texture: WithState<{ textureId?: string; textureName: string; cubeCount: number; faces?: CubeFaceDirection[] }>;
  set_face_uv: WithState<{ cubeId?: string; cubeName: string; faces: CubeFaceDirection[] }>;
  add_bone: WithState<{ id: string; name: string }>;
  update_bone: WithState<{ id: string; name: string }>;
  delete_bone: WithState<{ id: string; name: string; removedBones: number; removedCubes: number }>;
  add_cube: WithState<{ id: string; name: string }>;
  update_cube: WithState<{ id: string; name: string }>;
  delete_cube: WithState<{ id: string; name: string }>;
  apply_rig_template: WithState<{ templateId: string }>;
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
