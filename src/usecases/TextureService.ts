import {
  AutoUvAtlasPayload,
  AutoUvAtlasResult,
  Capabilities,
  GenerateTexturePresetPayload,
  GenerateTexturePresetResult,
  PreflightTextureResult,
  PreflightUsageSummary,
  PreflightUvBounds,
  ReadTexturePayload,
  ReadTextureResult,
  ToolError
} from '../types';
import { ProjectSession, SessionState } from '../session';
import {
  CubeFaceDirection,
  EditorPort,
  FaceUvMap,
  TextureSource,
  TextureUsageResult
} from '../ports/editor';
import { TextureMeta } from '../types/texture';
import { computeTextureUsageId } from '../domain/textureUsage';
import { findUvOverlapIssues, formatUvFaceRect } from '../domain/uvOverlap';
import { runAutoUvAtlas, runGenerateTexturePreset, TextureToolContext } from './textureTools';
import { ok, fail, UsecaseResult } from './result';
import { resolveCubeTarget, resolveTextureTarget } from '../services/lookup';
import { createId } from '../services/id';
import { toDomainTextureUsage } from './domainMappers';
import type { TextureRendererPort } from '../ports/textureRenderer';
import type { TmpStorePort } from '../ports/tmpStore';
import type { UvPolicyConfig } from '../domain/uvPolicy';

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
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    const width = Number(payload.width);
    const height = Number(payload.height);
    const modifyUv = payload.modifyUv === true;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return fail({ code: 'invalid_payload', message: 'width and height must be positive numbers.' });
    }
    if (!Number.isInteger(width) || !Number.isInteger(height)) {
      return fail({ code: 'invalid_payload', message: 'width and height must be integers.' });
    }
    const maxSize = this.capabilities.limits.maxTextureSize;
    if (width > maxSize || height > maxSize) {
      return fail({
        code: 'invalid_payload',
        message: `Texture resolution exceeds max size (${maxSize}).`,
        fix: `Use width/height <= ${maxSize}.`,
        details: { width, height, maxSize }
      });
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
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const res = this.editor.getTextureUsage(payload);
    if (res.error) return fail(res.error);
    return ok(res.result!);
  }

  preflightTexture(payload: { textureId?: string; textureName?: string; includeUsage?: boolean }): UsecaseResult<PreflightTextureResult> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const usageRes = this.editor.getTextureUsage({ textureId: payload.textureId, textureName: payload.textureName });
    if (usageRes.error) return fail(usageRes.error);
    const usageRaw = usageRes.result ?? { textures: [] };
    const usage = toDomainTextureUsage(usageRaw);
    const usageIdSource =
      payload.textureId || payload.textureName ? this.editor.getTextureUsage({}) : usageRes;
    if (usageIdSource.error) return fail(usageIdSource.error);
    const usageIdRaw = usageIdSource.result ?? { textures: [] };
    const uvUsageId = computeTextureUsageId(toDomainTextureUsage(usageIdRaw));
    const textureResolution = this.editor.getProjectTextureResolution() ?? undefined;
    const usageSummary = summarizeTextureUsage(usageRaw);
    const uvBounds = computeUvBounds(usageRaw);
    const warnings: string[] = [];
    if (!uvBounds) {
      warnings.push('No UV rects found; preflight cannot compute UV bounds.');
    }
    if (usageSummary.unresolvedCount > 0) {
      warnings.push(`Unresolved texture references detected (${usageSummary.unresolvedCount}).`);
    }
    if (textureResolution && uvBounds) {
      if (uvBounds.maxX > textureResolution.width || uvBounds.maxY > textureResolution.height) {
        warnings.push(
          `UV bounds exceed textureResolution (${uvBounds.maxX}x${uvBounds.maxY} > ${textureResolution.width}x${textureResolution.height}).`
        );
      }
    }
    const overlaps = findUvOverlapIssues(usage);
    overlaps.forEach((overlap) => {
      const example = overlap.example
        ? ` Example: ${formatUvFaceRect(overlap.example.a)} overlaps ${formatUvFaceRect(overlap.example.b)}.`
        : '';
      warnings.push(
        `UV overlap detected for texture "${overlap.textureName}" (${overlap.conflictCount} conflict${overlap.conflictCount === 1 ? '' : 's'}).` +
          ` Only identical UV rects may overlap.` +
          example
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
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    if (!payload.name) {
      return fail({ code: 'invalid_payload', message: 'Texture name is required' });
    }
    const snapshot = this.getSnapshot();
    const nameConflict = snapshot.textures.some((t) => t.name === payload.name);
    if (nameConflict) {
      return fail({ code: 'invalid_payload', message: `Texture already exists: ${payload.name}` });
    }
    const id = payload.id ?? createId('tex');
    const idConflict = snapshot.textures.some((t) => t.id && t.id === id);
    if (idConflict) {
      return fail({ code: 'invalid_payload', message: `Texture id already exists: ${id}` });
    }
    const contentHash = hashCanvasImage(payload.image);
    const err = this.editor.importTexture({
      id,
      name: payload.name,
      image: payload.image,
      width: payload.width,
      height: payload.height,
      namespace: payload.namespace,
      folder: payload.folder,
      particle: payload.particle,
      visible: payload.visible,
      renderMode: payload.renderMode,
      renderSides: payload.renderSides,
      pbrChannel: payload.pbrChannel,
      group: payload.group,
      frameTime: payload.frameTime,
      frameOrderType: payload.frameOrderType,
      frameOrder: payload.frameOrder,
      frameInterpolate: payload.frameInterpolate,
      internal: payload.internal,
      keepSize: payload.keepSize
    });
    if (err) return fail(err);
    const match = this.editor
      .listTextures()
      .find((t) => (t.id && t.id === id) || t.name === payload.name);
    const resolvedSize = resolveTextureSize(
      { width: match?.width, height: match?.height },
      { width: payload.width, height: payload.height }
    );
    this.session.addTexture({
      id,
      name: payload.name,
      width: resolvedSize.width,
      height: resolvedSize.height,
      contentHash: contentHash ?? undefined,
      namespace: payload.namespace,
      folder: payload.folder,
      particle: payload.particle,
      visible: payload.visible,
      renderMode: payload.renderMode,
      renderSides: payload.renderSides,
      pbrChannel: payload.pbrChannel,
      group: payload.group,
      frameTime: payload.frameTime,
      frameOrderType: payload.frameOrderType,
      frameOrder: payload.frameOrder,
      frameInterpolate: payload.frameInterpolate,
      internal: payload.internal,
      keepSize: payload.keepSize
    });
    return ok({ id, name: payload.name });
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
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    const snapshot = this.getSnapshot();
    if (!payload.id && !payload.name) {
      return fail({
        code: 'invalid_payload',
        message: 'Texture id or name is required',
        fix: 'Provide id or name for the texture.'
      });
    }
    const target = resolveTextureTarget(snapshot.textures, payload.id, payload.name);
    if (!target) {
      const label = payload.id ?? payload.name ?? 'unknown';
      return fail({ code: 'invalid_payload', message: `Texture not found: ${label}` });
    }
    const contentHash = hashCanvasImage(payload.image);
    const targetName = target.name;
    const targetId = target.id ?? payload.id ?? createId('tex');
    if (payload.newName && payload.newName !== targetName) {
      const conflict = snapshot.textures.some((t) => t.name === payload.newName && t.name !== targetName);
      if (conflict) {
        return fail({ code: 'invalid_payload', message: `Texture already exists: ${payload.newName}` });
      }
    }
    const renaming = Boolean(payload.newName && payload.newName !== targetName);
    if (contentHash && target.contentHash && contentHash === target.contentHash && !renaming) {
      return fail({
        code: 'no_change',
        message: 'Texture content is unchanged.',
        fix: 'Adjust ops or include a rename before updating.'
      });
    }
    const err = this.editor.updateTexture({
      id: targetId,
      name: targetName,
      newName: payload.newName,
      image: payload.image,
      width: payload.width,
      height: payload.height,
      namespace: payload.namespace,
      folder: payload.folder,
      particle: payload.particle,
      visible: payload.visible,
      renderMode: payload.renderMode,
      renderSides: payload.renderSides,
      pbrChannel: payload.pbrChannel,
      group: payload.group,
      frameTime: payload.frameTime,
      frameOrderType: payload.frameOrderType,
      frameOrder: payload.frameOrder,
      frameInterpolate: payload.frameInterpolate,
      internal: payload.internal,
      keepSize: payload.keepSize
    });
    if (err) return fail(err);
    const effectiveName = payload.newName ?? targetName;
    const match = this.editor
      .listTextures()
      .find((t) => (t.id && t.id === targetId) || t.name === effectiveName);
    const resolvedSize = resolveTextureSize(
      { width: match?.width, height: match?.height },
      { width: payload.width, height: payload.height },
      { width: target.width, height: target.height }
    );
    this.session.updateTexture(targetName, {
      id: targetId,
      newName: payload.newName,
      width: resolvedSize.width,
      height: resolvedSize.height,
      contentHash: contentHash ?? undefined,
      namespace: payload.namespace,
      folder: payload.folder,
      particle: payload.particle,
      visible: payload.visible,
      renderMode: payload.renderMode,
      renderSides: payload.renderSides,
      pbrChannel: payload.pbrChannel,
      group: payload.group,
      frameTime: payload.frameTime,
      frameOrderType: payload.frameOrderType,
      frameOrder: payload.frameOrder,
      frameInterpolate: payload.frameInterpolate,
      internal: payload.internal,
      keepSize: payload.keepSize
    });
    return ok({ id: targetId, name: effectiveName });
  }

  deleteTexture(payload: { id?: string; name?: string; ifRevision?: string }): UsecaseResult<{ id: string; name: string }> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    const snapshot = this.getSnapshot();
    if (!payload.id && !payload.name) {
      return fail({ code: 'invalid_payload', message: 'Texture id or name is required' });
    }
    const target = resolveTextureTarget(snapshot.textures, payload.id, payload.name);
    if (!target) {
      const label = payload.id ?? payload.name ?? 'unknown';
      return fail({ code: 'invalid_payload', message: `Texture not found: ${label}` });
    }
    const err = this.editor.deleteTexture({ id: target.id ?? payload.id, name: target.name });
    if (err) return fail(err);
    this.session.removeTextures([target.name]);
    return ok({ id: target.id ?? payload.id ?? target.name, name: target.name });
  }

  readTexture(payload: { id?: string; name?: string }): UsecaseResult<TextureSource> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    if (!payload.id && !payload.name) {
      return fail({ code: 'invalid_payload', message: 'Texture id or name is required' });
    }
    const res = this.editor.readTexture({ id: payload.id, name: payload.name });
    if (res.error) return fail(res.error);
    return ok(res.result!);
  }

  readTextureImage(payload: ReadTexturePayload): UsecaseResult<ReadTextureResult> {
    const { saveToTmp, tmpName, tmpPrefix, ...query } = payload;
    const sourceRes = this.readTexture(query);
    if (!sourceRes.ok) return sourceRes;
    const source = sourceRes.value;
    const dataUri = normalizeTextureDataUri(source.dataUri);
    if (!dataUri) {
      return fail({ code: 'not_implemented', message: 'Texture data unavailable.' });
    }
    const mimeType = parseDataUriMimeType(dataUri) ?? 'image/png';
    const result: ReadTextureResult = {
      texture: {
        id: source.id,
        name: source.name,
        width: source.width,
        height: source.height,
        path: source.path,
        dataUri,
        mimeType
      }
    };
    if (saveToTmp) {
      if (!this.tmpStore) {
        return fail({ code: 'not_implemented', message: 'Tmp store is not available.' });
      }
      const saved = this.tmpStore.saveDataUri(dataUri, {
        nameHint: tmpName ?? source.name,
        prefix: tmpPrefix ?? 'texture'
      });
      if (!saved.ok) return fail(saved.error);
      result.saved = saved.data;
    }
    return ok(result);
  }

  assignTexture(payload: {
    textureId?: string;
    textureName?: string;
    cubeIds?: string[];
    cubeNames?: string[];
    faces?: CubeFaceDirection[];
    ifRevision?: string;
  }): UsecaseResult<{ textureId?: string; textureName: string; cubeCount: number; faces?: CubeFaceDirection[] }> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    if (!payload.textureId && !payload.textureName) {
      return fail({
        code: 'invalid_payload',
        message: 'textureId or textureName is required',
        fix: 'Provide textureId or textureName from list_textures.'
      });
    }
    const snapshot = this.getSnapshot();
    const texture = resolveTextureTarget(snapshot.textures, payload.textureId, payload.textureName);
    if (!texture) {
      const label = payload.textureId ?? payload.textureName ?? 'unknown';
      return fail({ code: 'invalid_payload', message: `Texture not found: ${label}` });
    }
    const cubes = resolveCubeTargets(snapshot.cubes, payload.cubeIds, payload.cubeNames);
    if (cubes.length === 0) {
      return fail({ code: 'invalid_payload', message: 'No target cubes found' });
    }
    const faces = normalizeCubeFaces(payload.faces);
    if (payload.faces && payload.faces.length > 0 && !faces) {
      return fail({
        code: 'invalid_payload',
        message: 'faces must include valid directions (north/south/east/west/up/down)'
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
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    if (!payload.cubeId && !payload.cubeName) {
      return fail({
        code: 'invalid_payload',
        message: 'cubeId or cubeName is required',
        fix: 'Provide cubeId or cubeName from get_project_state.'
      });
    }
    const snapshot = this.getSnapshot();
    const target = resolveCubeTarget(snapshot.cubes, payload.cubeId, payload.cubeName);
    if (!target) {
      const label = payload.cubeId ?? payload.cubeName ?? 'unknown';
      return fail({ code: 'invalid_payload', message: `Cube not found: ${label}` });
    }
    const faceEntries = Object.entries(payload.faces ?? {});
    if (faceEntries.length === 0) {
      return fail({
        code: 'invalid_payload',
        message: 'faces must include at least one face mapping',
        fix: 'Provide a faces map with at least one face (e.g., {"north":[0,0,4,4]}).'
      });
    }
    const faces: CubeFaceDirection[] = [];
    const normalized: FaceUvMap = {};
    for (const [faceKey, uv] of faceEntries) {
      if (!VALID_CUBE_FACES.has(faceKey as CubeFaceDirection)) {
        return fail({
          code: 'invalid_payload',
          message: `Invalid face: ${faceKey}`,
          fix: 'Use north, south, east, west, up, or down.'
        });
      }
      if (!Array.isArray(uv) || uv.length !== 4) {
        return fail({
          code: 'invalid_payload',
          message: `UV for ${faceKey} must be [x1,y1,x2,y2].`
        });
      }
      const [x1, y1, x2, y2] = uv;
      if (![x1, y1, x2, y2].every((value) => typeof value === 'number' && Number.isFinite(value))) {
        return fail({
          code: 'invalid_payload',
          message: `UV for ${faceKey} must contain finite numbers.`
        });
      }
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
    const [x1, y1, x2, y2] = uv;
    if (x1 < 0 || y1 < 0 || x2 < 0 || y2 < 0) {
      return {
        code: 'invalid_payload',
        message: 'Face UV coordinates must be non-negative.',
        details: { uv, textureResolution: resolution }
      };
    }
    if (x1 > resolution.width || x2 > resolution.width || y1 > resolution.height || y2 > resolution.height) {
      return {
        code: 'invalid_payload',
        message: `Face UV is outside texture resolution ${resolution.width}x${resolution.height}.`,
        fix: 'Use get_project_state to read textureResolution and adjust UVs or change the project texture resolution.',
        details: { uv, textureResolution: resolution }
      };
    }
    if (x2 < x1 || y2 < y1) {
      return {
        code: 'invalid_payload',
        message: 'Face UV coordinates must satisfy x2 >= x1 and y2 >= y1.',
        details: { uv }
      };
    }
    return null;
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
}

const hashCanvasImage = (image: CanvasImageSource | undefined): string | null => {
  if (!image) return null;
  const candidate = image as { toDataURL?: (type?: string) => string };
  if (typeof candidate.toDataURL !== 'function') return null;
  return hashText(candidate.toDataURL('image/png'));
};

const parseDataUriMimeType = (dataUri: string): string | null => {
  const match = /^data:([^;]+);base64,/i.exec(String(dataUri ?? ''));
  return match?.[1] ?? null;
};

const normalizeTextureDataUri = (value?: string): string | null => {
  if (!value) return null;
  return value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
};

const resolveTextureSize = (
  primary: { width?: number; height?: number },
  ...fallbacks: Array<{ width?: number; height?: number } | undefined>
): { width?: number; height?: number } => {
  const pick = (value?: number): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
  const candidates = [primary, ...fallbacks].filter(Boolean) as Array<{ width?: number; height?: number }>;
  let width: number | undefined;
  let height: number | undefined;
  candidates.forEach((entry) => {
    if (width === undefined) width = pick(entry.width);
    if (height === undefined) height = pick(entry.height);
  });
  return { width, height };
};

const hashText = (value: string): string => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
};

const VALID_CUBE_FACES: ReadonlySet<CubeFaceDirection> = new Set([
  'north',
  'south',
  'east',
  'west',
  'up',
  'down'
]);

const normalizeCubeFaces = (faces?: CubeFaceDirection[]): CubeFaceDirection[] | null => {
  if (!faces || faces.length === 0) return null;
  const normalized: CubeFaceDirection[] = [];
  for (const face of faces) {
    if (!VALID_CUBE_FACES.has(face)) {
      return null;
    }
    if (!normalized.includes(face)) {
      normalized.push(face);
    }
  }
  return normalized.length > 0 ? normalized : null;
};

const resolveCubeTargets = (cubes: SessionState['cubes'], cubeIds?: string[], cubeNames?: string[]) => {
  const ids = new Set(cubeIds ?? []);
  const names = new Set(cubeNames ?? []);
  if (ids.size === 0 && names.size === 0) {
    return [...cubes];
  }
  return cubes.filter((cube) => (cube.id && ids.has(cube.id)) || names.has(cube.name));
};

const summarizeTextureUsage = (usage: TextureUsageResult): PreflightUsageSummary => {
  let cubeCount = 0;
  let faceCount = 0;
  usage.textures.forEach((entry) => {
    cubeCount += entry.cubeCount;
    faceCount += entry.faceCount;
  });
  return {
    textureCount: usage.textures.length,
    cubeCount,
    faceCount,
    unresolvedCount: usage.unresolved?.length ?? 0
  };
};

const computeUvBounds = (usage: TextureUsageResult): PreflightUvBounds | null => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let faceCount = 0;
  usage.textures.forEach((entry) => {
    entry.cubes.forEach((cube) => {
      cube.faces.forEach((face) => {
        if (!face.uv) return;
        const [x1, y1, x2, y2] = face.uv;
        const localMinX = Math.min(x1, x2);
        const localMinY = Math.min(y1, y2);
        const localMaxX = Math.max(x1, x2);
        const localMaxY = Math.max(y1, y2);
        if (localMinX < minX) minX = localMinX;
        if (localMinY < minY) minY = localMinY;
        if (localMaxX > maxX) maxX = localMaxX;
        if (localMaxY > maxY) maxY = localMaxY;
        faceCount += 1;
      });
    });
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
    faceCount
  };
};

const recommendResolution = (
  bounds: PreflightUvBounds | null,
  current: { width: number; height: number } | undefined,
  maxSize: number
): { width: number; height: number; reason: string } | null => {
  if (!bounds) return null;
  const requiredWidth = Math.max(bounds.maxX, current?.width ?? 0);
  const requiredHeight = Math.max(bounds.maxY, current?.height ?? 0);
  const width = clampResolution(roundUpResolution(requiredWidth), maxSize);
  const height = clampResolution(roundUpResolution(requiredHeight), maxSize);
  if (current && width <= current.width && height <= current.height) return null;
  const reason = current ? 'uv_bounds_exceed_resolution' : 'resolution_missing';
  return { width, height, reason };
};

const roundUpResolution = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 16;
  if (value <= 16) return 16;
  return Math.ceil(value / 32) * 32;
};

const clampResolution = (value: number, maxSize: number): number => {
  if (value <= 0) return 16;
  if (value > maxSize) return maxSize;
  return value;
};
