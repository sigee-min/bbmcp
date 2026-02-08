import {
  Capabilities,
  AutoUvAtlasResult,
  AutoUvAtlasPayload,
  PaintTextureResult,
  PaintTexturePayload,
  PaintFacesResult,
  PaintFacesPayload,
  PaintMeshFaceResult,
  PaintMeshFacePayload,
  PreflightTextureResult,
  PreflightTexturePayload,
  ReadTextureResult,
  RenderPreviewResult,
  SetFaceUvPayload,
  SetProjectTextureResolutionPayload,
  ToolName,
  ToolError,
  ToolPayloadMap
} from '@ashfox/contracts/types/internal';
import { CubeFaceDirection, TextureSource, TriggerChannel } from '../ports/editor';
import { NOOP_VIEWPORT_REFRESHER, type ViewportRefresherPort } from '../ports/viewportRefresher';
import { TextureMeta } from '@ashfox/contracts/types/texture';
import { UsecaseResult } from './result';
import { UvPolicyConfig } from '../domain/uv/policy';
import type { HostPort } from '../ports/host';
import type { PolicyContextLike, RevisionContextLike } from './contextTypes';
import { runReloadPlugins } from './toolService/reloadPlugins';
import { createToolServiceContext, ToolServiceDeps } from './toolServiceContext';
import { createToolServiceFacades, ToolServiceFacades } from './toolServiceFacades';
import { getViewportEffectForTool } from '../shared/tooling/viewportEffects';
import type {
  CreateProjectOptions,
  CreateProjectResult,
  EnsureProjectPayload,
  EnsureProjectResult,
  GetProjectDiffPayload,
  GetProjectDiffResult,
  GetProjectStatePayload,
  GetProjectStateResult
} from './project/projectServiceContracts';

export class ToolService {
  private readonly capabilities: Capabilities;
  private readonly host?: HostPort;
  private readonly policyContext: PolicyContextLike;
  private readonly revisionContext: RevisionContextLike;
  private readonly facades: ToolServiceFacades;
  private readonly viewportRefresher: ViewportRefresherPort;

  constructor(deps: ToolServiceDeps) {
    this.capabilities = deps.capabilities;
    this.host = deps.host;
    const context = createToolServiceContext(deps);
    this.policyContext = context.policyContext;
    this.revisionContext = context.revisionContext;
    this.facades = createToolServiceFacades(context);
    this.viewportRefresher = deps.viewportRefresher ?? NOOP_VIEWPORT_REFRESHER;
  }

  listCapabilities(): Capabilities {
    return this.capabilities;
  }

  getUvPolicy(): UvPolicyConfig {
    return this.policyContext.getUvPolicyConfig();
  }

  isRevisionRequired(): boolean {
    return this.policyContext.isRevisionRequired();
  }

  isAutoRetryRevisionEnabled(): boolean {
    return this.policyContext.isAutoRetryRevisionEnabled();
  }

  ensureRevisionMatchIfProvided(expected?: string): ToolError | null {
    if (!expected) return null;
    return this.revisionContext.ensureRevisionMatch(expected);
  }

  runWithoutRevisionGuard<T>(fn: () => T): T {
    return this.revisionContext.runWithoutRevisionGuard(fn);
  }

  async runWithoutRevisionGuardAsync<T>(fn: () => Promise<T> | T): Promise<T> {
    return await this.revisionContext.runWithoutRevisionGuardAsync(fn);
  }

  reloadPlugins(
    payload: ToolPayloadMap['reload_plugins']
  ): UsecaseResult<{ scheduled: true; delayMs: number; method: 'devReload' }> {
    return runReloadPlugins(this.host, payload);
  }

  notifyViewportRefresh(tool: ToolName): void {
    const effect = getViewportEffectForTool(tool);
    if (effect === 'none') return;
    this.viewportRefresher.refresh({ effect, source: tool });
  }

  getProjectTextureResolution(): { width: number; height: number } | null {
    return this.facades.texture.getProjectTextureResolution();
  }

  setProjectTextureResolution(
    payload: SetProjectTextureResolutionPayload
  ): UsecaseResult<{ width: number; height: number }> {
    return this.facades.texture.setProjectTextureResolution(payload);
  }

  getTextureUsage(payload: { textureId?: string; textureName?: string }): UsecaseResult<{
    textures: Array<{
      id?: string;
      name: string;
      cubeCount: number;
      faceCount: number;
      cubes: Array<{ id?: string; name: string; faces: Array<{ face: CubeFaceDirection; uv?: [number, number, number, number] }> }>;
    }>;
    unresolved?: Array<{ textureRef: string; cubeId?: string; cubeName: string; face: CubeFaceDirection }>;
  }> {
    return this.facades.texture.getTextureUsage(payload);
  }

  preflightTexture(payload: PreflightTexturePayload): UsecaseResult<PreflightTextureResult> {
    return this.facades.texture.preflightTexture(payload);
  }

  paintTexture(payload: PaintTexturePayload): UsecaseResult<PaintTextureResult> {
    return this.facades.texture.paintTexture(payload);
  }

  paintFaces(payload: PaintFacesPayload): UsecaseResult<PaintFacesResult> {
    return this.facades.texture.paintFaces(payload);
  }

  paintMeshFace(payload: PaintMeshFacePayload): UsecaseResult<PaintMeshFaceResult> {
    return this.facades.texture.paintMeshFace(payload);
  }

  autoUvAtlas(payload: AutoUvAtlasPayload): UsecaseResult<AutoUvAtlasResult> {
    return this.facades.texture.autoUvAtlas(payload);
  }

  getProjectState(payload: GetProjectStatePayload): UsecaseResult<GetProjectStateResult> {
    return this.facades.project.getProjectState(payload);
  }

  getProjectDiff(payload: GetProjectDiffPayload): UsecaseResult<GetProjectDiffResult> {
    return this.facades.project.getProjectDiff(payload);
  }

  ensureProject(payload: EnsureProjectPayload): UsecaseResult<EnsureProjectResult> {
    return this.facades.project.ensureProject(payload);
  }

  createProject(
    format: Capabilities['formats'][number]['format'],
    name: string,
    options?: CreateProjectOptions
  ): UsecaseResult<CreateProjectResult> {
    return this.facades.project.createProject(format, name, options);
  }

  importTexture(payload: {
    id?: string;
    name: string;
    image: CanvasImageSource;
    width?: number;
    height?: number;
    ifRevision?: string;
  } & TextureMeta): UsecaseResult<{ id: string; name: string }> {
    return this.facades.texture.importTexture(payload);
  }

  updateTexture(payload: {
    id?: string;
    name?: string;
    newName?: string;
    image: CanvasImageSource;
    width?: number;
    height?: number;
    ifRevision?: string;
  } & TextureMeta): UsecaseResult<{ id: string; name: string }> {
    return this.facades.texture.updateTexture(payload);
  }

  deleteTexture(payload: ToolPayloadMap['delete_texture']): UsecaseResult<{ id: string; name: string }> {
    return this.facades.texture.deleteTexture(payload);
  }

  readTexture(payload: ToolPayloadMap['read_texture']): UsecaseResult<TextureSource> {
    return this.facades.texture.readTexture(payload);
  }

  readTextureImage(payload: ToolPayloadMap['read_texture']): UsecaseResult<ReadTextureResult> {
    return this.facades.texture.readTextureImage(payload);
  }

  assignTexture(
    payload: ToolPayloadMap['assign_texture']
  ): UsecaseResult<{ textureId?: string; textureName: string; cubeCount: number; faces?: CubeFaceDirection[] }> {
    return this.facades.texture.assignTexture(payload);
  }

  setFaceUv(
    payload: SetFaceUvPayload
  ): UsecaseResult<{ cubeId?: string; cubeName: string; faces: CubeFaceDirection[] }> {
    return this.facades.texture.setFaceUv(payload);
  }

  addBone(payload: ToolPayloadMap['add_bone']): UsecaseResult<{ id: string; name: string }> {
    return this.facades.model.addBone(payload);
  }

  updateBone(payload: ToolPayloadMap['update_bone']): UsecaseResult<{ id: string; name: string }> {
    return this.facades.model.updateBone(payload);
  }

  deleteBone(
    payload: ToolPayloadMap['delete_bone']
  ): UsecaseResult<{
    id: string;
    name: string;
    removedBones: number;
    removedCubes: number;
    deleted: Array<{ id?: string; name: string }>;
  }> {
    return this.facades.model.deleteBone(payload);
  }

  addCube(payload: ToolPayloadMap['add_cube']): UsecaseResult<{ id: string; name: string }> {
    return this.facades.model.addCube(payload);
  }

  updateCube(payload: ToolPayloadMap['update_cube']): UsecaseResult<{ id: string; name: string }> {
    return this.facades.model.updateCube(payload);
  }

  deleteCube(
    payload: ToolPayloadMap['delete_cube']
  ): UsecaseResult<{ id: string; name: string; deleted: Array<{ id?: string; name: string }> }> {
    return this.facades.model.deleteCube(payload);
  }

  addMesh(payload: ToolPayloadMap['add_mesh']): UsecaseResult<{ id: string; name: string }> {
    return this.facades.model.addMesh(payload);
  }

  updateMesh(payload: ToolPayloadMap['update_mesh']): UsecaseResult<{ id: string; name: string }> {
    return this.facades.model.updateMesh(payload);
  }

  deleteMesh(
    payload: ToolPayloadMap['delete_mesh']
  ): UsecaseResult<{ id: string; name: string; deleted: Array<{ id?: string; name: string }> }> {
    return this.facades.model.deleteMesh(payload);
  }

  createAnimationClip(payload: ToolPayloadMap['create_animation_clip']): UsecaseResult<{ id: string; name: string }> {
    return this.facades.animation.createAnimationClip(payload);
  }

  updateAnimationClip(payload: ToolPayloadMap['update_animation_clip']): UsecaseResult<{ id: string; name: string }> {
    return this.facades.animation.updateAnimationClip(payload);
  }

  deleteAnimationClip(payload: ToolPayloadMap['delete_animation_clip']): UsecaseResult<{
    id: string;
    name: string;
    deleted: Array<{ id?: string; name: string }>;
  }> {
    return this.facades.animation.deleteAnimationClip(payload);
  }

  setFramePose(
    payload: ToolPayloadMap['set_frame_pose']
  ): UsecaseResult<{ clip: string; clipId?: string; frame: number; time: number; bones: number; channels: number }> {
    return this.facades.animation.setFramePose(payload);
  }

  setTriggerKeyframes(
    payload: ToolPayloadMap['set_trigger_keyframes']
  ): UsecaseResult<{ clip: string; clipId?: string; channel: TriggerChannel }> {
    return this.facades.animation.setTriggerKeyframes(payload);
  }

  async exportModel(payload: ToolPayloadMap['export']): Promise<UsecaseResult<{ path: string }>> {
    return await this.facades.exporter.exportModel(payload);
  }

  renderPreview(payload: ToolPayloadMap['render_preview']): UsecaseResult<RenderPreviewResult> {
    return this.facades.render.renderPreview(payload);
  }

  validate(
    _payload: ToolPayloadMap['validate']
  ): UsecaseResult<{ findings: { code: string; message: string; severity: 'error' | 'warning' | 'info' }[] }> {
    return this.facades.validation.validate();
  }

}




