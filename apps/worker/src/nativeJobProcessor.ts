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
  getProject?: (projectId: string) => Promise<NativeProjectSnapshot | null>;
};

type ProcessNativeJobArgs = {
  workerId: string;
  logger: Logger;
  enabled: boolean;
  backend?: BackendPort;
  store?: NativePipelineWorkerStorePort;
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

const toNonNegativeInteger = (value: unknown, fallback = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const normalized = Math.trunc(value);
  return normalized >= 0 ? normalized : fallback;
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
  project: NativeProjectSnapshot,
  job: Extract<NativeJob, { kind: 'gltf.convert' }>
): Promise<{ bonesApplied: number; cubesApplied: number; finalBoneCount: number; finalCubeCount: number }> => {
  if (!project.hasGeometry) {
    return { bonesApplied: 0, cubesApplied: 0, finalBoneCount: 0, finalCubeCount: 0 };
  }

  const previewProjectName = `${project.projectId}::preview::${job.id}`;
  await callBackendTool(backend, toolContext, 'ensure_project', {
    name: previewProjectName,
    match: 'name',
    onMissing: 'create',
    onMismatch: 'create',
    includeState: false
  });

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
  if (projectSnapshot?.hasGeometry) {
    try {
      const materialized = await materializeProjectGeometry(backend, toolContext, projectSnapshot, job);
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
      await callBackendTool(backend, toolContext, 'ensure_project', {
        name: job.projectId,
        onMissing: 'create',
        onMismatch: 'reuse',
        includeState: false
      });
    }
  } else {
    await callBackendTool(backend, toolContext, 'ensure_project', {
      name: job.projectId,
      onMissing: 'create',
      onMismatch: 'reuse',
      includeState: false
    });
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

  return {
    kind: 'gltf.convert',
    status: 'converted',
    hasGeometry,
    hierarchy,
    processedBy: context.workerId,
    attemptCount: job.attemptCount,
    finishedAt: nowIso(),
    output: {
      exportPath: exportResult.path,
      selectedTarget: exportResult.selectedTarget?.id ?? 'gltf',
      warningCount: exportResult.warnings?.length ?? 0,
      requestedCodecId: requestedCodecId ?? 'gltf',
      selectedFormat: exportFormat
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

export const processOneNativeJob = async ({
  workerId,
  logger,
  enabled,
  backend,
  store: injectedStore,
  processor
}: ProcessNativeJobArgs): Promise<void> => {
  if (!enabled) return;

  const store = injectedStore ?? getNativePipelineStore();
  const job = await store.claimNextJob(workerId);
  if (!job) return;
  const getProjectSnapshot =
    typeof store.getProject === 'function'
      ? async (projectId: string): Promise<NativeProjectSnapshot | null> => store.getProject!(projectId)
      : undefined;

  logger.info('ashfox worker claimed native job', {
    workerId,
    jobId: job.id,
    projectId: job.projectId,
    kind: job.kind
  });

  try {
    const activeProcessor = processor ?? resolveDefaultProcessor(job);
    const result = await activeProcessor(job, {
      backend,
      workerId,
      logger,
      getProjectSnapshot
    });
    await store.completeJob(job.id, result);
    logger.info('ashfox worker completed native job', {
      workerId,
      jobId: job.id,
      projectId: job.projectId,
      kind: result.kind
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await store.failJob(job.id, message);
    } catch (failError) {
      const failMessage = failError instanceof Error ? failError.message : String(failError);
      logger.error('ashfox worker failed to mark native job failure', {
        workerId,
        jobId: job.id,
        projectId: job.projectId,
        message: failMessage
      });
    }
    logger.error('ashfox worker failed native job', {
      workerId,
      jobId: job.id,
      projectId: job.projectId,
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
