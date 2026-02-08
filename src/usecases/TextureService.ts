import {
  AutoUvAtlasPayload,
  AutoUvAtlasResult,
  Capabilities,
  PaintFacesPayload,
  PaintFacesResult,
  PaintMeshFacePayload,
  PaintMeshFaceResult,
  PaintTexturePayload,
  PaintTextureResult,
  PreflightTextureResult,
  ReadTexturePayload,
  ReadTextureResult,
  ToolError
} from '../types/internal';
import { ProjectSession, SessionState } from '../session';
import { CubeFaceDirection, EditorPort, FaceUvMap, TextureSource } from '../ports/editor';
import { TextureMeta } from '../types/texture';
import { runAutoUvAtlas, runPaintFaces, runPaintMeshFace, runPaintTexture, TextureToolContext } from './textureTools';
import { ok, fail, UsecaseResult } from './result';
import { TextureWriteService } from './textureService/TextureWriteService';
import { TextureReadService } from './textureService/TextureReadService';
import { withActiveOnly } from './guards';
import type { TextureRendererPort } from '../ports/textureRenderer';
import type { TmpStorePort } from '../ports/tmpStore';
import type { UvPolicyConfig } from '../domain/uv/policy';
import { runTexturePreflight } from './textureService/preflight';
import { TextureResolutionService } from './textureService/TextureResolutionService';
import { TextureAssignmentService } from './textureService/TextureAssignmentService';
import { TextureUvService } from './textureService/TextureUvService';
import { ensureTextureSelector } from './textureService/textureSelector';
import { runCreateBlankTexture } from './textureService/textureBlank';

const selectorError = (id?: string, name?: string) => ensureTextureSelector(id, name);

export interface TextureServiceDeps {
  session: ProjectSession;
  editor: EditorPort;
  capabilities: Capabilities;
  textureRenderer?: TextureRendererPort;
  tmpStore?: TmpStorePort;
  getSnapshot: () => SessionState;
  ensureActive: () => ToolError | null;
  ensureRevisionMatch: (ifRevision?: string) => ToolError | null;
  getUvPolicyConfig: () => UvPolicyConfig;
  runWithoutRevisionGuard?: <T>(fn: () => T) => T;
}

export class TextureService {
  private readonly session: ProjectSession;
  private readonly editor: EditorPort;
  private readonly capabilities: Capabilities;
  private readonly textureRenderer?: TextureRendererPort;
  private readonly tmpStore?: TmpStorePort;
  private readonly getSnapshot: () => SessionState;
  private readonly ensureActive: () => ToolError | null;
  private readonly ensureRevisionMatch: (ifRevision?: string) => ToolError | null;
  private readonly getUvPolicyConfig: () => UvPolicyConfig;
  private readonly runWithoutRevisionGuard?: <T>(fn: () => T) => T;
  private readonly textureWriter: TextureWriteService;
  private readonly textureReader: TextureReadService;
  private readonly resolutionService: TextureResolutionService;
  private readonly assignmentService: TextureAssignmentService;
  private readonly uvService: TextureUvService;

  constructor(deps: TextureServiceDeps) {
    this.session = deps.session;
    this.editor = deps.editor;
    this.capabilities = deps.capabilities;
    this.textureRenderer = deps.textureRenderer;
    this.tmpStore = deps.tmpStore;
    this.getSnapshot = deps.getSnapshot;
    this.ensureActive = deps.ensureActive;
    this.ensureRevisionMatch = deps.ensureRevisionMatch;
    this.getUvPolicyConfig = deps.getUvPolicyConfig;
    this.runWithoutRevisionGuard = deps.runWithoutRevisionGuard;
    this.textureWriter = new TextureWriteService({
      session: this.session,
      editor: this.editor,
      getSnapshot: this.getSnapshot,
      ensureActive: this.ensureActive,
      ensureRevisionMatch: this.ensureRevisionMatch
    });
    this.textureReader = new TextureReadService({
      editor: this.editor,
      ensureActive: this.ensureActive,
      tmpStore: this.tmpStore
    });
    this.resolutionService = new TextureResolutionService({
      editor: this.editor,
      capabilities: this.capabilities,
      ensureActive: this.ensureActive,
      ensureRevisionMatch: this.ensureRevisionMatch
    });
    this.assignmentService = new TextureAssignmentService({
      editor: this.editor,
      getSnapshot: this.getSnapshot,
      ensureActive: this.ensureActive,
      ensureRevisionMatch: this.ensureRevisionMatch
    });
    this.uvService = new TextureUvService({
      editor: this.editor,
      getSnapshot: this.getSnapshot,
      ensureActive: this.ensureActive,
      ensureRevisionMatch: this.ensureRevisionMatch,
      getUvPolicyConfig: this.getUvPolicyConfig
    });
  }

  getProjectTextureResolution(): { width: number; height: number } | null {
    return this.editor.getProjectTextureResolution();
  }

  setProjectTextureResolution(payload: {
    width: number;
    height: number;
    ifRevision?: string;
    modifyUv?: boolean;
  }): UsecaseResult<{ width: number; height: number }> {
    return this.resolutionService.setProjectTextureResolution(payload);
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
    return withActiveOnly(this.ensureActive, () => {
      const selectorErr = selectorError(payload.textureId, payload.textureName);
      if (selectorErr) return fail(selectorErr);
      const res = this.editor.getTextureUsage(payload);
      if (res.error) return fail(res.error);
      return ok(res.result!);
    });
  }

  preflightTexture(payload: { textureId?: string; textureName?: string; includeUsage?: boolean }): UsecaseResult<PreflightTextureResult> {
    return runTexturePreflight(
      {
        ensureActive: this.ensureActive,
        ensureTextureSelector: selectorError,
        editor: this.editor,
        capabilities: this.capabilities,
        getSnapshot: this.getSnapshot,
        getUvPolicyConfig: this.getUvPolicyConfig
      },
      payload
    );
  }

  paintTexture(payload: PaintTexturePayload): UsecaseResult<PaintTextureResult> {
    return runPaintTexture(this.getTextureToolContext(), payload);
  }

  paintFaces(payload: PaintFacesPayload): UsecaseResult<PaintFacesResult> {
    return runPaintFaces(this.getTextureToolContext(), payload);
  }

  paintMeshFace(payload: PaintMeshFacePayload): UsecaseResult<PaintMeshFaceResult> {
    return runPaintMeshFace(this.getTextureToolContext(), payload);
  }

  autoUvAtlas(payload: AutoUvAtlasPayload): UsecaseResult<AutoUvAtlasResult> {
    return runAutoUvAtlas(this.getTextureToolContext(), payload);
  }

  createBlankTexture(payload: {
    name: string;
    width?: number;
    height?: number;
    background?: string;
    ifRevision?: string;
    allowExisting?: boolean;
  }): UsecaseResult<{ id: string; name: string; created: boolean }> {
    return runCreateBlankTexture(
      {
        ensureActive: this.ensureActive,
        capabilities: this.capabilities,
        editor: this.editor,
        textureRenderer: this.textureRenderer,
        importTexture: (nextPayload) => this.textureWriter.importTexture(nextPayload)
      },
      payload
    );
  }

  importTexture(payload: {
    id?: string;
    name: string;
    image: CanvasImageSource;
    width?: number;
    height?: number;
    ifRevision?: string;
  } & TextureMeta): UsecaseResult<{ id: string; name: string }> {
    return this.textureWriter.importTexture(payload);
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
    return this.textureWriter.updateTexture(payload);
  }

  deleteTexture(payload: { id?: string; name?: string; ifRevision?: string }): UsecaseResult<{ id: string; name: string }> {
    return this.textureWriter.deleteTexture(payload);
  }

  readTexture(payload: { id?: string; name?: string }): UsecaseResult<TextureSource> {
    return this.textureReader.readTexture(payload);
  }

  readTextureImage(payload: ReadTexturePayload): UsecaseResult<ReadTextureResult> {
    return this.textureReader.readTextureImage(payload);
  }

  assignTexture(payload: {
    textureId?: string;
    textureName?: string;
    cubeIds?: string[];
    cubeNames?: string[];
    faces?: CubeFaceDirection[];
    ifRevision?: string;
  }): UsecaseResult<{ textureId?: string; textureName: string; cubeCount: number; faces?: CubeFaceDirection[] }> {
    return this.assignmentService.assignTexture(payload);
  }

  setFaceUv(payload: {
    cubeId?: string;
    cubeName?: string;
    faces: FaceUvMap;
    ifRevision?: string;
  }): UsecaseResult<{ cubeId?: string; cubeName: string; faces: CubeFaceDirection[] }> {
    return this.uvService.setFaceUv(payload);
  }

  private getTextureToolContext(): TextureToolContext {
    return {
      ensureActive: () => this.ensureActive(),
      ensureRevisionMatch: (ifRevision?: string) => this.ensureRevisionMatch(ifRevision),
      getSnapshot: () => this.getSnapshot(),
      editor: this.editor,
      textureRenderer: this.textureRenderer,
      capabilities: this.capabilities,
      getUvPolicyConfig: () => this.getUvPolicyConfig(),
      importTexture: (payload) => this.importTexture(payload),
      updateTexture: (payload) => this.updateTexture(payload),
      setProjectUvPixelsPerBlock: (value) => {
        const err = this.editor.setProjectUvPixelsPerBlock(value);
        if (err) return err;
        this.session.setUvPixelsPerBlock(value);
        return null;
      },
      assignTexture: (payload) => this.assignTexture(payload),
      createBlankTexture: (payload) => this.createBlankTexture(payload),
      preflightTexture: (payload) => this.preflightTexture(payload),
      autoUvAtlas: (payload) => this.autoUvAtlas(payload),
      runWithoutRevisionGuard: (fn) => this.runWithoutRevisionGuard?.(fn) ?? fn()
    };
  }
}







