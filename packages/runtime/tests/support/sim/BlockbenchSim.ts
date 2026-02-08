import type {
  EditorPort,
  TextureResolution,
  ImportTextureCommand,
  UpdateTextureCommand,
  DeleteTextureCommand,
  AssignTextureCommand,
  SetFaceUvCommand,
  ReadTextureCommand,
  BoneCommand,
  UpdateBoneCommand,
  DeleteBoneCommand,
  CubeCommand,
  UpdateCubeCommand,
  DeleteCubeCommand,
  AnimationCommand,
  UpdateAnimationCommand,
  DeleteAnimationCommand,
  KeyframeCommand,
  TriggerKeyframeCommand
} from '../../../src/ports/editor';
import type { FormatDescriptor } from '../../../src/ports/formats';
import type { SnapshotPort } from '../../../src/ports/snapshot';
import type { FormatKind, RenderPreviewResult, ToolError } from '../../../src/types';
import type { CubeInstance, TextureInstance } from '../../../src/types/blockbench';
import { buildTextureUsageResult } from '../../../src/adapters/blockbench/BlockbenchTextureUsage';
import { DEFAULT_TEXTURE_SIZE } from './simConstants';
import type { BlockbenchSimOptions, BlockbenchSimProject, BlockbenchSimState, SimCounters } from './simTypes';
import { buildSnapshot } from './simSnapshot';
import { createUvOps } from './simUv';
import { createTextureOps } from './simTextures';
import { createCubeOps } from './simCubes';
import { createBoneOps } from './simBones';
import { createAnimationOps } from './simAnimations';

export type { BlockbenchSimOptions, BlockbenchSimProject, BlockbenchSimState } from './simTypes';

export class BlockbenchSim {
  private state: BlockbenchSimState;
  private counters: SimCounters = { nextTextureId: 1, nextCubeId: 1 };
  private formatCaps: FormatDescriptor | null;
  private resolveFormatCaps?: BlockbenchSimOptions['resolveFormatCaps'];
  private readonly uvOps: ReturnType<typeof createUvOps>;
  private readonly textureOps: ReturnType<typeof createTextureOps>;
  private readonly cubeOps: ReturnType<typeof createCubeOps>;
  private readonly boneOps: ReturnType<typeof createBoneOps>;
  private readonly animationOps: ReturnType<typeof createAnimationOps>;

  constructor(options: BlockbenchSimOptions = {}) {
    const project: BlockbenchSimProject = {
      id: `${Date.now()}`,
      name: null,
      format: null,
      formatId: null,
      textureResolution: options.project?.textureResolution ?? { width: DEFAULT_TEXTURE_SIZE, height: DEFAULT_TEXTURE_SIZE },
      uvPixelsPerBlock: options.project?.uvPixelsPerBlock,
      ...(options.project ?? {})
    };
    this.state = {
      project,
      cubes: options.cubes ?? [],
      textures: options.textures ?? [],
      bones: options.bones ?? [],
      animations: options.animations ?? [],
      writes: [],
      preview: options.preview
    };
    this.formatCaps = options.formatCaps ?? null;
    this.resolveFormatCaps = options.resolveFormatCaps;
    this.uvOps = createUvOps({
      state: this.state,
      syncTextures: () => this.textureOps?.syncTexturesToProjectResolution()
    });
    this.textureOps = createTextureOps({
      state: this.state,
      counters: this.counters,
      isSingleTexture: () => this.isSingleTexture(),
      isPerTextureUvSize: () => this.isPerTextureUvSize(),
      applyProjectTextureResolution: this.uvOps.applyProjectTextureResolution
    });
    this.cubeOps = createCubeOps({
      state: this.state,
      counters: this.counters,
      findTexture: this.textureOps.findTexture,
      applyAutoUv: this.uvOps.applyAutoUv,
      enforceManualUvMode: this.uvOps.enforceManualUvMode
    });
    this.boneOps = createBoneOps({ state: this.state });
    this.animationOps = createAnimationOps({ state: this.state });
    this.updateFormatCaps(project.formatId ?? null, project.format ?? null);
  }

  get editor(): EditorPort {
    return {
      createProject: (name: string, formatId: string, kind: FormatKind) => {
        this.state.project = {
          id: `${Date.now()}`,
          name,
          format: kind,
          formatId,
          textureResolution: { width: DEFAULT_TEXTURE_SIZE, height: DEFAULT_TEXTURE_SIZE },
          uvPixelsPerBlock: undefined
        };
        this.resetCollections();
        this.updateFormatCaps(formatId, kind);
        return null;
      },
      closeProject: (_options?: { force?: boolean }) => {
        this.state.project = {
          id: `${Date.now()}`,
          name: null,
          format: null,
          formatId: null,
          textureResolution: null,
          uvPixelsPerBlock: undefined
        };
        this.resetCollections();
        this.formatCaps = null;
        return null;
      },
      importTexture: (params: ImportTextureCommand) => this.textureOps.importTexture(params),
      updateTexture: (params: UpdateTextureCommand) => this.textureOps.updateTexture(params),
      deleteTexture: (params: DeleteTextureCommand) => this.textureOps.deleteTexture(params),
      readTexture: (params: ReadTextureCommand) => this.textureOps.readTexture(params),
      assignTexture: (params: AssignTextureCommand) => this.cubeOps.assignTexture(params),
      setFaceUv: (params: SetFaceUvCommand) => this.cubeOps.setFaceUv(params),
      addBone: (params: BoneCommand) => this.boneOps.addBone(params),
      updateBone: (params: UpdateBoneCommand) => this.boneOps.updateBone(params),
      deleteBone: (params: DeleteBoneCommand) => this.boneOps.deleteBone(params),
      addCube: (params: CubeCommand) => this.cubeOps.addCube(params),
      updateCube: (params: UpdateCubeCommand) => this.cubeOps.updateCube(params),
      deleteCube: (params: DeleteCubeCommand) => this.cubeOps.deleteCube(params),
      createAnimation: (params: AnimationCommand) => this.animationOps.createAnimation(params),
      updateAnimation: (params: UpdateAnimationCommand) => this.animationOps.updateAnimation(params),
      deleteAnimation: (params: DeleteAnimationCommand) => this.animationOps.deleteAnimation(params),
      setKeyframes: (_params: KeyframeCommand) => null,
      setTriggerKeyframes: (_params: TriggerKeyframeCommand) => null,
      renderPreview: (_params) => this.renderPreview(),
      writeFile: (path: string, contents: string) => {
        this.state.writes.push({ path, contents });
        return null;
      },
      listTextures: () => this.textureOps.listTextures(),
      getProjectTextureResolution: () => this.state.project.textureResolution,
      setProjectTextureResolution: (width: number, height: number, modifyUv?: boolean) =>
        this.uvOps.applyProjectTextureResolution(width, height, modifyUv),
      setProjectUvPixelsPerBlock: (pixelsPerBlock: number) => {
        this.state.project.uvPixelsPerBlock = pixelsPerBlock;
        return null;
      },
      getTextureUsage: (params) =>
        buildTextureUsageResult(params, { cubes: this.state.cubes, textures: this.state.textures })
    };
  }

  get snapshotPort(): SnapshotPort {
    return {
      readSnapshot: () => buildSnapshot(this.state)
    };
  }

  loadProject(data: {
    format?: FormatKind;
    name?: string | null;
    formatId?: string | null;
    textureResolution?: TextureResolution | null;
    uvPixelsPerBlock?: number;
    cubes?: Array<
      Pick<
        CubeInstance,
        'id' | 'name' | 'from' | 'to' | 'origin' | 'rotation' | 'uv' | 'uv_offset' | 'inflate' | 'mirror' | 'visibility' | 'box_uv' | 'faces'
      >
    >;
    textures?: Array<Pick<TextureInstance, 'id' | 'name' | 'width' | 'height' | 'path'>>;
  }): void {
    this.state.project = {
      ...this.state.project,
      format: data.format ?? this.state.project.format,
      name: data.name ?? this.state.project.name,
      formatId: data.formatId ?? this.state.project.formatId,
      textureResolution: data.textureResolution ?? this.state.project.textureResolution,
      uvPixelsPerBlock: data.uvPixelsPerBlock ?? this.state.project.uvPixelsPerBlock
    };
    this.updateFormatCaps(this.state.project.formatId ?? null, this.state.project.format ?? null);
    if (data.textures) {
      this.state.textures = data.textures.map((tex) => this.textureOps.normalizeTexture(tex));
    }
    if (data.cubes) {
      this.state.cubes = data.cubes.map((cube) => this.cubeOps.normalizeCube(cube));
    }
    this.state.cubes.forEach((cube) => this.uvOps.applyAutoUv(cube));
    this.textureOps.syncTexturesToProjectResolution();
  }

  private resetCollections(): void {
    this.state.cubes = [];
    this.state.textures = [];
    this.state.bones = [];
    this.state.animations = [];
  }

  private renderPreview(): { result?: RenderPreviewResult; error?: ToolError } {
    return this.state.preview
      ? { result: this.state.preview }
      : {
          result: {
            kind: 'single',
            frameCount: 1,
            image: {
              mime: 'image/png',
              width: DEFAULT_TEXTURE_SIZE,
              height: DEFAULT_TEXTURE_SIZE,
              dataUri: 'data:image/png;base64,',
              byteLength: 0
            }
          }
        };
  }

  private updateFormatCaps(formatId?: string | null, format?: FormatKind | null): void {
    if (!this.resolveFormatCaps) return;
    const next = this.resolveFormatCaps(formatId ?? null, format ?? null);
    if (next !== undefined) {
      this.formatCaps = next ?? null;
    }
  }

  private isSingleTexture(): boolean {
    return this.formatCaps?.singleTexture === true;
  }

  private isPerTextureUvSize(): boolean {
    return this.formatCaps?.perTextureUvSize !== false;
  }
}
