import {
  Capabilities,
  AutoUvAtlasPayload,
  AutoUvAtlasResult,
  ExportPayload,
  FormatKind,
  GenerateBlockPipelineResult,
  GenerateTexturePresetPayload,
  GenerateTexturePresetResult,
  PreflightTextureResult,
  ProjectDiff,
  ProjectState,
  ProjectStateDetail,
  ReadTexturePayload,
  ReadTextureResult,
  RenderPreviewPayload,
  RenderPreviewResult,
  ToolError
} from '../types';
import { ProjectSession } from '../session';
import { CubeFaceDirection, EditorPort, FaceUvMap, TextureSource, TriggerChannel } from '../ports/editor';
import { TextureMeta } from '../types/texture';
import { FormatPort } from '../ports/formats';
import { SnapshotPort } from '../ports/snapshot';
import { ExportPort } from '../ports/exporter';
import { ok, fail, UsecaseResult } from './result';
import { UvPolicyConfig } from '../domain/uvPolicy';
import { AnimationService } from './AnimationService';
import { BlockPipelineService } from './BlockPipelineService';
import { ExportService } from './ExportService';
import { ProjectService } from './ProjectService';
import { RenderService } from './RenderService';
import { ModelService } from './ModelService';
import { TextureService } from './TextureService';
import { ValidationService } from './ValidationService';
import { ProjectStateService } from '../services/projectState';
import { RevisionStore } from '../services/revision';
import { HostPort } from '../ports/host';
import { ResourceStore } from '../ports/resources';
import { TextureRendererPort } from '../ports/textureRenderer';
import { BlockPipelineMode, BlockPipelineOnConflict, BlockPipelineTextures, BlockVariant } from '../types/blockPipeline';
import type { TmpStorePort } from '../ports/tmpStore';
import type { ToolPolicies } from './policies';
import { PolicyContext } from './PolicyContext';
import { RevisionContext } from './RevisionContext';
import { SnapshotContext } from './SnapshotContext';
const REVISION_CACHE_LIMIT = 5;

export interface ToolServiceDeps {
  session: ProjectSession;
  capabilities: Capabilities;
  editor: EditorPort;
  formats: FormatPort;
  snapshot: SnapshotPort;
  exporter: ExportPort;
  host?: HostPort;
  resources?: ResourceStore;
  textureRenderer?: TextureRendererPort;
  tmpStore?: TmpStorePort;
  policies?: ToolPolicies;
}

export class ToolService {
  private readonly session: ProjectSession;
  private readonly capabilities: Capabilities;
  private readonly editor: EditorPort;
  private readonly formats: FormatPort;
  private readonly exporter: ExportPort;
  private readonly host?: HostPort;
  private readonly resources?: ResourceStore;
  private readonly tmpStore?: TmpStorePort;
  private readonly policyContext: PolicyContext;
  private readonly snapshotContext: SnapshotContext;
  private readonly revisionContext: RevisionContext;
  private readonly projectService: ProjectService;
  private readonly textureService: TextureService;
  private readonly animationService: AnimationService;
  private readonly modelService: ModelService;
  private readonly exportService: ExportService;
  private readonly renderService: RenderService;
  private readonly validationService: ValidationService;
  private readonly blockPipelineService: BlockPipelineService;

  constructor(deps: ToolServiceDeps) {
    this.session = deps.session;
    this.capabilities = deps.capabilities;
    this.editor = deps.editor;
    this.formats = deps.formats;
    this.exporter = deps.exporter;
    this.host = deps.host;
    this.resources = deps.resources;
    this.tmpStore = deps.tmpStore;
    const policies = deps.policies ?? {};
    const projectState = new ProjectStateService(this.formats, policies.formatOverrides);
    const revisionStore = new RevisionStore(REVISION_CACHE_LIMIT);
    this.policyContext = new PolicyContext(policies);
    this.snapshotContext = new SnapshotContext({
      session: this.session,
      snapshotPort: deps.snapshot,
      projectState,
      policyContext: this.policyContext
    });
    this.revisionContext = new RevisionContext({
      revisionStore,
      projectState,
      snapshotContext: this.snapshotContext,
      policyContext: this.policyContext
    });
    this.projectService = new ProjectService({
      session: this.session,
      capabilities: this.capabilities,
      editor: this.editor,
      formats: this.formats,
      projectState,
      revision: {
        track: (snapshot) => revisionStore.track(snapshot),
        hash: (snapshot) => revisionStore.hash(snapshot),
        get: (id) => revisionStore.get(id),
        remember: (snapshot, id) => revisionStore.remember(snapshot, id)
      },
      getSnapshot: () => this.snapshotContext.getSnapshot(),
      ensureRevisionMatch: (ifRevision?: string) => this.revisionContext.ensureRevisionMatch(ifRevision),
      policies: {
        formatOverrides: this.policyContext.getFormatOverrides(),
        autoDiscardUnsaved: this.policyContext.getAutoDiscardUnsaved()
      }
    });
    this.textureService = new TextureService({
      session: this.session,
      editor: this.editor,
      capabilities: this.capabilities,
      textureRenderer: deps.textureRenderer,
      tmpStore: this.tmpStore,
      getSnapshot: () => this.snapshotContext.getSnapshot(),
      ensureActive: () => this.snapshotContext.ensureActive(),
      ensureRevisionMatch: (ifRevision?: string) => this.revisionContext.ensureRevisionMatch(ifRevision),
      getUvPolicyConfig: () => this.policyContext.getUvPolicyConfig()
    });
    this.animationService = new AnimationService({
      session: this.session,
      editor: this.editor,
      capabilities: this.capabilities,
      getSnapshot: () => this.snapshotContext.getSnapshot(),
      ensureActive: () => this.snapshotContext.ensureActive(),
      ensureRevisionMatch: (ifRevision?: string) => this.revisionContext.ensureRevisionMatch(ifRevision)
    });
    this.modelService = new ModelService({
      session: this.session,
      editor: this.editor,
      capabilities: this.capabilities,
      getSnapshot: () => this.snapshotContext.getSnapshot(),
      ensureActive: () => this.snapshotContext.ensureActive(),
      ensureRevisionMatch: (ifRevision?: string) => this.revisionContext.ensureRevisionMatch(ifRevision),
      getRigMergeStrategy: () => this.policyContext.getRigMergeStrategy()
    });
    this.exportService = new ExportService({
      capabilities: this.capabilities,
      editor: this.editor,
      exporter: this.exporter,
      formats: this.formats,
      projectState,
      getSnapshot: () => this.snapshotContext.getSnapshot(),
      ensureActive: () => this.snapshotContext.ensureActive(),
      policies: {
        formatOverrides: this.policyContext.getFormatOverrides(),
        exportPolicy: this.policyContext.getExportPolicy()
      }
    });
    this.renderService = new RenderService({
      editor: this.editor,
      tmpStore: this.tmpStore,
      ensureActive: () => this.snapshotContext.ensureActive()
    });
    this.validationService = new ValidationService({
      editor: this.editor,
      capabilities: this.capabilities,
      ensureActive: () => this.snapshotContext.ensureActive(),
      getSnapshot: () => this.snapshotContext.getSnapshot(),
      getUvPolicyConfig: () => this.policyContext.getUvPolicyConfig()
    });
    this.blockPipelineService = new BlockPipelineService({
      resources: this.resources,
      createProject: (format, name, options) => this.projectService.createProject(format, name, options),
      runWithoutRevisionGuard: (fn) => this.revisionContext.runWithoutRevisionGuard(fn),
      addBone: (payload) => this.modelService.addBone(payload),
      addCube: (payload) => this.modelService.addCube(payload)
    });
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

  runWithoutRevisionGuard<T>(fn: () => T): T {
    return this.revisionContext.runWithoutRevisionGuard(fn);
  }

  async runWithoutRevisionGuardAsync<T>(fn: () => Promise<T> | T): Promise<T> {
    return await this.revisionContext.runWithoutRevisionGuardAsync(fn);
  }

  reloadPlugins(payload: { confirm?: boolean; delayMs?: number }): UsecaseResult<{ scheduled: true; delayMs: number; method: 'devReload' }> {
    if (payload.confirm !== true) {
      return fail({
        code: 'invalid_payload',
        message: 'confirm=true is required to reload plugins.',
        fix: 'Set confirm=true to proceed.'
      });
    }
    if (!this.host) {
      return fail({ code: 'not_implemented', message: 'Plugin reload is not available in this host.' });
    }
    const delayMs = normalizeReloadDelay(payload.delayMs);
    const err = this.host.schedulePluginReload(delayMs);
    if (err) return fail(err);
    return ok({ scheduled: true, delayMs, method: 'devReload' });
  }

  getProjectTextureResolution(): { width: number; height: number } | null {
    return this.textureService.getProjectTextureResolution();
  }

  setProjectTextureResolution(payload: {
    width: number;
    height: number;
    ifRevision?: string;
    modifyUv?: boolean;
  }): UsecaseResult<{ width: number; height: number }> {
    return this.textureService.setProjectTextureResolution(payload);
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
    return this.textureService.getTextureUsage(payload);
  }

  preflightTexture(payload: { textureId?: string; textureName?: string; includeUsage?: boolean }): UsecaseResult<PreflightTextureResult> {
    return this.textureService.preflightTexture(payload);
  }

  generateTexturePreset(payload: GenerateTexturePresetPayload): UsecaseResult<GenerateTexturePresetResult> {
    return this.textureService.generateTexturePreset(payload);
  }

  autoUvAtlas(payload: AutoUvAtlasPayload): UsecaseResult<AutoUvAtlasResult> {
    return this.textureService.autoUvAtlas(payload);
  }

  getProjectState(payload: { detail?: ProjectStateDetail }): UsecaseResult<{ project: ProjectState }> {
    return this.projectService.getProjectState(payload);
  }

  getProjectDiff(payload: { sinceRevision: string; detail?: ProjectStateDetail }): UsecaseResult<{ diff: ProjectDiff }> {
    return this.projectService.getProjectDiff(payload);
  }

  ensureProject(payload: {
    format?: Capabilities['formats'][number]['format'];
    name?: string;
    match?: 'none' | 'format' | 'name' | 'format_and_name';
    onMismatch?: 'reuse' | 'error' | 'create';
    onMissing?: 'create' | 'error';
    confirmDiscard?: boolean;
    dialog?: Record<string, unknown>;
    confirmDialog?: boolean;
    ifRevision?: string;
  }): UsecaseResult<{ action: 'created' | 'reused'; project: { id: string; format: FormatKind; name: string | null; formatId?: string | null } }> {
    return this.projectService.ensureProject(payload);
  }

  generateBlockPipeline(payload: {
    name: string;
    texture: string;
    namespace?: string;
    variants?: BlockVariant[];
    textures?: BlockPipelineTextures;
    onConflict?: BlockPipelineOnConflict;
    mode?: BlockPipelineMode;
    ifRevision?: string;
  }): UsecaseResult<GenerateBlockPipelineResult> {
    return this.blockPipelineService.generateBlockPipeline(payload);
  }

  createProject(
    format: Capabilities['formats'][number]['format'],
    name: string,
    options?: { confirmDiscard?: boolean; dialog?: Record<string, unknown>; confirmDialog?: boolean; ifRevision?: string }
  ): UsecaseResult<{ id: string; format: FormatKind; name: string }> {
    return this.projectService.createProject(format, name, options);
  }

  importTexture(payload: {
    id?: string;
    name: string;
    image: CanvasImageSource;
    width?: number;
    height?: number;
    ifRevision?: string;
  } & TextureMeta): UsecaseResult<{ id: string; name: string }> {
    return this.textureService.importTexture(payload);
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
    return this.textureService.updateTexture(payload);
  }

  deleteTexture(payload: { id?: string; name?: string; ifRevision?: string }): UsecaseResult<{ id: string; name: string }> {
    return this.textureService.deleteTexture(payload);
  }

  readTexture(payload: { id?: string; name?: string }): UsecaseResult<TextureSource> {
    return this.textureService.readTexture(payload);
  }

  readTextureImage(payload: ReadTexturePayload): UsecaseResult<ReadTextureResult> {
    return this.textureService.readTextureImage(payload);
  }

  assignTexture(payload: {
    textureId?: string;
    textureName?: string;
    cubeIds?: string[];
    cubeNames?: string[];
    faces?: CubeFaceDirection[];
    ifRevision?: string;
  }): UsecaseResult<{ textureId?: string; textureName: string; cubeCount: number; faces?: CubeFaceDirection[] }> {
    return this.textureService.assignTexture(payload);
  }

  setFaceUv(payload: {
    cubeId?: string;
    cubeName?: string;
    faces: FaceUvMap;
    ifRevision?: string;
  }): UsecaseResult<{ cubeId?: string; cubeName: string; faces: CubeFaceDirection[] }> {
    return this.textureService.setFaceUv(payload);
  }

  addBone(payload: {
    id?: string;
    name: string;
    parent?: string;
    parentId?: string;
    pivot: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string }> {
    return this.modelService.addBone(payload);
  }

  updateBone(payload: {
    id?: string;
    name?: string;
    newName?: string;
    parent?: string;
    parentId?: string;
    parentRoot?: boolean;
    pivot?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string }> {
    return this.modelService.updateBone(payload);
  }

  deleteBone(payload: {
    id?: string;
    name?: string;
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string; removedBones: number; removedCubes: number }> {
    return this.modelService.deleteBone(payload);
  }

  addCube(payload: {
    id?: string;
    name: string;
    from: [number, number, number];
    to: [number, number, number];
    bone?: string;
    boneId?: string;
    inflate?: number;
    mirror?: boolean;
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string }> {
    return this.modelService.addCube(payload);
  }

  updateCube(payload: {
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
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string }> {
    return this.modelService.updateCube(payload);
  }

  deleteCube(payload: { id?: string; name?: string; ifRevision?: string }): UsecaseResult<{ id: string; name: string }> {
    return this.modelService.deleteCube(payload);
  }

  applyRigTemplate(payload: { templateId: string; ifRevision?: string }): UsecaseResult<{ templateId: string }> {
    return this.modelService.applyRigTemplate(payload);
  }

  createAnimationClip(payload: {
    id?: string;
    name: string;
    length: number;
    loop: boolean;
    fps: number;
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string }> {
    return this.animationService.createAnimationClip(payload);
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
    return this.animationService.updateAnimationClip(payload);
  }

  deleteAnimationClip(payload: { id?: string; name?: string; ifRevision?: string }): UsecaseResult<{ id: string; name: string }> {
    return this.animationService.deleteAnimationClip(payload);
  }

  setKeyframes(payload: {
    clipId?: string;
    clip: string;
    bone: string;
    channel: 'rot' | 'pos' | 'scale';
    keys: { time: number; value: [number, number, number]; interp?: 'linear' | 'step' | 'catmullrom' }[];
    ifRevision?: string;
  }): UsecaseResult<{ clip: string; clipId?: string; bone: string }> {
    return this.animationService.setKeyframes(payload);
  }

  setTriggerKeyframes(payload: {
    clipId?: string;
    clip: string;
    channel: TriggerChannel;
    keys: { time: number; value: string | string[] | Record<string, unknown> }[];
    ifRevision?: string;
  }): UsecaseResult<{ clip: string; clipId?: string; channel: TriggerChannel }> {
    return this.animationService.setTriggerKeyframes(payload);
  }

  exportModel(payload: ExportPayload): UsecaseResult<{ path: string }> {
    return this.exportService.exportModel(payload);
  }

  renderPreview(payload: RenderPreviewPayload): UsecaseResult<RenderPreviewResult> {
    return this.renderService.renderPreview(payload);
  }

  validate(): UsecaseResult<{ findings: { code: string; message: string; severity: 'error' | 'warning' | 'info' }[] }> {
    return this.validationService.validate();
  }

}

const DEFAULT_RELOAD_DELAY_MS = 100;
const MAX_RELOAD_DELAY_MS = 10_000;

const normalizeReloadDelay = (value?: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_RELOAD_DELAY_MS;
  const rounded = Math.max(0, Math.trunc(value));
  return Math.min(rounded, MAX_RELOAD_DELAY_MS);
};
