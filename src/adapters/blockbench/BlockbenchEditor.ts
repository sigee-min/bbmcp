import {
  AnimationCommand,
  AssignTextureCommand,
  BoneCommand,
  CubeCommand,
  DeleteAnimationCommand,
  DeleteBoneCommand,
  DeleteCubeCommand,
  DeleteMeshCommand,
  DeleteTextureCommand,
  EditorPort,
  ImportTextureCommand,
  KeyframeCommand,
  MeshCommand,
  ReadTextureCommand,
  SetFaceUvCommand,
  TextureSource,
  TextureStat,
  TextureUsageQuery,
  TextureUsageResult,
  UpdateAnimationCommand,
  UpdateBoneCommand,
  UpdateCubeCommand,
  UpdateMeshCommand,
  UpdateTextureCommand,
  TriggerKeyframeCommand
} from '../../ports/editor';
import { RenderPreviewPayload, RenderPreviewResult, ToolError, FormatKind } from '../../types/internal';
import { Logger } from '../../logging';
import { BlockbenchProjectAdapter } from './BlockbenchProjectAdapter';
import { BlockbenchTextureAdapter } from './BlockbenchTextureAdapter';
import { BlockbenchGeometryAdapter } from './BlockbenchGeometryAdapter';
import { BlockbenchAnimationAdapter } from './BlockbenchAnimationAdapter';
import { BlockbenchPreviewAdapter } from './BlockbenchPreviewAdapter';

export class BlockbenchEditor implements EditorPort {
  private readonly project: BlockbenchProjectAdapter;
  private readonly textures: BlockbenchTextureAdapter;
  private readonly geometry: BlockbenchGeometryAdapter;
  private readonly animation: BlockbenchAnimationAdapter;
  private readonly preview: BlockbenchPreviewAdapter;

  constructor(log: Logger) {
    this.project = new BlockbenchProjectAdapter(log);
    this.textures = new BlockbenchTextureAdapter(log);
    this.geometry = new BlockbenchGeometryAdapter(log);
    this.animation = new BlockbenchAnimationAdapter(log);
    this.preview = new BlockbenchPreviewAdapter(log);
  }

  createProject(
    name: string,
    formatId: string,
    kind: FormatKind,
    options?: { confirmDiscard?: boolean; dialog?: Record<string, unknown> }
  ): ToolError | null {
    return this.project.createProject(name, formatId, kind, options);
  }

  closeProject(options?: { force?: boolean }): ToolError | null {
    return this.project.closeProject(options);
  }

  importTexture(params: ImportTextureCommand): ToolError | null {
    return this.textures.importTexture(params);
  }

  updateTexture(params: UpdateTextureCommand): ToolError | null {
    return this.textures.updateTexture(params);
  }

  deleteTexture(params: DeleteTextureCommand): ToolError | null {
    return this.textures.deleteTexture(params);
  }

  readTexture(params: ReadTextureCommand): { result?: TextureSource; error?: ToolError } {
    return this.textures.readTexture(params);
  }

  listTextures(): TextureStat[] {
    return this.textures.listTextures();
  }

  assignTexture(params: AssignTextureCommand): ToolError | null {
    return this.geometry.assignTexture(params);
  }

  setFaceUv(params: SetFaceUvCommand): ToolError | null {
    return this.geometry.setFaceUv(params);
  }

  addBone(params: BoneCommand): ToolError | null {
    return this.geometry.addBone(params);
  }

  updateBone(params: UpdateBoneCommand): ToolError | null {
    return this.geometry.updateBone(params);
  }

  deleteBone(params: DeleteBoneCommand): ToolError | null {
    return this.geometry.deleteBone(params);
  }

  addCube(params: CubeCommand): ToolError | null {
    return this.geometry.addCube(params);
  }

  updateCube(params: UpdateCubeCommand): ToolError | null {
    return this.geometry.updateCube(params);
  }

  deleteCube(params: DeleteCubeCommand): ToolError | null {
    return this.geometry.deleteCube(params);
  }

  addMesh(params: MeshCommand): ToolError | null {
    return this.geometry.addMesh(params);
  }

  updateMesh(params: UpdateMeshCommand): ToolError | null {
    return this.geometry.updateMesh(params);
  }

  deleteMesh(params: DeleteMeshCommand): ToolError | null {
    return this.geometry.deleteMesh(params);
  }

  createAnimation(params: AnimationCommand): ToolError | null {
    return this.animation.createAnimation(params);
  }

  updateAnimation(params: UpdateAnimationCommand): ToolError | null {
    return this.animation.updateAnimation(params);
  }

  deleteAnimation(params: DeleteAnimationCommand): ToolError | null {
    return this.animation.deleteAnimation(params);
  }

  setKeyframes(params: KeyframeCommand): ToolError | null {
    return this.animation.setKeyframes(params);
  }

  setTriggerKeyframes(params: TriggerKeyframeCommand): ToolError | null {
    return this.animation.setTriggerKeyframes(params);
  }

  renderPreview(params: RenderPreviewPayload): { result?: RenderPreviewResult; error?: ToolError } {
    return this.preview.renderPreview(params);
  }

  getTextureUsage(params: TextureUsageQuery): { result?: TextureUsageResult; error?: ToolError } {
    return this.geometry.getTextureUsage(params);
  }

  writeFile(path: string, contents: string): ToolError | null {
    return this.project.writeFile(path, contents);
  }

  getProjectTextureResolution(): { width: number; height: number } | null {
    return this.project.getProjectTextureResolution();
  }

  setProjectTextureResolution(width: number, height: number, modifyUv?: boolean): ToolError | null {
    return this.project.setProjectTextureResolution(width, height, modifyUv);
  }

  setProjectUvPixelsPerBlock(pixelsPerBlock: number): ToolError | null {
    return this.project.setProjectUvPixelsPerBlock(pixelsPerBlock);
  }
}



