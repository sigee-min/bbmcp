import {
  AutoUvAtlasPayload,
  AutoUvAtlasResult,
  Capabilities,
  GenerateTexturePresetPayload,
  GenerateTexturePresetResult,
  PreflightTextureResult,
  ReadTexturePayload,
  ReadTextureResult,
  ToolError
} from '../types';
import { ProjectSession, SessionState } from '../session';
import { CubeFaceDirection, EditorPort, FaceUvMap, TextureSource } from '../ports/editor';
import { TextureMeta } from '../types/texture';
import { computeTextureUsageId } from '../domain/textureUsage';
import { findUvOverlapIssues, formatUvFaceRect } from '../domain/uvOverlap';
import { checkDimensions, mapDimensionError } from '../domain/dimensions';
import { runAutoUvAtlas, runGenerateTexturePreset, TextureToolContext } from './textureTools';
import { ok, fail, UsecaseResult } from './result';
import { TextureCrudService } from './TextureCrudService';
import { resolveTextureOrError } from '../services/targetGuards';
import { toDomainTextureUsage } from './domainMappers';
import { validateUvBounds } from '../domain/uvBounds';
import { validateUvAssignments } from '../domain/uvAssignments';
import { ensureActiveAndRevision, ensureActiveOnly } from './guards';
import type { TextureRendererPort } from '../ports/textureRenderer';
import type { TmpStorePort } from '../ports/tmpStore';
import type { UvPolicyConfig } from '../domain/uvPolicy';
import { ensureNonBlankString } from '../services/validation';
import {
  computeUvBounds,
  normalizeCubeFaces,
  recommendResolution,
  resolveCubeTargets,
  summarizeTextureUsage
} from '../services/textureUtils';
import {
  TEXTURE_ASSIGN_FACES_INVALID,
  TEXTURE_ASSIGN_NO_TARGETS,
  TEXTURE_ASSIGN_TARGET_REQUIRED,
  TEXTURE_ASSIGN_TARGET_REQUIRED_FIX,
  TEXTURE_FACE_UV_BOUNDS_FIX,
  TEXTURE_FACE_UV_FACES_FIX,
  TEXTURE_FACE_UV_TARGET_FIX,
  MODEL_CUBE_NOT_FOUND,
  TEXTURE_NOT_FOUND,
  TEXTURE_PREFLIGHT_BOUNDS_EXCEED,
  TEXTURE_PREFLIGHT_NO_UV_RECTS,
  TEXTURE_PREFLIGHT_OVERLAP_WARNING,
  TEXTURE_PREFLIGHT_UNRESOLVED_REFS,
  TEXTURE_RESOLUTION_EXCEEDS_MAX,
  TEXTURE_RESOLUTION_EXCEEDS_MAX_FIX,
  TEXTURE_RESOLUTION_INTEGER,
  TEXTURE_RESOLUTION_POSITIVE
} from '../shared/messages';

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
  private readonly textureCrud: TextureCrudService;

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
    this.textureCrud = new TextureCrudService({
      session: this.session,
      editor: this.editor,
      getSnapshot: this.getSnapshot,
      ensureActive: this.ensureActive,
      ensureRevisionMatch: this.ensureRevisionMatch,
      tmpStore: this.tmpStore
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
    const guardErr = ensureActiveAndRevision(this.ensureActive, this.ensureRevisionMatch, payload.ifRevision);
    if (guardErr) return fail(guardErr);
    const width = Number(payload.width);
    const height = Number(payload.height);
    const modifyUv = payload.modifyUv === true;
    const maxSize = this.capabilities.limits.maxTextureSize;
    const sizeCheck = checkDimensions(width, height, { requireInteger: true, maxSize });
    if (!sizeCheck.ok) {
      const sizeMessage = mapDimensionError(sizeCheck, {
        nonPositive: (_axis) => TEXTURE_RESOLUTION_POSITIVE,
        nonInteger: (_axis) => TEXTURE_RESOLUTION_INTEGER,
        exceedsMax: (limit) => TEXTURE_RESOLUTION_EXCEEDS_MAX(limit || maxSize)
      });
      if (sizeCheck.reason === 'exceeds_max') {
        return fail({
          code: 'invalid_payload',
          message: sizeMessage ?? TEXTURE_RESOLUTION_EXCEEDS_MAX(maxSize),
          fix: TEXTURE_RESOLUTION_EXCEEDS_MAX_FIX(maxSize),
          details: { width, height, maxSize }
        });
      }
      return fail({ code: 'invalid_payload', message: sizeMessage ?? TEXTURE_RESOLUTION_POSITIVE });
    }
    const err = this.editor.setProjectTextureResolution(width, height, modifyUv);
    if (err) return fail(err);
    return ok({ width, height });
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
    const activeErr = ensureActiveOnly(this.ensureActive);
    if (activeErr) return fail(activeErr);
    const selectorErr = this.ensureTextureSelector(payload.textureId, payload.textureName);
    if (selectorErr) return fail(selectorErr);
    const res = this.editor.getTextureUsage(payload);
    if (res.error) return fail(res.error);
    return ok(res.result!);
  }

  preflightTexture(payload: { textureId?: string; textureName?: string; includeUsage?: boolean }): UsecaseResult<PreflightTextureResult> {
    const activeErr = ensureActiveOnly(this.ensureActive);
    if (activeErr) return fail(activeErr);
    const selectorErr = this.ensureTextureSelector(payload.textureId, payload.textureName);
    if (selectorErr) return fail(selectorErr);
    const usageRes = this.editor.getTextureUsage({});
    if (usageRes.error) return fail(usageRes.error);
    const usageRawFull = usageRes.result ?? { textures: [] };
    const uvUsageId = computeTextureUsageId(toDomainTextureUsage(usageRawFull));
    let usageRaw = usageRawFull;
    if (payload.textureId || payload.textureName) {
      const label = payload.textureId ?? payload.textureName ?? 'texture';
      const match = usageRawFull.textures.find(
        (entry) =>
          (payload.textureId && entry.id === payload.textureId) ||
          (payload.textureName && entry.name === payload.textureName)
      );
      if (!match) {
        return fail({ code: 'invalid_payload', message: TEXTURE_NOT_FOUND(label) });
      }
      usageRaw = {
        textures: [match],
        ...(usageRawFull.unresolved ? { unresolved: usageRawFull.unresolved } : {})
      };
    }
    const usage = toDomainTextureUsage(usageRaw);
    const textureResolution = this.editor.getProjectTextureResolution() ?? undefined;
    const usageSummary = summarizeTextureUsage(usageRaw);
    const uvBounds = computeUvBounds(usageRaw);
    const warnings: string[] = [];
    if (!uvBounds) {
      warnings.push(TEXTURE_PREFLIGHT_NO_UV_RECTS);
    }
    if (usageSummary.unresolvedCount > 0) {
      warnings.push(TEXTURE_PREFLIGHT_UNRESOLVED_REFS(usageSummary.unresolvedCount));
    }
    if (textureResolution && uvBounds) {
      if (uvBounds.maxX > textureResolution.width || uvBounds.maxY > textureResolution.height) {
        warnings.push(
          TEXTURE_PREFLIGHT_BOUNDS_EXCEED(
            uvBounds.maxX,
            uvBounds.maxY,
            textureResolution.width,
            textureResolution.height
          )
        );
      }
    }
    const overlaps = findUvOverlapIssues(usage);
    overlaps.forEach((overlap) => {
      const example = overlap.example
        ? ` Example: ${formatUvFaceRect(overlap.example.a)} overlaps ${formatUvFaceRect(overlap.example.b)}.`
        : '';
      warnings.push(
        TEXTURE_PREFLIGHT_OVERLAP_WARNING(overlap.textureName, overlap.conflictCount, example)
      );
    });
    const recommendedResolution = recommendResolution(uvBounds, textureResolution, this.capabilities.limits.maxTextureSize);
    const result: PreflightTextureResult = {
      uvUsageId,
      warnings,
      usageSummary,
      uvBounds: uvBounds ?? undefined,
      textureResolution,
      recommendedResolution: recommendedResolution ?? undefined,
      textureUsage: payload.includeUsage ? usageRaw : undefined
    };
    return ok(result);
  }

  generateTexturePreset(payload: GenerateTexturePresetPayload): UsecaseResult<GenerateTexturePresetResult> {
    return runGenerateTexturePreset(this.getTextureToolContext(), payload);
  }

  autoUvAtlas(payload: AutoUvAtlasPayload): UsecaseResult<AutoUvAtlasResult> {
    return runAutoUvAtlas(this.getTextureToolContext(), payload);
  }

  importTexture(payload: {
    id?: string;
    name: string;
    image: CanvasImageSource;
    width?: number;
    height?: number;
    ifRevision?: string;
  } & TextureMeta): UsecaseResult<{ id: string; name: string }> {
    return this.textureCrud.importTexture(payload);
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
    return this.textureCrud.updateTexture(payload);
  }

  deleteTexture(payload: { id?: string; name?: string; ifRevision?: string }): UsecaseResult<{ id: string; name: string }> {
    return this.textureCrud.deleteTexture(payload);
  }

  readTexture(payload: { id?: string; name?: string }): UsecaseResult<TextureSource> {
    return this.textureCrud.readTexture(payload);
  }

  readTextureImage(payload: ReadTexturePayload): UsecaseResult<ReadTextureResult> {
    return this.textureCrud.readTextureImage(payload);
  }

  assignTexture(payload: {
    textureId?: string;
    textureName?: string;
    cubeIds?: string[];
    cubeNames?: string[];
    faces?: CubeFaceDirection[];
    ifRevision?: string;
  }): UsecaseResult<{ textureId?: string; textureName: string; cubeCount: number; faces?: CubeFaceDirection[] }> {
    const guardErr = ensureActiveAndRevision(this.ensureActive, this.ensureRevisionMatch, payload.ifRevision);
    if (guardErr) return fail(guardErr);
    const snapshot = this.getSnapshot();
    const resolved = resolveTextureOrError(snapshot.textures, payload.textureId, payload.textureName, {
      idLabel: 'textureId',
      nameLabel: 'textureName',
      required: { message: TEXTURE_ASSIGN_TARGET_REQUIRED, fix: TEXTURE_ASSIGN_TARGET_REQUIRED_FIX }
    });
    if (resolved.error) return fail(resolved.error);
    const texture = resolved.target!;
    const cubes = resolveCubeTargets(snapshot.cubes, payload.cubeIds, payload.cubeNames);
    if (cubes.length === 0) {
      return fail({ code: 'invalid_payload', message: TEXTURE_ASSIGN_NO_TARGETS });
    }
    const faces = normalizeCubeFaces(payload.faces);
    if (payload.faces && payload.faces.length > 0 && !faces) {
      return fail({
        code: 'invalid_payload',
        message: TEXTURE_ASSIGN_FACES_INVALID
      });
    }
    const cubeIds = Array.from(new Set(cubes.map((cube) => cube.id).filter(Boolean) as string[]));
    const cubeNames = Array.from(new Set(cubes.map((cube) => cube.name)));
    const err = this.editor.assignTexture({
      textureId: texture.id ?? payload.textureId,
      textureName: texture.name,
      cubeIds,
      cubeNames,
      faces: faces ?? undefined
    });
    if (err) return fail(err);
    return ok({
      textureId: texture.id ?? payload.textureId,
      textureName: texture.name,
      cubeCount: cubes.length,
      faces: faces ?? undefined
    });
  }

  setFaceUv(payload: {
    cubeId?: string;
    cubeName?: string;
    faces: FaceUvMap;
    ifRevision?: string;
  }): UsecaseResult<{ cubeId?: string; cubeName: string; faces: CubeFaceDirection[] }> {
    const guardErr = ensureActiveAndRevision(this.ensureActive, this.ensureRevisionMatch, payload.ifRevision);
    if (guardErr) return fail(guardErr);
    const assignmentRes = validateUvAssignments([
      { cubeId: payload.cubeId, cubeName: payload.cubeName, faces: payload.faces }
    ]);
    if (!assignmentRes.ok) {
      const reason = assignmentRes.error.details?.reason;
      if (reason === 'target_required' || reason === 'cube_ids_string_array' || reason === 'cube_names_string_array') {
        return fail({
          ...assignmentRes.error,
          fix: TEXTURE_FACE_UV_TARGET_FIX
        });
      }
      if (reason === 'faces_required' || reason === 'faces_non_empty') {
        return fail({
          ...assignmentRes.error,
          fix: TEXTURE_FACE_UV_FACES_FIX
        });
      }
      return fail(assignmentRes.error);
    }
    const snapshot = this.getSnapshot();
    const target = snapshot.cubes.find((cube) => cube.id === payload.cubeId || cube.name === payload.cubeName);
    if (!target) {
      return fail({
        code: 'invalid_payload',
        message: MODEL_CUBE_NOT_FOUND(payload.cubeId ?? payload.cubeName ?? 'unknown')
      });
    }
    const faces: CubeFaceDirection[] = [];
    const normalized: FaceUvMap = {};
    const faceEntries = Object.entries(payload.faces ?? {});
    for (const [faceKey, uv] of faceEntries) {
      const [x1, y1, x2, y2] = uv as [number, number, number, number];
      const boundsErr = this.ensureFaceUvWithinResolution([x1, y1, x2, y2]);
      if (boundsErr) return fail(boundsErr);
      normalized[faceKey as CubeFaceDirection] = [x1, y1, x2, y2];
      faces.push(faceKey as CubeFaceDirection);
    }
    const err = this.editor.setFaceUv({
      cubeId: target.id ?? payload.cubeId,
      cubeName: target.name,
      faces: normalized
    });
    if (err) return fail(err);
    return ok({ cubeId: target.id ?? payload.cubeId, cubeName: target.name, faces });
  }

  private ensureFaceUvWithinResolution(uv: [number, number, number, number]): ToolError | null {
    const resolution = this.editor.getProjectTextureResolution();
    if (!resolution) return null;
    const boundsErr = validateUvBounds(uv, resolution, { uv, textureResolution: resolution });
    if (!boundsErr) return null;
    if (boundsErr.ok) return null;
    const reason = boundsErr.error.details?.reason;
    if (reason === 'out_of_bounds') {
      return {
        ...boundsErr.error,
        fix: TEXTURE_FACE_UV_BOUNDS_FIX
      };
    }
    return boundsErr.error;
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
      updateTexture: (payload) => this.updateTexture(payload)
    };
  }

  private ensureTextureSelector(textureId?: string, textureName?: string): ToolError | null {
    const idBlankErr = ensureNonBlankString(textureId, 'textureId');
    if (idBlankErr) return idBlankErr;
    const nameBlankErr = ensureNonBlankString(textureName, 'textureName');
    if (nameBlankErr) return nameBlankErr;
    return null;
  }
}
