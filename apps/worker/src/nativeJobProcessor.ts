import type { BackendPort, BackendToolContext } from '@ashfox/backend-core';
import type { ToolName, ToolPayloadMap, ToolResponse, ToolResultMap } from '@ashfox/contracts/types/internal';
import type { Logger } from '@ashfox/runtime/logging';
import {
  configureNativePipelineStoreFactory,
  getNativePipelineStore,
  type NativeJob,
  type NativePipelineQueueStorePort
} from '@ashfox/native-pipeline';
import type { NativeJobResult, NativeProjectSnapshot, SupportedNativeJobKind } from '@ashfox/native-pipeline/types';
import { createGatewayNativePipelineStore } from '@ashfox/gateway-persistence';
import { buildHierarchyFromProjectState, selectPreviewSeed, toRevision } from './previewGeometry';

export const configureWorkerNativePipelineStore = (env: NodeJS.ProcessEnv): void => {
  configureNativePipelineStoreFactory(() => createGatewayNativePipelineStore(env));
};

const DEFAULT_TENANT_ID = 'default-tenant';

const nowIso = (): string => new Date().toISOString();

type NativePipelineWorkerStorePort = Pick<NativePipelineQueueStorePort, 'claimNextJob' | 'completeJob' | 'failJob'> & {
  claimNextJob: (workerId: string, workspaceId?: string) => Promise<NativeJob | null>;
  completeJob: (jobId: string, result?: NativeJobResult, workspaceId?: string) => Promise<NativeJob | null>;
  failJob: (jobId: string, error: string, workspaceId?: string) => Promise<NativeJob | null>;
  getProject?: (projectId: string, workspaceId?: string) => Promise<NativeProjectSnapshot | null>;
};

type ProcessNativeJobArgs = {
  workerId: string;
  logger: Logger;
  enabled: boolean;
  backend?: BackendPort;
  store?: NativePipelineWorkerStorePort;
  workspaceIdsResolver?: () => Promise<readonly string[]>;
  processor?: NativeJobProcessor;
};

type NativeJobExecutionContext = {
  backend?: BackendPort;
  workerId: string;
  logger: Logger;
  getProjectSnapshot?: (projectId: string) => Promise<NativeProjectSnapshot | null>;
};

type NativeJobProcessor = (job: NativeJob, context: NativeJobExecutionContext) => Promise<NativeJobResult>;

const createToolContext = (projectId: string, workerId: string): BackendToolContext => ({
  session: {
    tenantId: DEFAULT_TENANT_ID,
    projectId,
    actorId: workerId
  }
});

export const GLTF_CONVERT_REQUIRED_TOOLSET = {
  base: ['ensure_project', 'export', 'get_project_state'],
  geometry: ['add_bone', 'add_cube'],
  animation: ['create_animation_clip', 'set_frame_pose'],
  texture: ['paint_faces', 'preflight_texture', 'read_texture']
} as const;

const toRequiredGltfToolList = (
  snapshot: NativeProjectSnapshot | null
): readonly ToolName[] => {
  const tools = new Set<ToolName>(
    GLTF_CONVERT_REQUIRED_TOOLSET.base as readonly ToolName[]
  );
  if (!snapshot?.hasGeometry) {
    return Array.from(tools.values());
  }
  for (const tool of GLTF_CONVERT_REQUIRED_TOOLSET.geometry as readonly ToolName[]) {
    tools.add(tool);
  }
  if (snapshot.animations.length > 0) {
    for (const tool of GLTF_CONVERT_REQUIRED_TOOLSET.animation as readonly ToolName[]) {
      tools.add(tool);
    }
  }
  if (snapshot.textures.length > 0) {
    for (const tool of GLTF_CONVERT_REQUIRED_TOOLSET.texture as readonly ToolName[]) {
      tools.add(tool);
    }
  }
  return Array.from(tools.values());
};

const callBackendTool = async <TName extends ToolName>(
  backend: BackendPort,
  context: BackendToolContext,
  name: TName,
  payload: ToolPayloadMap[TName]
): Promise<ToolResultMap[TName]> => {
  const response = await backend.handleTool(name, payload, context);
  if (response.ok) {
    return response.data;
  }
  throw asToolError(name, response);
};

const asToolError = (toolName: ToolName, response: Extract<ToolResponse<unknown>, { ok: false }>): Error => {
  const code = response.error.code;
  const message = response.error.message;
  return new Error(`${toolName} failed (${code}): ${message}`);
};

const ensureOperationalBackend = async (backend: BackendPort | undefined): Promise<BackendPort> => {
  if (!backend) {
    throw new Error('Engine backend is required for native job execution.');
  }
  const health = await backend.getHealth();
  if (health.availability === 'offline') {
    const reason =
      health.details && typeof health.details.reason === 'string' ? health.details.reason : 'backend_offline';
    throw new Error(`Engine backend unavailable (availability=${health.availability}, reason=${reason}).`);
  }
  return backend;
};

const readCapabilitiesSafely = async (
  backend: BackendPort,
  toolContext: BackendToolContext,
  logger: Logger,
  job: NativeJob
): Promise<ToolResultMap['list_capabilities'] | null> => {
  try {
    return await callBackendTool(backend, toolContext, 'list_capabilities', {});
  } catch (error) {
    logger.debug('ashfox worker capabilities probe skipped', {
      projectId: job.projectId,
      jobId: job.id,
      message: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
};

const ensureRequiredToolAvailability = (
  capabilities: ToolResultMap['list_capabilities'] | null,
  requiredTools: readonly ToolName[],
  projectId: string,
  jobId: string
): void => {
  if (!capabilities?.toolAvailability) {
    return;
  }
  const unavailable = requiredTools.filter((toolName) => capabilities.toolAvailability?.[toolName]?.available === false);
  if (unavailable.length === 0) {
    return;
  }
  throw new Error(
    `native job required MCP tools unavailable (project=${projectId}, job=${jobId}): ${unavailable.join(', ')}`
  );
};

const toNonNegativeInteger = (value: unknown, fallback = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const normalized = Math.trunc(value);
  return normalized >= 0 ? normalized : fallback;
};

const toPositiveInteger = (value: unknown, fallback = 16, min = 1, max = 4096): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const normalized = Math.trunc(value);
  if (normalized < min) return fallback;
  if (normalized > max) return max;
  return normalized;
};

const FALLBACK_TEXTURE_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7oN3sAAAAASUVORK5CYII=';

const TEXTURE_FACE_DIRECTIONS = new Set(['north', 'east', 'south', 'west', 'up', 'down']);

type RuntimeProjectState = ToolResultMap['get_project_state']['project'];

type NativeAnimationSummary = {
  id: string;
  name: string;
  length: number;
  loop: boolean;
};

const summarizeProjectAnimations = (
  projectState: ToolResultMap['get_project_state']['project']
): NativeAnimationSummary[] => {
  const animations = Array.isArray(projectState.animations) ? projectState.animations : [];
  const summaries: NativeAnimationSummary[] = [];
  for (let index = 0; index < animations.length; index += 1) {
    const animation = animations[index];
    const fallbackName = `Animation ${index + 1}`;
    const rawName = typeof animation.name === 'string' ? animation.name.trim() : '';
    const name = rawName.length > 0 ? rawName : fallbackName;
    const rawId = typeof animation.id === 'string' ? animation.id.trim() : '';
    const id = rawId.length > 0 ? rawId : `animation:${index + 1}:${name}`;
    const length = typeof animation.length === 'number' && Number.isFinite(animation.length) ? animation.length : 0;
    const loop = animation.loop === true;
    summaries.push({
      id,
      name,
      length: length >= 0 ? length : 0,
      loop
    });
  }
  return summaries;
};

type TextureProjection = {
  textureSources: NativeProjectSnapshot['textureSources'];
  textures: NativeProjectSnapshot['textures'];
};

const isPowerOfTwo = (value: number): boolean => value > 0 && (value & (value - 1)) === 0;

type PreflightTextureEntry = {
  id?: string;
  name: string;
  width: number;
  height: number;
  faceCount: number;
};

const collectPreflightTextureEntries = (preflight: ToolResultMap['preflight_texture']): PreflightTextureEntry[] => {
  const fallbackWidth = toNonNegativeInteger(preflight.textureResolution?.width);
  const fallbackHeight = toNonNegativeInteger(preflight.textureResolution?.height);
  const textures = preflight.textureUsage?.textures ?? [];
  return textures.map((entry) => ({
    id: entry.id,
    name: entry.name,
    width: toNonNegativeInteger(entry.width, fallbackWidth),
    height: toNonNegativeInteger(entry.height, fallbackHeight),
    faceCount: toNonNegativeInteger(entry.faceCount)
  }));
};

const resolveRequestedTextures = (
  textures: PreflightTextureEntry[],
  requestedTextureIds?: string[]
): { selected: PreflightTextureEntry[]; missing: string[] } => {
  if (!requestedTextureIds || requestedTextureIds.length === 0) {
    return { selected: textures, missing: [] };
  }

  const lookup = new Map<string, PreflightTextureEntry>();
  for (const texture of textures) {
    if (texture.id) {
      lookup.set(texture.id, texture);
    }
    lookup.set(texture.name, texture);
  }

  const selected: PreflightTextureEntry[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();

  for (const token of requestedTextureIds) {
    const matched = lookup.get(token);
    if (!matched) {
      missing.push(token);
      continue;
    }
    const dedupeKey = matched.id ?? `name:${matched.name}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    selected.push(matched);
  }

  return { selected, missing };
};

const materializeProjectGeometry = async (
  backend: BackendPort,
  toolContext: BackendToolContext,
  project: NativeProjectSnapshot
): Promise<{ bonesApplied: number; cubesApplied: number; finalBoneCount: number; finalCubeCount: number }> => {
  if (!project.hasGeometry) {
    return { bonesApplied: 0, cubesApplied: 0, finalBoneCount: 0, finalCubeCount: 0 };
  }

  const fullState = await callBackendTool(backend, toolContext, 'get_project_state', { detail: 'full' });
  let revision = fullState.project.revision;

  const refreshRevision = async (): Promise<string> => {
    const state = await callBackendTool(backend, toolContext, 'get_project_state', { detail: 'summary' });
    return state.project.revision;
  };

  const existingBoneNames = new Set((fullState.project.bones ?? []).map((bone) => bone.name));
  const existingCubeNames = new Set((fullState.project.cubes ?? []).map((cube) => cube.name));
  const seed = selectPreviewSeed(project);
  let bonesApplied = 0;
  let cubesApplied = 0;

  for (const bone of seed.bones) {
    if (existingBoneNames.has(bone.name)) {
      continue;
    }

    const addBoneResult = await callBackendTool(backend, toolContext, 'add_bone', {
      name: bone.name,
      ...(bone.parent ? { parent: bone.parent } : {}),
      ...(bone.pivot ? { pivot: bone.pivot } : {}),
      ifRevision: revision,
      includeState: true
    });

    revision = toRevision(addBoneResult) ?? (await refreshRevision());
    existingBoneNames.add(bone.name);
    bonesApplied += 1;
  }

  for (const cube of seed.cubes) {
    if (existingCubeNames.has(cube.name)) {
      continue;
    }

    const addCubeResult = await callBackendTool(backend, toolContext, 'add_cube', {
      name: cube.name,
      bone: cube.bone,
      from: cube.from,
      to: cube.to,
      ...(cube.uvOffset ? { uvOffset: cube.uvOffset } : {}),
      ...(cube.mirror !== undefined ? { mirror: cube.mirror } : {}),
      ifRevision: revision,
      includeState: true
    });

    revision = toRevision(addCubeResult) ?? (await refreshRevision());
    existingCubeNames.add(cube.name);
    cubesApplied += 1;
  }

  const finalState = await callBackendTool(backend, toolContext, 'get_project_state', { detail: 'summary' });
  return {
    bonesApplied,
    cubesApplied,
    finalBoneCount: toNonNegativeInteger(finalState.project.counts.bones),
    finalCubeCount: toNonNegativeInteger(finalState.project.counts.cubes)
  };
};

const materializeProjectAnimations = async (
  backend: BackendPort,
  toolContext: BackendToolContext,
  project: NativeProjectSnapshot
): Promise<{ clipsApplied: number; finalAnimationCount: number }> => {
  if (project.animations.length === 0) {
    return { clipsApplied: 0, finalAnimationCount: 0 };
  }

  const fullState = await callBackendTool(backend, toolContext, 'get_project_state', { detail: 'full' });
  let revision = fullState.project.revision;

  const refreshRevision = async (): Promise<string> => {
    const state = await callBackendTool(backend, toolContext, 'get_project_state', { detail: 'summary' });
    return state.project.revision;
  };

  const existingAnimationNames = new Set((fullState.project.animations ?? []).map((animation) => animation.name));
  const existingAnimationIds = new Set(
    (fullState.project.animations ?? [])
      .map((animation) => (typeof animation.id === 'string' ? animation.id.trim() : ''))
      .filter((entry) => entry.length > 0)
  );
  const targetBoneName = (fullState.project.bones ?? [])
    .map((bone) => bone.name)
    .find((name): name is string => typeof name === 'string' && name.trim().length > 0);

  let clipsApplied = 0;
  for (let index = 0; index < project.animations.length; index += 1) {
    const animation = project.animations[index];
    const fallbackName = `Animation ${index + 1}`;
    const rawName = typeof animation.name === 'string' ? animation.name.trim() : '';
    const name = rawName.length > 0 ? rawName : fallbackName;
    const rawId = typeof animation.id === 'string' ? animation.id.trim() : '';
    if (existingAnimationNames.has(name) || (rawId.length > 0 && existingAnimationIds.has(rawId))) {
      continue;
    }

    const createAnimationResult = await callBackendTool(backend, toolContext, 'create_animation_clip', {
      ...(rawId.length > 0 && !existingAnimationIds.has(rawId) ? { id: rawId } : {}),
      name,
      length: typeof animation.length === 'number' && Number.isFinite(animation.length) && animation.length > 0 ? animation.length : 1,
      loop: animation.loop === true,
      fps: 20,
      ifRevision: revision,
      includeState: true
    });
    revision = toRevision(createAnimationResult) ?? (await refreshRevision());

    if (targetBoneName) {
      const setPoseResult = await callBackendTool(backend, toolContext, 'set_frame_pose', {
        clip: name,
        ...(typeof createAnimationResult.id === 'string' && createAnimationResult.id.trim().length > 0
          ? { clipId: createAnimationResult.id }
          : {}),
        frame: 0,
        bones: [{ name: targetBoneName, rot: [0, 0, 0] }],
        ifRevision: revision,
        includeState: true
      });
      revision = toRevision(setPoseResult) ?? (await refreshRevision());
    }

    existingAnimationNames.add(name);
    if (rawId.length > 0) {
      existingAnimationIds.add(rawId);
    }
    clipsApplied += 1;
  }

  const finalState = await callBackendTool(backend, toolContext, 'get_project_state', { detail: 'summary' });
  return {
    clipsApplied,
    finalAnimationCount: toNonNegativeInteger(finalState.project.counts.animations)
  };
};

const materializeProjectTextures = async (
  backend: BackendPort,
  toolContext: BackendToolContext,
  project: NativeProjectSnapshot
): Promise<{ texturesApplied: number; finalTextureCount: number }> => {
  if (project.textures.length === 0) {
    return { texturesApplied: 0, finalTextureCount: 0 };
  }

  const fullState = await callBackendTool(backend, toolContext, 'get_project_state', { detail: 'full' });
  let revision = fullState.project.revision;

  const refreshRevision = async (): Promise<string> => {
    const state = await callBackendTool(backend, toolContext, 'get_project_state', { detail: 'summary' });
    return state.project.revision;
  };

  const targetCubeName = (fullState.project.cubes ?? [])
    .map((cube) => cube.name)
    .find((name): name is string => typeof name === 'string' && name.trim().length > 0);
  if (!targetCubeName) {
    const finalState = await callBackendTool(backend, toolContext, 'get_project_state', { detail: 'summary' });
    return {
      texturesApplied: 0,
      finalTextureCount: toNonNegativeInteger(finalState.project.counts.textures)
    };
  }

  const existingTextureNames = new Set((fullState.project.textures ?? []).map((texture) => texture.name));
  const existingTextureIds = new Set(
    (fullState.project.textures ?? [])
      .map((texture) => (typeof texture.id === 'string' ? texture.id.trim() : ''))
      .filter((entry) => entry.length > 0)
  );
  let texturesApplied = 0;

  for (let index = 0; index < project.textures.length; index += 1) {
    const texture = project.textures[index];
    const fallbackName = `Texture ${index + 1}`;
    const rawName = typeof texture.name === 'string' ? texture.name.trim() : '';
    const name = rawName.length > 0 ? rawName : fallbackName;
    const rawId = typeof texture.textureId === 'string' ? texture.textureId.trim() : '';
    if (existingTextureNames.has(name) || (rawId.length > 0 && existingTextureIds.has(rawId))) {
      continue;
    }

    const paintResult = await callBackendTool(backend, toolContext, 'paint_faces', {
      ...(rawId.length > 0 && !existingTextureIds.has(rawId) ? { textureId: rawId } : {}),
      textureName: name,
      target: {
        cubeName: targetCubeName,
        face: 'north'
      },
      width: toPositiveInteger(texture.width, 16),
      height: toPositiveInteger(texture.height, 16),
      op: {
        op: 'set_pixel',
        x: 0,
        y: 0,
        color: '#ffffff'
      },
      ifRevision: revision,
      includeState: true
    });
    revision = toRevision(paintResult) ?? (await refreshRevision());

    existingTextureNames.add(name);
    if (rawId.length > 0) {
      existingTextureIds.add(rawId);
    }
    texturesApplied += 1;
  }

  const finalState = await callBackendTool(backend, toolContext, 'get_project_state', { detail: 'summary' });
  return {
    texturesApplied,
    finalTextureCount: toNonNegativeInteger(finalState.project.counts.textures)
  };
};

const normalizeTextureUsageLookupKey = (value: string): string => value.trim().toLowerCase();

const createUvEdgesFromFaces = (
  faces: NativeProjectSnapshot['textures'][number]['faces']
): NativeProjectSnapshot['textures'][number]['uvEdges'] => {
  const edgeMap = new Map<string, NativeProjectSnapshot['textures'][number]['uvEdges'][number]>();

  const registerEdge = (x1: number, y1: number, x2: number, y2: number) => {
    if (![x1, y1, x2, y2].every((entry) => Number.isFinite(entry))) {
      return;
    }
    const normalized = x1 < x2 || (x1 === x2 && y1 <= y2) ? [x1, y1, x2, y2] : [x2, y2, x1, y1];
    const key = normalized.join(':');
    if (edgeMap.has(key)) {
      return;
    }
    edgeMap.set(key, {
      x1: normalized[0],
      y1: normalized[1],
      x2: normalized[2],
      y2: normalized[3]
    });
  };

  for (const face of faces) {
    registerEdge(face.uMin, face.vMin, face.uMax, face.vMin);
    registerEdge(face.uMax, face.vMin, face.uMax, face.vMax);
    registerEdge(face.uMax, face.vMax, face.uMin, face.vMax);
    registerEdge(face.uMin, face.vMax, face.uMin, face.vMin);
  }

  return Array.from(edgeMap.values());
};

const collectTextureProjection = async (
  backend: BackendPort,
  toolContext: BackendToolContext,
  projectState: RuntimeProjectState,
  logger: Logger,
  meta: { projectId: string; jobId: string }
): Promise<TextureProjection> => {
  const runtimeTextureEntries = Array.isArray(projectState.textures) ? projectState.textures : [];
  const runtimeTextureCount = toNonNegativeInteger(projectState.counts.textures);
  if (runtimeTextureEntries.length === 0 && runtimeTextureCount === 0) {
    return { textureSources: [], textures: [] };
  }

  let preflight: ToolResultMap['preflight_texture'] | null = null;
  try {
    preflight = await callBackendTool(backend, toolContext, 'preflight_texture', { includeUsage: true });
  } catch (error) {
    logger.warn('ashfox worker texture projection preflight failed', {
      ...meta,
      message: error instanceof Error ? error.message : String(error)
    });
  }

  const usageById = new Map<string, NonNullable<ToolResultMap['preflight_texture']['textureUsage']>['textures'][number]>();
  const usageByName = new Map<string, NonNullable<ToolResultMap['preflight_texture']['textureUsage']>['textures'][number]>();
  const usageEntries = preflight?.textureUsage?.textures ?? [];
  for (const entry of usageEntries) {
    if (typeof entry.id === 'string' && entry.id.trim().length > 0) {
      usageById.set(normalizeTextureUsageLookupKey(entry.id), entry);
    }
    if (typeof entry.name === 'string' && entry.name.trim().length > 0) {
      usageByName.set(normalizeTextureUsageLookupKey(entry.name), entry);
    }
  }

  const candidateTextures = runtimeTextureEntries.map((entry) => ({
    id: typeof entry.id === 'string' && entry.id.trim().length > 0 ? entry.id.trim() : undefined,
    name: typeof entry.name === 'string' ? entry.name.trim() : '',
    width: toPositiveInteger(entry.width, toPositiveInteger(preflight?.textureResolution?.width, 16)),
    height: toPositiveInteger(entry.height, toPositiveInteger(preflight?.textureResolution?.height, 16))
  }));
  if (candidateTextures.length === 0) {
    for (const entry of usageEntries) {
      candidateTextures.push({
        id: typeof entry.id === 'string' && entry.id.trim().length > 0 ? entry.id.trim() : undefined,
        name: entry.name.trim(),
        width: toPositiveInteger(entry.width, toPositiveInteger(preflight?.textureResolution?.width, 16)),
        height: toPositiveInteger(entry.height, toPositiveInteger(preflight?.textureResolution?.height, 16))
      });
    }
  }

  const textureSourcesMap = new Map<string, NativeProjectSnapshot['textureSources'][number]>();
  const textures: NativeProjectSnapshot['textures'] = [];

  for (const candidate of candidateTextures) {
    if (candidate.name.length === 0) {
      continue;
    }

    const usageEntry =
      (candidate.id ? usageById.get(normalizeTextureUsageLookupKey(candidate.id)) : undefined) ??
      usageByName.get(normalizeTextureUsageLookupKey(candidate.name));
    const textureId = candidate.id ?? (typeof usageEntry?.id === 'string' && usageEntry.id.trim().length > 0 ? usageEntry.id : null) ??
      `texture:${candidate.name}`;
    const width = candidate.width;
    const height = candidate.height;

    let imageDataUrl = '';
    try {
      const readTexture = await callBackendTool(backend, toolContext, 'read_texture', candidate.id ? { id: candidate.id } : { name: candidate.name });
      imageDataUrl =
        typeof readTexture.texture?.dataUri === 'string' && readTexture.texture.dataUri.trim().length > 0
          ? readTexture.texture.dataUri
          : '';
    } catch (error) {
      logger.warn('ashfox worker texture projection read failed', {
        ...meta,
        textureId,
        textureName: candidate.name,
        message: error instanceof Error ? error.message : String(error)
      });
    }
    if (!imageDataUrl) {
      imageDataUrl = FALLBACK_TEXTURE_DATA_URI;
    }

    const faces: NativeProjectSnapshot['textures'][number]['faces'] = [];
    for (const cube of usageEntry?.cubes ?? []) {
      const cubeName = typeof cube.name === 'string' ? cube.name.trim() : '';
      if (cubeName.length === 0) {
        continue;
      }
      const cubeId = typeof cube.id === 'string' && cube.id.trim().length > 0 ? cube.id.trim() : `cube:${cubeName}`;
      for (const face of cube.faces ?? []) {
        if (!TEXTURE_FACE_DIRECTIONS.has(face.face)) {
          continue;
        }
        if (!Array.isArray(face.uv) || face.uv.length !== 4) {
          continue;
        }
        const [u1, v1, u2, v2] = face.uv;
        if (![u1, v1, u2, v2].every((entry) => typeof entry === 'number' && Number.isFinite(entry))) {
          continue;
        }
        const direction = face.face as NativeProjectSnapshot['textureSources'][number]['direction'];
        const faceId = `${textureId}:${cubeId}:${direction}`;
        faces.push({
          faceId,
          cubeId,
          cubeName,
          direction,
          rotationQuarter: 0,
          uMin: Math.min(u1, u2),
          vMin: Math.min(v1, v2),
          uMax: Math.max(u1, u2),
          vMax: Math.max(v1, v2)
        });
        if (!textureSourcesMap.has(faceId)) {
          textureSourcesMap.set(faceId, {
            faceId,
            cubeId,
            cubeName,
            direction,
            colorHex: '#ffffff',
            rotationQuarter: 0
          });
        }
      }
    }

    textures.push({
      textureId,
      name: candidate.name,
      width,
      height,
      faceCount: toNonNegativeInteger(usageEntry?.faceCount, faces.length),
      imageDataUrl,
      faces,
      uvEdges: createUvEdgesFromFaces(faces)
    });
  }

  return {
    textureSources: Array.from(textureSourcesMap.values()),
    textures
  };
};

const handleGltfConvertJob: NativeJobProcessor = async (job, context) => {
  if (job.kind !== 'gltf.convert') {
    throw new Error(`Unsupported native job kind: ${job.kind}`);
  }

  const backend = await ensureOperationalBackend(context.backend);
  const toolContext = createToolContext(job.projectId, context.workerId);
  const requestedCodecId = job.payload?.codecId?.trim();
  const useNativeCodecPath = Boolean(requestedCodecId && requestedCodecId !== 'gltf');
  const exportFormat = useNativeCodecPath ? 'native_codec' : 'gltf';
  const projectSnapshot = context.getProjectSnapshot ? await context.getProjectSnapshot(job.projectId) : null;
  const requiredGltfTools = toRequiredGltfToolList(projectSnapshot);
  const capabilities = await readCapabilitiesSafely(backend, toolContext, context.logger, job);
  ensureRequiredToolAvailability(capabilities, requiredGltfTools, job.projectId, job.id);
  await callBackendTool(backend, toolContext, 'ensure_project', {
    name: job.projectId,
    onMissing: 'create',
    onMismatch: 'reuse',
    includeState: false
  });

  if (projectSnapshot?.hasGeometry) {
    const snapshotHasAnimations = projectSnapshot.animations.length > 0;
    const snapshotHasTextures = projectSnapshot.textures.length > 0;
    let shouldMaterializeGeometry = true;
    let shouldMaterializeAnimations = snapshotHasAnimations;
    let shouldMaterializeTextures = snapshotHasTextures;
    try {
      const initialState = await callBackendTool(backend, toolContext, 'get_project_state', { detail: 'full' });
      const runtimeHasGeometry =
        toNonNegativeInteger(initialState.project.counts.bones) > 0 ||
        toNonNegativeInteger(initialState.project.counts.cubes) > 0;
      const runtimeAnimationSummaries = summarizeProjectAnimations(initialState.project);
      const runtimeHasAnimations =
        runtimeAnimationSummaries.length > 0 || toNonNegativeInteger(initialState.project.counts.animations) > 0;
      const runtimeHasTextures =
        (Array.isArray(initialState.project.textures) && initialState.project.textures.length > 0) ||
        toNonNegativeInteger(initialState.project.counts.textures) > 0;

      shouldMaterializeGeometry = !runtimeHasGeometry;
      shouldMaterializeAnimations = snapshotHasAnimations && !runtimeHasAnimations;
      shouldMaterializeTextures = snapshotHasTextures && !runtimeHasTextures;

      if (!shouldMaterializeGeometry && !shouldMaterializeAnimations && !shouldMaterializeTextures) {
        context.logger.debug('ashfox worker project materialization skipped', {
          projectId: job.projectId,
          jobId: job.id,
          runtimeHasGeometry,
          runtimeAnimationCount: runtimeAnimationSummaries.length,
          runtimeHasTextures
        });
      }
    } catch (error) {
      context.logger.warn('ashfox worker project state inspection before materialization failed', {
        projectId: job.projectId,
        jobId: job.id,
        message: error instanceof Error ? error.message : String(error)
      });
      shouldMaterializeGeometry = true;
      shouldMaterializeAnimations = snapshotHasAnimations;
      shouldMaterializeTextures = snapshotHasTextures;
    }

    if (shouldMaterializeGeometry) {
      try {
        const materialized = await materializeProjectGeometry(backend, toolContext, projectSnapshot);
        context.logger.info('ashfox worker project geometry materialized', {
          projectId: job.projectId,
          jobId: job.id,
          seedBones: projectSnapshot.stats.bones,
          seedCubes: projectSnapshot.stats.cubes,
          ...materialized
        });
      } catch (error) {
        context.logger.warn('ashfox worker project geometry materialization failed', {
          projectId: job.projectId,
          jobId: job.id,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (shouldMaterializeAnimations) {
      try {
        const materialized = await materializeProjectAnimations(backend, toolContext, projectSnapshot);
        context.logger.info('ashfox worker project animations materialized', {
          projectId: job.projectId,
          jobId: job.id,
          seedAnimations: projectSnapshot.animations.length,
          ...materialized
        });
      } catch (error) {
        context.logger.warn('ashfox worker project animation materialization failed', {
          projectId: job.projectId,
          jobId: job.id,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (shouldMaterializeTextures) {
      try {
        const materialized = await materializeProjectTextures(backend, toolContext, projectSnapshot);
        context.logger.info('ashfox worker project textures materialized', {
          projectId: job.projectId,
          jobId: job.id,
          seedTextures: projectSnapshot.textures.length,
          ...materialized
        });
      } catch (error) {
        context.logger.warn('ashfox worker project texture materialization failed', {
          projectId: job.projectId,
          jobId: job.id,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  const exportResult = await callBackendTool(backend, toolContext, 'export', {
    format: exportFormat,
    ...(useNativeCodecPath && requestedCodecId ? { codecId: requestedCodecId } : {}),
    destPath: `native-jobs/${job.projectId}/${job.id}.gltf`,
    options: {
      fallback: job.payload?.optimize ? 'strict' : 'best_effort',
      includeDiagnostics: true
    },
    includeState: false
  });

  const currentState = await callBackendTool(backend, toolContext, 'get_project_state', { detail: 'full' });
  const hierarchy = buildHierarchyFromProjectState(currentState.project);
  const hasGeometry =
    toNonNegativeInteger(currentState.project.counts.bones) > 0 || toNonNegativeInteger(currentState.project.counts.cubes) > 0;
  const animations = summarizeProjectAnimations(currentState.project);
  const textureProjection = await collectTextureProjection(backend, toolContext, currentState.project, context.logger, {
    projectId: job.projectId,
    jobId: job.id
  });
  const projectRevision =
    typeof projectSnapshot?.revision === 'number' && Number.isInteger(projectSnapshot.revision)
      ? projectSnapshot.revision + 1
      : undefined;

  return {
    kind: 'gltf.convert',
    status: 'converted',
    hasGeometry,
    hierarchy,
    animations,
    textureSources: textureProjection.textureSources,
    textures: textureProjection.textures,
    processedBy: context.workerId,
    attemptCount: job.attemptCount,
    finishedAt: nowIso(),
    output: {
      exportPath: exportResult.path,
      selectedTarget: exportResult.selectedTarget?.id ?? 'gltf',
      warningCount: exportResult.warnings?.length ?? 0,
      requestedCodecId: requestedCodecId ?? 'gltf',
      selectedFormat: exportFormat,
      ...(typeof projectRevision === 'number' && Number.isInteger(projectRevision) && projectRevision >= 0
        ? { projectRevision }
        : {})
    }
  };
};

const handleTexturePreflightJob: NativeJobProcessor = async (job, context) => {
  if (job.kind !== 'texture.preflight') {
    throw new Error(`Unsupported native job kind: ${job.kind}`);
  }

  const backend = await ensureOperationalBackend(context.backend);
  const toolContext = createToolContext(job.projectId, context.workerId);

  await callBackendTool(backend, toolContext, 'ensure_project', {
    name: job.projectId,
    onMissing: 'create',
    onMismatch: 'reuse',
    includeState: false
  });

  const preflight = await callBackendTool(backend, toolContext, 'preflight_texture', {
    includeUsage: true
  });

  const textures = collectPreflightTextureEntries(preflight);
  const { selected, missing } = resolveRequestedTextures(textures, job.payload?.textureIds);
  const maxDimension = job.payload?.maxDimension;
  const allowNonPowerOfTwo = job.payload?.allowNonPowerOfTwo === true;

  const oversized =
    typeof maxDimension === 'number'
      ? selected.filter((entry) => entry.width > maxDimension || entry.height > maxDimension).length
      : 0;
  const nonPowerOfTwo = selected.filter(
    (entry) => entry.width > 0 && entry.height > 0 && (!isPowerOfTwo(entry.width) || !isPowerOfTwo(entry.height))
  ).length;
  const unresolvedCount = toNonNegativeInteger(preflight.usageSummary.unresolvedCount);
  const checked = selected.length;
  const faceCount = selected.reduce((sum, entry) => sum + entry.faceCount, 0);

  const diagnostics = [
    ...(preflight.warnings ?? []),
    ...(missing.length > 0 ? [`missing texture id(s): ${missing.join(', ')}`] : []),
    ...(unresolvedCount > 0 ? [`${unresolvedCount} unresolved texture reference(s)`] : []),
    ...(oversized > 0 && typeof maxDimension === 'number'
      ? [`${oversized} texture(s) exceed maxDimension=${maxDimension}`]
      : []),
    ...(nonPowerOfTwo > 0 && !allowNonPowerOfTwo
      ? [`${nonPowerOfTwo} texture(s) use non-power-of-two dimensions`]
      : [])
  ];
  const failed =
    missing.length > 0 || unresolvedCount > 0 || oversized > 0 || (!allowNonPowerOfTwo && nonPowerOfTwo > 0);

  return {
    kind: 'texture.preflight',
    status: failed ? 'failed' : 'passed',
    processedBy: context.workerId,
    attemptCount: job.attemptCount,
    finishedAt: nowIso(),
    summary: {
      checked,
      oversized,
      nonPowerOfTwo
    },
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    output: {
      textureCount: toNonNegativeInteger(preflight.usageSummary.textureCount),
      checkedTextureCount: checked,
      cubeCount: toNonNegativeInteger(preflight.usageSummary.cubeCount),
      faceCount,
      unresolvedCount,
      oversizedCount: oversized,
      nonPowerOfTwoCount: nonPowerOfTwo
    }
  };
};

const defaultProcessors: Record<SupportedNativeJobKind, NativeJobProcessor> = {
  'gltf.convert': handleGltfConvertJob,
  'texture.preflight': handleTexturePreflightJob
};

const normalizeWorkspaceIds = (workspaceIds: readonly string[]): string[] => {
  const deduped = new Set<string>();
  for (const workspaceId of workspaceIds) {
    if (typeof workspaceId !== 'string') {
      continue;
    }
    const normalized = workspaceId.trim();
    if (normalized.length === 0) {
      continue;
    }
    deduped.add(normalized);
  }
  return Array.from(deduped.values());
};

export const processOneNativeJob = async ({
  workerId,
  logger,
  enabled,
  backend,
  store: injectedStore,
  workspaceIdsResolver,
  processor
}: ProcessNativeJobArgs): Promise<void> => {
  if (!enabled) return;

  const store = injectedStore ?? getNativePipelineStore();
  const resolvedWorkspaceIds =
    typeof workspaceIdsResolver === 'function' ? normalizeWorkspaceIds(await workspaceIdsResolver()) : [];
  if (typeof workspaceIdsResolver === 'function' && resolvedWorkspaceIds.length === 0) {
    return;
  }
  const claimWorkspaceCandidates: Array<string | undefined> =
    resolvedWorkspaceIds.length > 0 ? resolvedWorkspaceIds : [undefined];
  let claimedWorkspaceId: string | undefined;
  let job: NativeJob | null = null;
  for (const workspaceId of claimWorkspaceCandidates) {
    const claimed = await store.claimNextJob(workerId, workspaceId);
    if (!claimed) {
      continue;
    }
    claimedWorkspaceId = workspaceId;
    job = claimed;
    break;
  }
  if (!job) return;
  const getProjectSnapshot =
    typeof store.getProject === 'function'
      ? async (projectId: string): Promise<NativeProjectSnapshot | null> => store.getProject!(projectId, claimedWorkspaceId)
      : undefined;

  logger.info('ashfox worker claimed native job', {
    workerId,
    jobId: job.id,
    projectId: job.projectId,
    kind: job.kind,
    ...(claimedWorkspaceId ? { workspaceId: claimedWorkspaceId } : {})
  });

  try {
    const activeProcessor = processor ?? resolveDefaultProcessor(job);
    const result = await activeProcessor(job, {
      backend,
      workerId,
      logger,
      getProjectSnapshot
    });
    await store.completeJob(job.id, result, claimedWorkspaceId);
    logger.info('ashfox worker completed native job', {
      workerId,
      jobId: job.id,
      projectId: job.projectId,
      kind: result.kind,
      ...(claimedWorkspaceId ? { workspaceId: claimedWorkspaceId } : {})
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await store.failJob(job.id, message, claimedWorkspaceId);
    } catch (failError) {
      const failMessage = failError instanceof Error ? failError.message : String(failError);
      logger.error('ashfox worker failed to mark native job failure', {
        workerId,
        jobId: job.id,
        projectId: job.projectId,
        ...(claimedWorkspaceId ? { workspaceId: claimedWorkspaceId } : {}),
        message: failMessage
      });
    }
    logger.error('ashfox worker failed native job', {
      workerId,
      jobId: job.id,
      projectId: job.projectId,
      ...(claimedWorkspaceId ? { workspaceId: claimedWorkspaceId } : {}),
      message
    });
  }
};

const resolveDefaultProcessor = (job: NativeJob): NativeJobProcessor => {
  const candidates = defaultProcessors as Record<string, NativeJobProcessor>;
  const processor = candidates[job.kind];
  if (!processor) {
    throw new Error(`Unsupported native job kind: ${job.kind}`);
  }
  return processor;
};
