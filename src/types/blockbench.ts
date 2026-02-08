import type { CubeFaceDirection } from '../domain/model';
export type { CubeFaceDirection } from '../domain/model';

export type UnknownRecord = Record<string, unknown>;

export interface BlockbenchProject {
  name?: string;
  uuid?: string;
  id?: string;
  uid?: string;
  save_path?: string;
  export_path?: string;
  texture_width?: number;
  texture_height?: number;
  bbmcpUvPixelsPerBlock?: number;
  bbmcp?: { uvPixelsPerBlock?: number; uv_pixels_per_block?: number };
  setTextureSize?: (width: number, height: number) => void;
  saved?: boolean;
  isSaved?: boolean;
  dirty?: boolean;
  isDirty?: boolean;
  unsaved?: boolean;
  hasUnsavedChanges?: () => boolean;
  markSaved?: () => void;
  close?: (force?: boolean) => void | Promise<unknown>;
}

export interface BlockbenchApi {
  version?: string;
  isWeb?: boolean;
  project?: BlockbenchProject;
  hasUnsavedChanges?: () => boolean;
  newProject?: (formatId: string) => void;
  setProjectName?: (name: string) => void;
  edit?: (aspects: UnknownRecord, fn: () => void) => void;
  textPrompt?: (title: string, value?: string, cb?: () => void) => Promise<string | null> | void;
  showQuickMessage?: (message: string, timeoutMs?: number) => void;
  exportFile?: (payload: { content: unknown; name: string }, onExport?: () => void) => void;
  writeFile?: (path: string, options: { content: string; savetype: 'text' | 'image' }) => void;
  dispatchEvent?: (name: string, payload?: UnknownRecord) => void;
}

export interface FormatEntry {
  name?: string;
  new?: () => void;
  compile?: () => unknown;
  codec?: { compile?: () => unknown };
  single_texture?: boolean;
  per_texture_uv_size?: boolean;
  box_uv?: boolean;
  optional_box_uv?: boolean;
  uv_rotation?: boolean;
  animation_mode?: boolean;
  bone_rig?: boolean;
  armature_rig?: boolean;
  meshes?: boolean;
  image_editor?: boolean;
}

export interface FormatSelection {
  id?: string;
}

export interface ModelFormatApi {
  selected?: FormatSelection | null;
  formats?: Record<string, FormatEntry>;
  new?: () => void;
}

export interface TextureInstance {
  uuid?: string;
  id?: string;
  uid?: string;
  _uuid?: string;
  name?: string;
  path?: string;
  source?: string;
  width?: number;
  height?: number;
  img?: HTMLImageElement;
  canvas?: HTMLCanvasElement;
  ctx?: CanvasRenderingContext2D;
  bbmcpId?: string;
  namespace?: string;
  folder?: string;
  particle?: boolean;
  visible?: boolean;
  render_mode?: string;
  render_sides?: string;
  pbr_channel?: string;
  group?: string;
  frame_time?: number;
  frame_order_type?: string;
  frame_order?: string;
  frame_interpolate?: boolean;
  internal?: boolean;
  keep_size?: boolean;
  fromDataURL?: (dataUri: string) => void;
  loadFromDataURL?: (dataUri: string) => void;
  resize?: (width: number, height: number) => void;
  setSize?: (width: number, height: number) => void;
  add?: () => void;
  load?: () => void;
  select?: () => void;
  rename?: (newName: string) => void;
  remove?: () => void;
  delete?: () => void;
  dispose?: () => void;
  updateChangesAfterEdit?: () => void;
  updateLayerChanges?: (force?: boolean) => void;
  getDataUrl?: () => string;
  getBase64?: () => string;
  toDataURL?: (mime?: string) => string;
  edit?: (fn: (canvas: HTMLCanvasElement | unknown) => unknown, options?: UnknownRecord) => void;
  extend?: (data: UnknownRecord) => void;
}

export interface CubeFace {
  texture?: string | false;
  uv?: [number, number, number, number];
  rotation?: number;
  enabled?: boolean;
  extend?: (data: Partial<CubeFace>) => void;
}

export interface TextureConstructor {
  new (options: UnknownRecord): TextureInstance;
  all?: TextureInstance[];
}

export interface OutlinerNode extends UnknownRecord {
  name?: string;
  parent?: OutlinerNode | null;
  children?: OutlinerNode[];
  bbmcpId?: string;
  uuid?: string;
  id?: string;
  uid?: string;
  _uuid?: string;
  from?: [number, number, number] | { x: number; y: number; z: number };
  to?: [number, number, number] | { x: number; y: number; z: number };
  uv?: [number, number] | { x: number; y: number };
  addTo?: (parent: OutlinerNode) => void;
  remove?: () => void;
  delete?: () => void;
  dispose?: () => void;
  rename?: (name: string) => void;
}

export interface GroupInstance extends OutlinerNode {
  origin?: [number, number, number] | { x: number; y: number; z: number };
  pivot?: [number, number, number] | { x: number; y: number; z: number };
  rotation?: [number, number, number] | { x: number; y: number; z: number };
  scale?: [number, number, number] | { x: number; y: number; z: number };
  visibility?: boolean;
  visible?: boolean;
  init?: () => GroupInstance | void;
}

export interface GroupConstructor {
  new (options: UnknownRecord): GroupInstance;
}

export interface CubeInstance extends OutlinerNode {
  autouv?: 0 | 1 | 2;
  from?: [number, number, number] | { x: number; y: number; z: number };
  to?: [number, number, number] | { x: number; y: number; z: number };
  origin?: [number, number, number] | { x: number; y: number; z: number };
  rotation?: [number, number, number] | { x: number; y: number; z: number };
  uv_offset?: [number, number] | { x: number; y: number };
  uv?: [number, number] | { x: number; y: number };
  inflate?: number;
  mirror?: boolean;
  mirror_uv?: boolean;
  visibility?: boolean;
  visible?: boolean;
  box_uv?: boolean;
  faces?: Record<string, CubeFace>;
  applyTexture?: (texture: TextureInstance, faces?: true | CubeFaceDirection[]) => void;
  mapAutoUV?: () => void;
  setUVMode?: (boxUv: boolean) => void;
  init?: () => CubeInstance | void;
}

export interface CubeConstructor {
  new (options: UnknownRecord): CubeInstance;
}

export interface MeshFaceInput {
  vertices: string[];
  uv?: Record<string, [number, number]>;
  texture?: string | false;
}

export interface MeshInstance extends OutlinerNode {
  origin?: [number, number, number] | { x: number; y: number; z: number };
  rotation?: [number, number, number] | { x: number; y: number; z: number };
  visibility?: boolean;
  visible?: boolean;
  vertices?: Record<string, [number, number, number]>;
  faces?: Record<string, MeshFaceInput>;
  addVertices?: (...vectors: [number, number, number][]) => string[];
  addFaces?: (...faces: UnknownRecord[]) => string[];
  init?: () => MeshInstance | void;
  extend?: (data: UnknownRecord) => void;
}

export interface MeshConstructor {
  new (options: UnknownRecord): MeshInstance;
}

export interface OutlinerApi {
  root?: OutlinerNode[] | { children?: OutlinerNode[] };
}

export interface UndoApi {
  initEdit?: (aspects: UnknownRecord) => void;
  finishEdit?: (label: string) => void;
}

export interface AnimationClip {
  id?: string;
  uuid?: string;
  uid?: string;
  _uuid?: string;
  bbmcpId?: string;
  name?: string;
  length?: number;
  animation_length?: number;
  duration?: number;
  loop?: boolean | string;
  snapping?: number;
  fps?: number;
  animators?: UnknownRecord;
  keyframes?: UnknownRecord[];
  time?: number;
  select?: () => void;
  setTime?: (time: number) => void;
  rename?: (name: string) => void;
  add?: (select?: boolean) => void;
  remove?: () => void;
  delete?: () => void;
  getBoneAnimator?: (group: OutlinerNode | GroupInstance | unknown) => AnimatorInstance | undefined;
}

export interface AnimatorInstance extends UnknownRecord {
  createKeyframe?: (
    value: unknown,
    time?: number,
    channel?: string,
    undo?: boolean,
    select?: boolean
  ) => UnknownRecord | null | undefined;
}

export interface AnimatorApi {
  new (name: string, clip: AnimationClip): AnimatorInstance;
  time?: number;
  setTime?: (time: number) => void;
  preview?: (time: number) => void;
}

export interface AnimationApi {
  new (options: UnknownRecord): AnimationClip;
  all?: AnimationClip[];
  selected?: AnimationClip | null;
}

export interface PreviewItem {
  canvas?: HTMLCanvasElement | null;
  renderer?: { domElement?: HTMLCanvasElement | null };
  controls?: unknown;
  camera?: unknown;
  render?: () => void;
}

export interface PreviewRegistry {
  selected?: PreviewItem | null;
  all?: PreviewItem[];
}

export interface CanvasUpdateViewOptions {
  element_aspects?: {
    faces?: boolean;
    geometry?: boolean;
    painting_grid?: boolean;
    transform?: boolean;
    uv?: boolean;
    visibility?: boolean;
  };
  elements?: unknown[];
  group_aspects?: {
    transform?: boolean;
    visibility?: boolean;
  };
  groups?: unknown[];
  selection?: boolean;
}

export interface BlockbenchCanvasApi {
  updateView?: (options: CanvasUpdateViewOptions) => void;
  updateAll?: () => void;
  updateAllBones?: (bones?: unknown[]) => void;
  updateAllFaces?: (texture?: unknown) => void;
  updateAllPositions?: () => void;
  updateAllUVs?: () => void;
  updateLayeredTextures?: () => void;
  updateSelected?: (arr?: unknown) => void;
  updateSelectedFaces?: () => void;
  updateVisibility?: () => void;
}

export interface DialogApi {
  open?: UnknownRecord;
  getFormResult?: () => UnknownRecord | null;
  setFormValues?: (values: UnknownRecord, silent?: boolean) => void;
  confirm?: () => void;
}

export interface PluginsApi {
  devReload?: () => void;
  path?: string;
  registered?: UnknownRecord;
}

export interface MenuBarApi {
  addAction: (action: UnknownRecord, section?: string) => void;
}

export interface PluginApi {
  register: (id: string, config: UnknownRecord) => void;
}

export interface SettingConstructor {
  new (id: string, options: UnknownRecord): { value?: unknown };
}

export interface CodecConstructor {
  new (options: UnknownRecord): unknown;
}

export interface BlockbenchGlobals {
  Blockbench?: BlockbenchApi;
  Canvas?: BlockbenchCanvasApi;
  Texture?: TextureConstructor;
  Group?: GroupConstructor;
  Cube?: CubeConstructor;
  Mesh?: MeshConstructor;
  Animator?: AnimatorApi;
  EffectAnimator?: new (clip: AnimationClip) => AnimatorInstance;
  Animation?: AnimationApi;
  Animations?: AnimationClip[];
  Outliner?: OutlinerApi;
  ModelFormat?: ModelFormatApi;
  Formats?: Record<string, FormatEntry>;
  Format?: FormatSelection | null;
  Undo?: UndoApi;
  Preview?: PreviewRegistry;
  Dialog?: DialogApi;
  Plugins?: PluginsApi;
  MenuBar?: MenuBarApi;
  Plugin?: PluginApi;
  Setting?: SettingConstructor;
  settings?: Record<string, { value?: unknown; set?: (value: unknown) => void }>;
  Settings?: { get?: (settingId: string) => unknown };
  Codec?: CodecConstructor;
  Project?: BlockbenchProject;
  setProjectResolution?: (width: number, height: number, modifyUv?: boolean) => void;
  updateProjectResolution?: () => void;
  crypto?: Crypto;
  document?: Document;
}

export const readBlockbenchGlobals = (): BlockbenchGlobals =>
  globalThis as typeof globalThis & BlockbenchGlobals;


