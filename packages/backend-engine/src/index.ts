import {
  TOOL_NAMES,
  type Capabilities,
  type CubeFaceDirection,
  type RenderPreviewPayload,
  type RenderPreviewResult,
  type ToolError,
  type ToolName,
  type ToolPayloadMap,
  type ToolResponse,
  type ToolResultMap,
  type TextureUsageEntry,
  type TextureUsageResult
} from '@ashfox/contracts/types/internal';
import {
  backendToolError,
  isMutatingTool,
  type BackendHealth,
  type BackendPort,
  type BackendToolContext,
  type BlobPointer,
  type PersistedProjectRecord,
  type PersistenceHealth,
  type PersistencePorts,
  type ProjectRepositoryScope
} from '@ashfox/backend-core';
import { computeCapabilities } from '../../runtime/src/config';
import { RevisionStore } from '../../runtime/src/domain/revision/revisionStore';
import { resolveAnimationTimePolicy } from '../../runtime/src/domain/animation/timePolicy';
import { buildInternalExport } from '../../runtime/src/domain/exporters';
import type { EditorPort, TextureResolution } from '../../runtime/src/ports/editor';
import type {
  ExportCodecParams,
  ExportGltfParams,
  ExportNativeParams,
  ExportPort,
  NativeCodecTarget
} from '../../runtime/src/ports/exporter';
import type { FormatDescriptor, FormatPort } from '../../runtime/src/ports/formats';
import type { SnapshotPort } from '../../runtime/src/ports/snapshot';
import { PREVIEW_UNSUPPORTED_NO_RENDER } from '../../runtime/src/shared/messages';
import { LocalTmpStore } from '../../runtime/src/adapters/tmp/LocalTmpStore';
import { ProjectSession } from '../../runtime/src/session';
import type { SessionState } from '../../runtime/src/session/types';
import { ToolDispatcherImpl } from '../../runtime/src/dispatcher';
import { buildToolRegistry } from '../../runtime/src/transport/mcp/tools';
import { ToolService } from '../../runtime/src/usecases/ToolService';

const EXPORT_BUCKET = 'exports';
const ENGINE_STATE_VERSION = 1;
const DEFAULT_TEXTURE_RESOLUTION: TextureResolution = { width: 16, height: 16 };
const ALL_CUBE_FACES: CubeFaceDirection[] = ['north', 'south', 'east', 'west', 'up', 'down'];
const ENGINE_TMP_STORE = new LocalTmpStore();

const ENGINE_FORMATS: FormatDescriptor[] = [
  {
    id: 'geckolib_model',
    name: 'GeckoLib',
    animationMode: true,
    boneRig: true,
    armatureRig: true
  }
];

type PendingWrite = {
  path: string;
  contents: string;
};

type EnginePersistedTextureAsset = {
  id?: string;
  name: string;
  dataUri?: string;
  width?: number;
  height?: number;
};

type EnginePersistedStateEnvelope = {
  version: number;
  session: SessionState;
  textureResolution?: TextureResolution | null;
  textureUsage?: TextureUsageResult;
  textureAssets?: EnginePersistedTextureAsset[];
};

type LoadedPersistedState = {
  session: SessionState;
  textureResolution: TextureResolution | null;
  textureUsage: TextureUsageResult;
  textureAssets: EnginePersistedTextureAsset[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const hasProjectData = (snapshot: SessionState): boolean =>
  Boolean(
    snapshot.id ||
      snapshot.formatId ||
      snapshot.name ||
      snapshot.bones.length > 0 ||
      snapshot.cubes.length > 0 ||
      (snapshot.meshes?.length ?? 0) > 0 ||
      snapshot.textures.length > 0 ||
      snapshot.animations.length > 0
  );

const cloneTextureUsage = (usage: TextureUsageResult): TextureUsageResult => ({
  textures: (usage.textures ?? []).map((entry) => ({
    id: entry.id,
    name: entry.name,
    width: entry.width,
    height: entry.height,
    cubeCount: entry.cubeCount,
    faceCount: entry.faceCount,
    cubes: (entry.cubes ?? []).map((cube) => ({
      id: cube.id,
      name: cube.name,
      faces: (cube.faces ?? []).map((face) => ({
        face: face.face,
        ...(face.uv ? { uv: [face.uv[0], face.uv[1], face.uv[2], face.uv[3]] as [number, number, number, number] } : {})
      }))
    }))
  })),
  ...(usage.unresolved && usage.unresolved.length > 0
    ? {
        unresolved: usage.unresolved.map((entry) => ({
          textureRef: entry.textureRef,
          cubeId: entry.cubeId,
          cubeName: entry.cubeName,
          face: entry.face
        }))
      }
    : {})
});

const asTextureResolution = (value: unknown): TextureResolution | null => {
  if (!isRecord(value)) return null;
  const width = Number(value.width);
  const height = Number(value.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return {
    width: Math.trunc(width),
    height: Math.trunc(height)
  };
};

const asSessionState = (value: unknown): SessionState => {
  const empty = new ProjectSession().snapshot();
  if (!isRecord(value)) return empty;
  const candidate = value as Partial<SessionState> & Record<string, unknown>;
  return {
    id: typeof candidate.id === 'string' ? candidate.id : candidate.id === null ? null : empty.id,
    formatId:
      typeof candidate.formatId === 'string'
        ? candidate.formatId
        : candidate.formatId === null
          ? null
          : empty.formatId ?? null,
    name: typeof candidate.name === 'string' ? candidate.name : candidate.name === null ? null : empty.name,
    dirty: typeof candidate.dirty === 'boolean' ? candidate.dirty : undefined,
    uvPixelsPerBlock:
      typeof candidate.uvPixelsPerBlock === 'number' && Number.isFinite(candidate.uvPixelsPerBlock)
        ? candidate.uvPixelsPerBlock
        : undefined,
    bones: Array.isArray(candidate.bones) ? (candidate.bones as SessionState['bones']) : [],
    cubes: Array.isArray(candidate.cubes) ? (candidate.cubes as SessionState['cubes']) : [],
    meshes: Array.isArray(candidate.meshes) ? (candidate.meshes as SessionState['meshes']) : [],
    textures: Array.isArray(candidate.textures) ? (candidate.textures as SessionState['textures']) : [],
    animations: Array.isArray(candidate.animations) ? (candidate.animations as SessionState['animations']) : [],
    animationsStatus: candidate.animationsStatus === 'unavailable' ? 'unavailable' : 'available',
    animationTimePolicy: resolveAnimationTimePolicy(
      isRecord(candidate.animationTimePolicy) ? (candidate.animationTimePolicy as Partial<SessionState['animationTimePolicy']>) : undefined
    )
  };
};

const asTextureAssets = (value: unknown): EnginePersistedTextureAsset[] => {
  if (!Array.isArray(value)) return [];
  const out: EnginePersistedTextureAsset[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const name = typeof entry.name === 'string' ? entry.name : null;
    if (!name) continue;
    out.push({
      ...(typeof entry.id === 'string' ? { id: entry.id } : {}),
      name,
      ...(typeof entry.dataUri === 'string' ? { dataUri: entry.dataUri } : {}),
      ...(typeof entry.width === 'number' && Number.isFinite(entry.width) ? { width: entry.width } : {}),
      ...(typeof entry.height === 'number' && Number.isFinite(entry.height) ? { height: entry.height } : {})
    });
  }
  return out;
};

const asTextureUsage = (value: unknown): TextureUsageResult => {
  if (!isRecord(value)) return { textures: [] };
  const textures = Array.isArray(value.textures) ? (value.textures as TextureUsageEntry[]) : [];
  const unresolved = Array.isArray(value.unresolved)
    ? (value.unresolved as TextureUsageResult['unresolved'])
    : undefined;
  return {
    textures,
    ...(unresolved && unresolved.length > 0 ? { unresolved } : {})
  };
};

const loadPersistedState = (record: PersistedProjectRecord | null): LoadedPersistedState => {
  if (!record) {
    return {
      session: new ProjectSession().snapshot(),
      textureResolution: { ...DEFAULT_TEXTURE_RESOLUTION },
      textureUsage: { textures: [] },
      textureAssets: []
    };
  }
  const state = record.state;
  if (isRecord(state) && isRecord(state.session)) {
    const envelope = state as EnginePersistedStateEnvelope;
    return {
      session: asSessionState(envelope.session),
      textureResolution: asTextureResolution(envelope.textureResolution) ?? { ...DEFAULT_TEXTURE_RESOLUTION },
      textureUsage: asTextureUsage(envelope.textureUsage),
      textureAssets: asTextureAssets(envelope.textureAssets)
    };
  }
  return {
    session: asSessionState(state),
    textureResolution: { ...DEFAULT_TEXTURE_RESOLUTION },
    textureUsage: { textures: [] },
    textureAssets: []
  };
};

const sanitizeBlobPath = (value: string): string =>
  value
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.' && segment !== '..')
    .join('/');

const toExportBlobPointer = (scope: ProjectRepositoryScope, path: string): BlobPointer => ({
  bucket: EXPORT_BUCKET,
  key: `${scope.tenantId}/${scope.projectId}/${sanitizeBlobPath(path) || 'export.json'}`
});

const toDataUri = (image: CanvasImageSource | undefined): string | null => {
  if (!image || typeof image !== 'object') return null;
  const maybeToDataURL = (image as { toDataURL?: () => string | null }).toDataURL;
  if (typeof maybeToDataURL !== 'function') return null;
  const dataUri = maybeToDataURL();
  return typeof dataUri === 'string' && dataUri.length > 0 ? dataUri : null;
};

type ToolAvailabilityMap = NonNullable<Capabilities['toolAvailability']>;
type ToolAvailabilityEntry = NonNullable<ToolAvailabilityMap[ToolName]>;

const buildToolAvailability = (
  overrides: Partial<Record<ToolName, ToolAvailabilityEntry>>
): ToolAvailabilityMap => {
  const availability: ToolAvailabilityMap = {};
  for (const name of TOOL_NAMES) {
    availability[name] = { available: true };
  }
  for (const [name, entry] of Object.entries(overrides) as Array<[ToolName, ToolAvailabilityEntry | undefined]>) {
    if (!entry) continue;
    availability[name] = entry;
  }
  return availability;
};

const buildEngineCapabilities = (formats: FormatPort, nativeCodecs: NativeCodecTarget[]): Capabilities => {
  const activeFormatId = formats.getActiveFormatId();
  const capabilities = computeCapabilities(
    'native',
    formats.listFormats(),
    activeFormatId ? { formatId: activeFormatId } : undefined
  );
  const toolRegistry = buildToolRegistry({ includeLowLevel: true });
  capabilities.toolRegistry = { hash: toolRegistry.hash, count: toolRegistry.count };
  capabilities.exportTargets = [
    {
      kind: 'internal',
      id: 'gecko_geo_anim',
      label: 'Entity Rig Geo+Anim JSON',
      extensions: ['json'],
      available: true
    },
    {
      kind: 'gltf',
      id: 'gltf',
      label: 'glTF (cleanroom codec)',
      extensions: ['gltf', 'glb'],
      available: true
    },
    {
      kind: 'native_codec',
      id: 'native_codec',
      label: 'Native Codec Export',
      available: nativeCodecs.length > 0
    }
  ];
  capabilities.exportTargets.push(
    ...nativeCodecs.map((codec) => ({
      kind: 'native_codec' as const,
      id: codec.id,
      label: codec.label,
      extensions: codec.extensions,
      available: true
    }))
  );
  capabilities.toolAvailability = buildToolAvailability({
    render_preview: {
      available: false,
      reason: 'no_render_profile',
      note: 'render_preview is unavailable in native no-render profile.'
    },
    reload_plugins: {
      available: false,
      reason: 'host_unavailable',
      note: 'reload_plugins requires host plugin APIs.'
    },
    export_trace_log: {
      available: false,
      reason: 'trace_log_unavailable',
      note: 'export_trace_log requires plugin trace log host support.'
    },
    paint_faces: {
      available: false,
      reason: 'texture_renderer_unavailable',
      note: 'paint_faces requires texture renderer host support.'
    }
  });
  return capabilities;
};

class EngineFormatPort implements FormatPort {
  private readonly session: ProjectSession;
  private readonly formats: FormatDescriptor[];

  constructor(session: ProjectSession, formats = ENGINE_FORMATS) {
    this.session = session;
    this.formats = formats;
  }

  listFormats(): FormatDescriptor[] {
    return this.formats.map((format) => ({ ...format }));
  }

  getActiveFormatId(): string | null {
    const snapshot = this.session.snapshot();
    if (snapshot.formatId) return snapshot.formatId;
    return hasProjectData(snapshot) ? this.formats[0]?.id ?? null : null;
  }
}

class EngineSnapshotPort implements SnapshotPort {
  private readonly session: ProjectSession;

  constructor(session: ProjectSession) {
    this.session = session;
  }

  readSnapshot(): SessionState {
    return this.session.snapshot();
  }
}

const stripKnownExt = (destPath: string): string => {
  if (destPath.endsWith('.geo.json')) return destPath.slice(0, -'.geo.json'.length);
  if (destPath.endsWith('.animation.json')) return destPath.slice(0, -'.animation.json'.length);
  if (destPath.endsWith('.json')) return destPath.slice(0, -'.json'.length);
  if (destPath.endsWith('.gltf')) return destPath.slice(0, -'.gltf'.length);
  if (destPath.endsWith('.glb')) return destPath.slice(0, -'.glb'.length);
  return destPath;
};

const resolveArtifactPath = (
  destPath: string,
  path: { mode: 'destination' } | { mode: 'base_suffix'; suffix: string }
): string => {
  if (path.mode === 'destination') return destPath;
  return `${stripKnownExt(destPath)}${path.suffix}`;
};

const normalizeCodecToken = (value: string): string =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

class EngineExportPort implements ExportPort {
  private static readonly CODECS: NativeCodecTarget[] = [
    {
      id: 'gltf',
      label: 'glTF (cleanroom codec)',
      extensions: ['gltf', 'glb']
    }
  ];

  constructor(private readonly session: ProjectSession, private readonly writer: (path: string, contents: string) => ToolError | null) {}

  listNativeCodecs(): NativeCodecTarget[] {
    return EngineExportPort.CODECS.map((codec) => ({ ...codec, extensions: [...codec.extensions] }));
  }

  exportNative(params: ExportNativeParams): ToolError | null {
    const token = normalizeCodecToken(params.formatId);
    const allowed = new Set(['entityrig', 'geckolib', 'geckolibmodel']);
    if (!allowed.has(token)) {
      return {
        code: 'unsupported_format',
        message: `Unsupported native export format: ${params.formatId}`
      };
    }
    return this.writeArtifacts('gecko_geo_anim', params.destPath);
  }

  exportGltf(params: ExportGltfParams): ToolError | null {
    return this.writeArtifacts('gltf', params.destPath);
  }

  exportCodec(params: ExportCodecParams): ToolError | null {
    const token = normalizeCodecToken(params.codecId);
    if (token === 'gltf' || token === 'glb' || token === 'gltfcodec') {
      return this.exportGltf({ destPath: params.destPath });
    }
    return {
      code: 'unsupported_format',
      message: `Unsupported native codec: ${params.codecId}`
    };
  }

  private writeArtifacts(format: 'gecko_geo_anim' | 'gltf', destPath: string): ToolError | null {
    const snapshot = this.session.snapshot();
    const bundle = buildInternalExport(format, snapshot);
    for (const artifact of bundle.artifacts) {
      const filePath = resolveArtifactPath(destPath, artifact.path);
      const serialized = JSON.stringify(artifact.data, null, 2);
      const writeError = this.writer(filePath, serialized);
      if (writeError) return writeError;
    }
    return null;
  }
}

class EngineEditorAdapter implements EditorPort {
  private readonly session: ProjectSession;
  private textureResolution: TextureResolution | null;
  private textureUsage: TextureUsageResult;
  private readonly textureAssets = new Map<string, EnginePersistedTextureAsset>();
  private readonly pendingWrites: PendingWrite[] = [];

  constructor(
    session: ProjectSession,
    options: {
      textureResolution: TextureResolution | null;
      textureUsage: TextureUsageResult;
      textureAssets: EnginePersistedTextureAsset[];
    }
  ) {
    this.session = session;
    this.textureResolution = options.textureResolution;
    this.textureUsage = cloneTextureUsage(options.textureUsage);
    for (const asset of options.textureAssets) {
      this.textureAssets.set(this.assetKey(asset.id, asset.name), { ...asset });
    }
    this.cleanupTextureUsage();
  }

  createProject(_name: string, _formatId: string, _options?: { confirmDiscard?: boolean; dialog?: Record<string, unknown> }): ToolError | null {
    return null;
  }

  closeProject(_options?: { force?: boolean }): ToolError | null {
    const reset = this.session.reset();
    if (!reset.ok) return reset.error;
    this.textureUsage = { textures: [] };
    this.textureAssets.clear();
    return null;
  }

  importTexture(params: Parameters<EditorPort['importTexture']>[0]): ToolError | null {
    const dataUri = toDataUri(params.image);
    const key = this.assetKey(params.id, params.name);
    this.textureAssets.set(key, {
      id: params.id,
      name: params.name,
      dataUri: dataUri ?? undefined,
      width: params.width,
      height: params.height
    });
    return null;
  }

  updateTexture(params: Parameters<EditorPort['updateTexture']>[0]): ToolError | null {
    const dataUri = toDataUri(params.image);
    const target = this.resolveTexture(params.id, params.name);
    const nextId = params.id ?? target?.id;
    const nextName = params.newName ?? target?.name ?? params.name ?? 'texture';
    if (target) {
      this.textureAssets.delete(this.assetKey(target.id, target.name));
    }
    this.textureAssets.set(this.assetKey(nextId, nextName), {
      id: nextId,
      name: nextName,
      dataUri: dataUri ?? undefined,
      width: params.width ?? target?.width,
      height: params.height ?? target?.height
    });
    return null;
  }

  deleteTexture(params: Parameters<EditorPort['deleteTexture']>[0]): ToolError | null {
    const target = this.resolveTexture(params.id, params.name);
    if (target) {
      this.textureAssets.delete(this.assetKey(target.id, target.name));
      this.textureUsage.textures = this.textureUsage.textures.filter(
        (entry) => !this.textureMatches(entry, target.id, target.name)
      );
    }
    return null;
  }

  readTexture(params: Parameters<EditorPort['readTexture']>[0]): ReturnType<EditorPort['readTexture']> {
    const target = this.resolveTexture(params.id, params.name);
    if (!target) {
      return { error: { code: 'invalid_payload', message: 'Texture not found.' } };
    }
    const asset = this.resolveTextureAsset(target.id, target.name);
    if (!asset?.dataUri) {
      return {
        error: {
          code: 'invalid_state',
          message: 'Texture data is unavailable in native backend persistence.'
        }
      };
    }
    return {
      result: {
        id: target.id,
        name: target.name,
        width: target.width ?? asset.width,
        height: target.height ?? asset.height,
        dataUri: asset.dataUri,
        image: { toDataURL: () => asset.dataUri } as CanvasImageSource
      }
    };
  }

  assignTexture(params: Parameters<EditorPort['assignTexture']>[0]): ToolError | null {
    const snapshot = this.session.snapshot();
    const texture = this.resolveTexture(params.textureId, params.textureName);
    if (!texture) {
      return { code: 'invalid_payload', message: 'Texture not found for assignment.' };
    }
    const faces = this.normalizeFaces(params.faces);
    const cubes = this.resolveCubes(snapshot, params.cubeIds, params.cubeNames);
    for (const cube of cubes) {
      for (const face of faces) {
        this.removeFaceAssignments(cube.id, cube.name, face);
      }
    }
    const textureEntry = this.ensureTextureUsageEntry(texture.id, texture.name, texture.width, texture.height);
    for (const cube of cubes) {
      const usageCube = this.ensureUsageCube(textureEntry, cube.id, cube.name);
      for (const face of faces) {
        const existing = usageCube.faces.find((entry) => entry.face === face);
        if (!existing) {
          usageCube.faces.push({ face });
        }
      }
    }
    this.cleanupTextureUsage();
    return null;
  }

  setFaceUv(params: Parameters<EditorPort['setFaceUv']>[0]): ToolError | null {
    const entries = Object.entries(params.faces ?? {}) as Array<[CubeFaceDirection, [number, number, number, number]]>;
    for (const [face, uv] of entries) {
      this.setFaceUvInUsage(params.cubeId, params.cubeName, face, uv);
    }
    this.cleanupTextureUsage();
    return null;
  }

  addBone(_params: Parameters<EditorPort['addBone']>[0]): ToolError | null {
    return null;
  }

  updateBone(_params: Parameters<EditorPort['updateBone']>[0]): ToolError | null {
    return null;
  }

  deleteBone(_params: Parameters<EditorPort['deleteBone']>[0]): ToolError | null {
    return null;
  }

  addCube(_params: Parameters<EditorPort['addCube']>[0]): ToolError | null {
    return null;
  }

  updateCube(_params: Parameters<EditorPort['updateCube']>[0]): ToolError | null {
    return null;
  }

  deleteCube(_params: Parameters<EditorPort['deleteCube']>[0]): ToolError | null {
    return null;
  }

  createAnimation(_params: Parameters<EditorPort['createAnimation']>[0]): ToolError | null {
    return null;
  }

  updateAnimation(_params: Parameters<EditorPort['updateAnimation']>[0]): ToolError | null {
    return null;
  }

  deleteAnimation(_params: Parameters<EditorPort['deleteAnimation']>[0]): ToolError | null {
    return null;
  }

  setKeyframes(_params: Parameters<EditorPort['setKeyframes']>[0]): ToolError | null {
    return null;
  }

  setTriggerKeyframes(_params: Parameters<EditorPort['setTriggerKeyframes']>[0]): ToolError | null {
    return null;
  }

  renderPreview(_params: RenderPreviewPayload): { result?: RenderPreviewResult; error?: ToolError } {
    return {
      error: {
        code: 'invalid_state',
        message: PREVIEW_UNSUPPORTED_NO_RENDER
      }
    };
  }

  writeFile(path: string, contents: string): ToolError | null {
    this.pendingWrites.push({ path, contents });
    return null;
  }

  listTextures(): ReturnType<EditorPort['listTextures']> {
    const snapshot = this.session.snapshot();
    return snapshot.textures.map((texture) => ({
      id: texture.id ?? null,
      name: texture.name,
      width: texture.width ?? this.resolveTextureAsset(texture.id, texture.name)?.width ?? DEFAULT_TEXTURE_RESOLUTION.width,
      height: texture.height ?? this.resolveTextureAsset(texture.id, texture.name)?.height ?? DEFAULT_TEXTURE_RESOLUTION.height,
      ...(texture.path ? { path: texture.path } : {})
    }));
  }

  getProjectTextureResolution(): TextureResolution | null {
    return this.textureResolution ? { ...this.textureResolution } : null;
  }

  setProjectTextureResolution(width: number, height: number, _modifyUv?: boolean): ToolError | null {
    this.textureResolution = { width, height };
    return null;
  }

  setProjectUvPixelsPerBlock(_pixelsPerBlock: number): ToolError | null {
    return null;
  }

  getTextureUsage(params: Parameters<EditorPort['getTextureUsage']>[0]): ReturnType<EditorPort['getTextureUsage']> {
    const usage = cloneTextureUsage(this.textureUsage);
    if (!params.textureId && !params.textureName) {
      return { result: usage };
    }
    return {
      result: {
        textures: usage.textures.filter((entry) => this.textureMatches(entry, params.textureId, params.textureName))
      }
    };
  }

  drainPendingWrites(): PendingWrite[] {
    const writes = this.pendingWrites.splice(0, this.pendingWrites.length);
    return writes;
  }

  exportPersistenceState(): {
    textureResolution: TextureResolution | null;
    textureUsage: TextureUsageResult;
    textureAssets: EnginePersistedTextureAsset[];
  } {
    return {
      textureResolution: this.textureResolution ? { ...this.textureResolution } : null,
      textureUsage: cloneTextureUsage(this.textureUsage),
      textureAssets: Array.from(this.textureAssets.values()).map((asset) => ({ ...asset }))
    };
  }

  private normalizeFaces(faces?: CubeFaceDirection[]): CubeFaceDirection[] {
    if (!faces || faces.length === 0) return [...ALL_CUBE_FACES];
    return Array.from(new Set(faces.filter((face) => ALL_CUBE_FACES.includes(face))));
  }

  private resolveTexture(id?: string, name?: string): SessionState['textures'][number] | null {
    const snapshot = this.session.snapshot();
    return snapshot.textures.find((texture) => this.textureMatches(texture, id, name)) ?? null;
  }

  private resolveCubes(
    snapshot: SessionState,
    cubeIds?: string[],
    cubeNames?: string[]
  ): Array<{ id?: string; name: string }> {
    const idSet = new Set((cubeIds ?? []).filter((value) => typeof value === 'string' && value.length > 0));
    const nameSet = new Set((cubeNames ?? []).filter((value) => typeof value === 'string' && value.length > 0));
    return snapshot.cubes
      .filter((cube) => {
        if (idSet.size === 0 && nameSet.size === 0) return false;
        return (cube.id && idSet.has(cube.id)) || nameSet.has(cube.name);
      })
      .map((cube) => ({ id: cube.id, name: cube.name }));
  }

  private setFaceUvInUsage(
    cubeId: string | undefined,
    cubeName: string | undefined,
    face: CubeFaceDirection,
    uv: [number, number, number, number]
  ) {
    for (const texture of this.textureUsage.textures) {
      const cube = texture.cubes.find((entry) => (cubeId && entry.id === cubeId) || (cubeName && entry.name === cubeName));
      if (!cube) continue;
      const faceEntry = cube.faces.find((entry) => entry.face === face);
      if (!faceEntry) continue;
      faceEntry.uv = [uv[0], uv[1], uv[2], uv[3]];
    }
  }

  private ensureTextureUsageEntry(
    id: string | undefined,
    name: string,
    width?: number,
    height?: number
  ): TextureUsageEntry {
    const existing = this.textureUsage.textures.find((entry) => this.textureMatches(entry, id, name));
    if (existing) {
      if (width !== undefined) existing.width = width;
      if (height !== undefined) existing.height = height;
      return existing;
    }
    const created: TextureUsageEntry = {
      id,
      name,
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      cubeCount: 0,
      faceCount: 0,
      cubes: []
    };
    this.textureUsage.textures.push(created);
    return created;
  }

  private ensureUsageCube(
    entry: TextureUsageEntry,
    cubeId: string | undefined,
    cubeName: string
  ): TextureUsageEntry['cubes'][number] {
    const existing = entry.cubes.find((cube) => (cubeId && cube.id === cubeId) || cube.name === cubeName);
    if (existing) return existing;
    const created: TextureUsageEntry['cubes'][number] = {
      ...(cubeId ? { id: cubeId } : {}),
      name: cubeName,
      faces: []
    };
    entry.cubes.push(created);
    return created;
  }

  private removeFaceAssignments(cubeId: string | undefined, cubeName: string, face: CubeFaceDirection) {
    for (const texture of this.textureUsage.textures) {
      const usageCube = texture.cubes.find((cube) => (cubeId && cube.id === cubeId) || cube.name === cubeName);
      if (!usageCube) continue;
      usageCube.faces = usageCube.faces.filter((entry) => entry.face !== face);
    }
  }

  private cleanupTextureUsage() {
    this.textureUsage.textures = this.textureUsage.textures
      .map((entry) => ({
        ...entry,
        cubes: entry.cubes
          .map((cube) => ({
            ...cube,
            faces: cube.faces
              .filter((face) => ALL_CUBE_FACES.includes(face.face))
              .map((face) => ({
                face: face.face,
                ...(face.uv ? { uv: [face.uv[0], face.uv[1], face.uv[2], face.uv[3]] as [number, number, number, number] } : {})
              }))
          }))
          .filter((cube) => cube.faces.length > 0)
      }))
      .filter((entry) => entry.cubes.length > 0)
      .map((entry) => ({
        ...entry,
        cubeCount: entry.cubes.length,
        faceCount: entry.cubes.reduce((sum, cube) => sum + cube.faces.length, 0)
      }));
  }

  private resolveTextureAsset(id?: string, name?: string): EnginePersistedTextureAsset | null {
    const direct = this.textureAssets.get(this.assetKey(id, name));
    if (direct) return direct;
    if (id) {
      const byId = Array.from(this.textureAssets.values()).find((asset) => asset.id === id);
      if (byId) return byId;
    }
    if (name) {
      const byName = Array.from(this.textureAssets.values()).find((asset) => asset.name === name);
      if (byName) return byName;
    }
    return null;
  }

  private assetKey(id?: string, name?: string): string {
    return `${id ?? ''}:${name ?? ''}`;
  }

  private textureMatches(entry: { id?: string; name?: string }, id?: string, name?: string): boolean {
    if (id && entry.id === id) return true;
    if (name && entry.name === name) return true;
    return false;
  }
}

const toToolErrorResponse = <TName extends ToolName>(error: ToolError): ToolResponse<ToolResultMap[TName]> =>
  ({ ok: false, error }) as ToolResponse<ToolResultMap[TName]>;

const toPersistenceEnvelope = (
  session: SessionState,
  editor: EngineEditorAdapter
): EnginePersistedStateEnvelope => {
  const persistedEditor = editor.exportPersistenceState();
  return {
    version: ENGINE_STATE_VERSION,
    session,
    textureResolution: persistedEditor.textureResolution,
    textureUsage: persistedEditor.textureUsage,
    textureAssets: persistedEditor.textureAssets
  };
};

export interface EngineBackendOptions {
  version?: string;
  details?: Record<string, unknown>;
  persistence?: PersistencePorts;
}

export class EngineBackend implements BackendPort {
  readonly kind = 'engine' as const;
  private readonly version: string;
  private readonly details?: Record<string, unknown>;
  private readonly persistence?: PersistencePorts;
  private readonly revisionStore = new RevisionStore(1);

  constructor(options: EngineBackendOptions = {}) {
    this.version = options.version ?? '0.0.0-dev';
    this.details = options.details;
    this.persistence = options.persistence;
  }

  async getHealth(): Promise<BackendHealth> {
    const persistence: PersistenceHealth | undefined = this.persistence?.health;
    if (!persistence) {
      return {
        kind: this.kind,
        availability: 'offline',
        version: this.version,
        details: {
          reason: 'persistence_missing',
          ...this.details
        }
      };
    }
    const availability: BackendHealth['availability'] =
      !persistence.database.ready
        ? 'offline'
        : persistence.storage.ready
          ? 'ready'
          : 'degraded';
    return {
      kind: this.kind,
      availability,
      version: this.version,
      details: {
        persistence,
        ...this.details
      }
    };
  }

  async handleTool<TName extends ToolName>(
    name: TName,
    payload: ToolPayloadMap[TName],
    context: BackendToolContext
  ): Promise<ToolResponse<ToolResultMap[TName]>> {
    if (!this.persistence) {
      return backendToolError(
        'invalid_state',
        'Engine backend requires persistence ports.',
        'Configure gateway persistence and retry.',
        { backend: this.kind }
      ) as ToolResponse<ToolResultMap[TName]>;
    }

    const scope: ProjectRepositoryScope = {
      tenantId: context.session.tenantId,
      projectId: context.session.projectId
    };

    let record: PersistedProjectRecord | null = null;
    try {
      record = await this.persistence.projectRepository.find(scope);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return backendToolError(
        'io_error',
        `Failed to load project state: ${message}`,
        'Check persistence repository health and retry.',
        { backend: this.kind, scope }
      ) as ToolResponse<ToolResultMap[TName]>;
    }

    const loaded = loadPersistedState(record);
    const session = new ProjectSession();
    if (hasProjectData(loaded.session)) {
      const attach = session.attach(loaded.session);
      if (!attach.ok) {
        return toToolErrorResponse<TName>(attach.error);
      }
    }

    const editor = new EngineEditorAdapter(session, {
      textureResolution: loaded.textureResolution,
      textureUsage: loaded.textureUsage,
      textureAssets: loaded.textureAssets
    });
    const formats = new EngineFormatPort(session);
    const snapshot = new EngineSnapshotPort(session);
    const exporter = new EngineExportPort(session, (path, contents) => editor.writeFile(path, contents));
    const nativeCodecs = typeof exporter.listNativeCodecs === 'function' ? exporter.listNativeCodecs() : [];
    const capabilities = buildEngineCapabilities(formats, nativeCodecs);
    const service = new ToolService({
      session,
      capabilities,
      editor,
      formats,
      snapshot,
      exporter,
      tmpStore: ENGINE_TMP_STORE,
      policies: {
        snapshotPolicy: 'session',
        exportPolicy: 'best_effort',
        autoCreateProjectTexture: false,
        allowRenderPreview: false
      }
    });
    const dispatcher = new ToolDispatcherImpl(session, capabilities, service, {
      includeStateByDefault: false,
      includeDiffByDefault: false
    });

    let response: ToolResponse<ToolResultMap[TName]>;
    try {
      response = await dispatcher.handle(name, payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return backendToolError(
        'unknown',
        `Engine backend execution failed: ${message}`,
        'Inspect engine backend logs and retry.',
        { backend: this.kind, scope, tool: name }
      ) as ToolResponse<ToolResultMap[TName]>;
    }

    const writeError = await this.flushPendingWrites(scope, editor.drainPendingWrites());
    if (writeError) {
      return writeError as ToolResponse<ToolResultMap[TName]>;
    }

    if (!response.ok || !isMutatingTool(name)) {
      return response;
    }

    const persistError = await this.persistState(scope, record, session.snapshot(), editor);
    if (persistError) {
      return persistError as ToolResponse<ToolResultMap[TName]>;
    }

    return response;
  }

  private async flushPendingWrites(
    scope: ProjectRepositoryScope,
    writes: PendingWrite[]
  ): Promise<ToolResponse<never> | null> {
    if (!this.persistence || writes.length === 0) return null;
    try {
      for (const write of writes) {
        const pointer = toExportBlobPointer(scope, write.path);
        await this.persistence.blobStore.put({
          ...pointer,
          bytes: Buffer.from(write.contents, 'utf8'),
          contentType: 'application/json'
        });
      }
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return backendToolError(
        'io_error',
        `Failed to write export artifacts: ${message}`,
        'Check blob storage connectivity and retry export.',
        { backend: this.kind, scope }
      );
    }
  }

  private async persistState(
    scope: ProjectRepositoryScope,
    existing: PersistedProjectRecord | null,
    session: SessionState,
    editor: EngineEditorAdapter
  ): Promise<ToolResponse<never> | null> {
    if (!this.persistence) return null;
    const now = new Date().toISOString();
    try {
      if (!hasProjectData(session)) {
        await this.persistence.projectRepository.remove(scope);
        return null;
      }
      await this.persistence.projectRepository.save({
        scope,
        revision: this.revisionStore.hash(session),
        state: toPersistenceEnvelope(session, editor),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      });
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return backendToolError(
        'io_error',
        `Failed to persist project state: ${message}`,
        'Check persistence repository and retry.',
        { backend: this.kind, scope }
      );
    }
  }
}

export const createEngineBackend = (options?: EngineBackendOptions): BackendPort => new EngineBackend(options);
