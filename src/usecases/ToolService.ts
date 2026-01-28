import {
  Capabilities,
  AutoUvAtlasResult,
  FormatKind,
  BlockPipelineResult,
  GenerateTexturePresetResult,
  PreflightTextureResult,
  ProjectDiff,
  ProjectState,
  ProjectStateDetail,
  ReadTextureResult,
  RenderPreviewResult,
  ToolError,
  ToolPayloadMap
} from '../types';
import { CubeFaceDirection, TextureSource, TriggerChannel } from '../ports/editor';
import { TextureMeta } from '../types/texture';
import { ok, fail, UsecaseResult } from './result';
import { UvPolicyConfig } from '../domain/uvPolicy';
import type { HostPort } from '../ports/host';
import type { PolicyContextLike, RevisionContextLike } from './contextTypes';
import {
  PLUGIN_RELOAD_CONFIRM_REQUIRED,
  PLUGIN_RELOAD_CONFIRM_REQUIRED_FIX,
  PLUGIN_RELOAD_UNAVAILABLE
} from '../shared/messages';
import { createToolServiceContext, ToolServiceDeps } from './toolServiceContext';
import { createToolServiceFacades, ToolServiceFacades } from './toolServiceFacades';

export class ToolService {
  private readonly capabilities: Capabilities;
  private readonly host?: HostPort;
  private readonly policyContext: PolicyContextLike;
  private readonly revisionContext: RevisionContextLike;
  private readonly facades: ToolServiceFacades;

  constructor(deps: ToolServiceDeps) {
    this.capabilities = deps.capabilities;
    this.host = deps.host;
    const context = createToolServiceContext(deps);
    this.policyContext = context.policyContext;
    this.revisionContext = context.revisionContext;
    this.facades = createToolServiceFacades(context);
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

  reloadPlugins(payload: ToolPayloadMap['reload_plugins']): UsecaseResult<{ scheduled: true; delayMs: number; method: 'devReload' }> {
    if (payload.confirm !== true) {
      return fail({
        code: 'invalid_payload',
        message: PLUGIN_RELOAD_CONFIRM_REQUIRED,
        fix: PLUGIN_RELOAD_CONFIRM_REQUIRED_FIX
      });
    }
    if (!this.host) {
      return fail({ code: 'not_implemented', message: PLUGIN_RELOAD_UNAVAILABLE });
    }
    const delayMs = normalizeReloadDelay(payload.delayMs);
    const err = this.host.schedulePluginReload(delayMs);
    if (err) return fail(err);
    return ok({ scheduled: true, delayMs, method: 'devReload' });
  }

  getProjectTextureResolution(): { width: number; height: number } | null {
    return this.facades.texture.getProjectTextureResolution();
  }

  setProjectTextureResolution(
    payload: ToolPayloadMap['set_project_texture_resolution']
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

  preflightTexture(payload: ToolPayloadMap['preflight_texture']): UsecaseResult<PreflightTextureResult> {
    return this.facades.texture.preflightTexture(payload);
  }

  generateTexturePreset(payload: ToolPayloadMap['generate_texture_preset']): UsecaseResult<GenerateTexturePresetResult> {
    return this.facades.texture.generateTexturePreset(payload);
  }

  autoUvAtlas(payload: ToolPayloadMap['auto_uv_atlas']): UsecaseResult<AutoUvAtlasResult> {
    return this.facades.texture.autoUvAtlas(payload);
  }

  getProjectState(payload: ToolPayloadMap['get_project_state']): UsecaseResult<{ project: ProjectState }> {
    return this.facades.project.getProjectState(payload);
  }

  getProjectDiff(payload: { sinceRevision: string; detail?: ProjectStateDetail }): UsecaseResult<{ diff: ProjectDiff }> {
    return this.facades.project.getProjectDiff(payload);
  }

  ensureProject(
    payload: ToolPayloadMap['ensure_project']
  ): UsecaseResult<{ action: 'created' | 'reused'; project: { id: string; format: FormatKind; name: string | null; formatId?: string | null } }> {
    return this.facades.project.ensureProject(payload);
  }

  blockPipeline(payload: ToolPayloadMap['block_pipeline']): UsecaseResult<BlockPipelineResult> {
    return this.facades.blockPipeline.blockPipeline(payload);
  }

  createProject(
    format: Capabilities['formats'][number]['format'],
    name: string,
    options?: { confirmDiscard?: boolean; dialog?: Record<string, unknown>; confirmDialog?: boolean; ifRevision?: string }
  ): UsecaseResult<{ id: string; format: FormatKind; name: string }> {
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
    payload: ToolPayloadMap['set_face_uv']
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
  ): UsecaseResult<{ id: string; name: string; removedBones: number; removedCubes: number }> {
    return this.facades.model.deleteBone(payload);
  }

  addCube(payload: ToolPayloadMap['add_cube']): UsecaseResult<{ id: string; name: string }> {
    return this.facades.model.addCube(payload);
  }

  updateCube(payload: ToolPayloadMap['update_cube']): UsecaseResult<{ id: string; name: string }> {
    return this.facades.model.updateCube(payload);
  }

  deleteCube(payload: ToolPayloadMap['delete_cube']): UsecaseResult<{ id: string; name: string }> {
    return this.facades.model.deleteCube(payload);
  }

  createAnimationClip(payload: {
    id?: string;
    name: string;
    length: number;
    loop: boolean;
    fps: number;
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string }> {
    return this.facades.animation.createAnimationClip(payload);
  }

  updateAnimationClip(payload: {
    id?: string;
    name?: string;
    newName?: string;
    length?: number;
    loop?: boolean;
    fps?: number;
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string }> {
    return this.facades.animation.updateAnimationClip(payload);
  }

  deleteAnimationClip(payload: { id?: string; name?: string; ifRevision?: string }): UsecaseResult<{ id: string; name: string }> {
    return this.facades.animation.deleteAnimationClip(payload);
  }

  setKeyframes(payload: {
    clipId?: string;
    clip: string;
    bone: string;
    channel: 'rot' | 'pos' | 'scale';
    keys: { time: number; value: [number, number, number]; interp?: 'linear' | 'step' | 'catmullrom' }[];
    ifRevision?: string;
  }): UsecaseResult<{ clip: string; clipId?: string; bone: string }> {
    return this.facades.animation.setKeyframes(payload);
  }

  setTriggerKeyframes(payload: {
    clipId?: string;
    clip: string;
    channel: TriggerChannel;
    keys: { time: number; value: string | string[] | Record<string, unknown> }[];
    ifRevision?: string;
  }): UsecaseResult<{ clip: string; clipId?: string; channel: TriggerChannel }> {
    return this.facades.animation.setTriggerKeyframes(payload);
  }

  exportModel(payload: ToolPayloadMap['export']): UsecaseResult<{ path: string }> {
    return this.facades.exporter.exportModel(payload);
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

const DEFAULT_RELOAD_DELAY_MS = 100;
const MAX_RELOAD_DELAY_MS = 10_000;

const normalizeReloadDelay = (value?: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_RELOAD_DELAY_MS;
  const rounded = Math.max(0, Math.trunc(value));
  return Math.min(rounded, MAX_RELOAD_DELAY_MS);
};
