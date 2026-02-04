import { FormatKind, RenderPreviewPayload, RenderPreviewResult, ToolError } from '../types';
import type { AnimationTimePolicy } from '../domain/animation/timePolicy';
import type { CubeFaceDirection, FaceUvMap } from '../domain/model';
import type {
  TextureUsageResult,
  TextureUsageQuery,
  TextureUsageEntry,
  TextureUsageCube,
  TextureUsageUnresolved
} from '../types/textureUsage';

export type { CubeFaceDirection, FaceUvMap } from '../domain/model';
import {
  TextureFrameOrderType,
  TexturePbrChannel,
  TextureRenderMode,
  TextureRenderSides
} from '../types/texture';

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type TextureSource = {
  id?: string;
  name: string;
  width?: number;
  height?: number;
  path?: string;
  dataUri?: string;
  image?: CanvasImageSource;
};

export type TextureStat = {
  id?: string | null;
  name: string;
  width: number;
  height: number;
  path?: string;
};

export type TextureResolution = {
  width: number;
  height: number;
};

export type { TextureUsageResult, TextureUsageQuery, TextureUsageEntry, TextureUsageCube, TextureUsageUnresolved };

export type TextureMetaInput = {
  namespace?: string;
  folder?: string;
  particle?: boolean;
  visible?: boolean;
  renderMode?: TextureRenderMode;
  renderSides?: TextureRenderSides;
  pbrChannel?: TexturePbrChannel;
  group?: string;
  frameTime?: number;
  frameOrderType?: TextureFrameOrderType;
  frameOrder?: string;
  frameInterpolate?: boolean;
  internal?: boolean;
  keepSize?: boolean;
};

export type TextureImageSource = CanvasImageSource;

export type ImportTextureCommand = {
  id?: string;
  name: string;
  image: TextureImageSource;
  width?: number;
  height?: number;
} & TextureMetaInput;

export type UpdateTextureCommand = {
  id?: string;
  name?: string;
  newName?: string;
  image: TextureImageSource;
  width?: number;
  height?: number;
} & TextureMetaInput;

export type DeleteTextureCommand = {
  id?: string;
  name?: string;
};

export type AssignTextureCommand = {
  textureId?: string;
  textureName?: string;
  cubeIds?: string[];
  cubeNames?: string[];
  faces?: CubeFaceDirection[];
};

export type SetFaceUvCommand = {
  cubeId?: string;
  cubeName?: string;
  faces: FaceUvMap;
};

export type ReadTextureCommand = {
  id?: string;
  name?: string;
};

export type BoneCommand = {
  id?: string;
  name: string;
  parent?: string;
  pivot: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  visibility?: boolean;
};

export type UpdateBoneCommand = {
  id?: string;
  name?: string;
  newName?: string;
  parent?: string | null;
  parentRoot?: boolean;
  pivot?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  visibility?: boolean;
};

export type DeleteBoneCommand = {
  id?: string;
  name?: string;
};

export type CubeCommand = {
  id?: string;
  name: string;
  from: Vec3;
  to: Vec3;
  bone?: string;
  origin?: Vec3;
  rotation?: Vec3;
  uv?: Vec2;
  uvOffset?: Vec2;
  inflate?: number;
  mirror?: boolean;
  visibility?: boolean;
  boxUv?: boolean;
};

export type UpdateCubeCommand = {
  id?: string;
  name?: string;
  newName?: string;
  bone?: string | null;
  boneRoot?: boolean;
  from?: Vec3;
  to?: Vec3;
  origin?: Vec3;
  rotation?: Vec3;
  uv?: Vec2;
  uvOffset?: Vec2;
  inflate?: number;
  mirror?: boolean;
  visibility?: boolean;
  boxUv?: boolean;
};

export type DeleteCubeCommand = {
  id?: string;
  name?: string;
};

export type AnimationCommand = {
  id?: string;
  name: string;
  length: number;
  loop: boolean;
  fps: number;
};

export type UpdateAnimationCommand = {
  id?: string;
  name?: string;
  newName?: string;
  length?: number;
  loop?: boolean;
  fps?: number;
};

export type DeleteAnimationCommand = {
  id?: string;
  name?: string;
};

export type KeyframeCommand = {
  clip: string;
  clipId?: string;
  bone: string;
  channel: 'rot' | 'pos' | 'scale';
  keys: { time: number; value: Vec3; interp?: 'linear' | 'step' | 'catmullrom' }[];
  timePolicy?: AnimationTimePolicy;
};

export type TriggerChannel = 'sound' | 'particle' | 'timeline';

export type TriggerKeyframeCommand = {
  clip: string;
  clipId?: string;
  channel: TriggerChannel;
  keys: { time: number; value: string | string[] | Record<string, unknown> }[];
  timePolicy?: AnimationTimePolicy;
};

export interface EditorPort {
  createProject: (
    name: string,
    formatId: string,
    kind: FormatKind,
    options?: { confirmDiscard?: boolean; dialog?: Record<string, unknown> }
  ) => ToolError | null;
  closeProject: (options?: { force?: boolean }) => ToolError | null;
  importTexture: (params: ImportTextureCommand) => ToolError | null;
  updateTexture: (params: UpdateTextureCommand) => ToolError | null;
  deleteTexture: (params: DeleteTextureCommand) => ToolError | null;
  readTexture: (params: ReadTextureCommand) => { result?: TextureSource; error?: ToolError };
  assignTexture: (params: AssignTextureCommand) => ToolError | null;
  setFaceUv: (params: SetFaceUvCommand) => ToolError | null;
  addBone: (params: BoneCommand) => ToolError | null;
  updateBone: (params: UpdateBoneCommand) => ToolError | null;
  deleteBone: (params: DeleteBoneCommand) => ToolError | null;
  addCube: (params: CubeCommand) => ToolError | null;
  updateCube: (params: UpdateCubeCommand) => ToolError | null;
  deleteCube: (params: DeleteCubeCommand) => ToolError | null;
  createAnimation: (params: AnimationCommand) => ToolError | null;
  updateAnimation: (params: UpdateAnimationCommand) => ToolError | null;
  deleteAnimation: (params: DeleteAnimationCommand) => ToolError | null;
  setKeyframes: (params: KeyframeCommand) => ToolError | null;
  setTriggerKeyframes: (params: TriggerKeyframeCommand) => ToolError | null;
  renderPreview: (params: RenderPreviewPayload) => { result?: RenderPreviewResult; error?: ToolError };
  writeFile: (path: string, contents: string) => ToolError | null;
  listTextures: () => TextureStat[];
  getProjectTextureResolution: () => TextureResolution | null;
  setProjectTextureResolution: (width: number, height: number, modifyUv?: boolean) => ToolError | null;
  getTextureUsage: (params: TextureUsageQuery) => { result?: TextureUsageResult; error?: ToolError };
}


