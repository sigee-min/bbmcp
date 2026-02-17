import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createEngineBackend } from '@ashfox/backend-engine';
import {
  BackendRegistry,
  type BlobPointer,
  type BlobReadResult,
  type BlobStore,
  type BlobWriteInput,
  type PersistedProjectRecord,
  type PersistencePorts,
  type ProjectRepository,
  type ProjectRepositoryScope
} from '@ashfox/backend-core';
import type { NativeJobResult } from '@ashfox/native-pipeline/types';
import type { ToolName, ToolPayloadMap, ToolResponse, ToolResultMap } from '@ashfox/contracts/types/internal';
import type { Logger } from '@ashfox/runtime/logging';
import { processOneNativeJob } from '../../worker/src/nativeJobProcessor';
import { GatewayDispatcher } from '../src/dispatcher';
import { registerAsync } from './helpers';

type SessionState = {
  textures?: Array<{ id?: string; name: string; width?: number; height?: number }>;
} & Record<string, unknown>;

const EXPORT_BUCKET = 'exports';
const DEFAULT_TENANT = 'default-tenant';
const PNG_1X1_TRANSPARENT =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5+r5kAAAAASUVORK5CYII=';

const createNoopLogger = (): Logger => ({
  log: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

class InMemoryProjectRepository implements ProjectRepository {
  private readonly records = new Map<string, PersistedProjectRecord>();

  async find(scope: ProjectRepositoryScope): Promise<PersistedProjectRecord | null> {
    return this.records.get(this.toKey(scope)) ?? null;
  }

  async save(record: PersistedProjectRecord): Promise<void> {
    this.records.set(this.toKey(record.scope), {
      ...record,
      scope: { ...record.scope }
    });
  }

  async remove(scope: ProjectRepositoryScope): Promise<void> {
    this.records.delete(this.toKey(scope));
  }

  private toKey(scope: ProjectRepositoryScope): string {
    return `${scope.tenantId}:${scope.projectId}`;
  }
}

class InMemoryBlobStore implements BlobStore {
  private readonly blobs = new Map<string, BlobReadResult>();

  async put(input: BlobWriteInput): Promise<BlobPointer> {
    const result: BlobReadResult = {
      bucket: input.bucket,
      key: input.key,
      bytes: new Uint8Array(input.bytes),
      contentType: input.contentType,
      ...(input.cacheControl ? { cacheControl: input.cacheControl } : {}),
      ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
      updatedAt: new Date().toISOString()
    };
    this.blobs.set(this.toKey(result), result);
    return { bucket: input.bucket, key: input.key };
  }

  async get(pointer: BlobPointer): Promise<BlobReadResult | null> {
    const found = this.blobs.get(this.toKey(pointer));
    if (!found) return null;
    return {
      ...found,
      bytes: new Uint8Array(found.bytes),
      ...(found.metadata ? { metadata: { ...found.metadata } } : {})
    };
  }

  async delete(pointer: BlobPointer): Promise<void> {
    this.blobs.delete(this.toKey(pointer));
  }

  async readUtf8(pointer: BlobPointer): Promise<string | null> {
    const found = await this.get(pointer);
    if (!found) return null;
    return Buffer.from(found.bytes).toString('utf8');
  }

  private toKey(pointer: BlobPointer): string {
    return `${pointer.bucket}:${pointer.key}`;
  }
}

const createInMemoryPersistence = (): PersistencePorts & {
  projectRepository: InMemoryProjectRepository;
  blobStore: InMemoryBlobStore;
} => {
  const projectRepository = new InMemoryProjectRepository();
  const blobStore = new InMemoryBlobStore();
  return {
    projectRepository,
    blobStore,
    health: {
      selection: {
        preset: 'local',
        databaseProvider: 'sqlite',
        storageProvider: 'db'
      },
      database: {
        provider: 'memory_repository',
        ready: true
      },
      storage: {
        provider: 'memory_blob_store',
        ready: true
      }
    }
  };
};

const buildDispatcher = (persistence: PersistencePorts): GatewayDispatcher => {
  const registry = new BackendRegistry();
  registry.register(
    createEngineBackend({
      version: 'test-native',
      details: { mode: 'native-e2e-test' },
      persistence
    })
  );
  return new GatewayDispatcher({
    registry,
    defaultBackend: 'engine'
  });
};

const callTool = async <TName extends ToolName>(
  dispatcher: GatewayDispatcher,
  name: TName,
  payload: ToolPayloadMap[TName] & { projectId?: string }
): Promise<ToolResponse<ToolResultMap[TName]>> => dispatcher.handle(name, payload);

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const oracleFixturesRoot = path.join(repoRoot, 'packages', 'runtime', 'tests', 'oracle', 'fixtures');

const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;

const extractSessionState = (state: unknown): SessionState => {
  if (isRecord(state) && isRecord(state.session)) {
    return state.session as SessionState;
  }
  return state as SessionState;
};

const injectTextureIntoRecord = (
  state: unknown,
  texture: { id?: string; name: string; width?: number; height?: number }
): unknown => {
  const session = extractSessionState(state);
  const nextSession: SessionState = {
    ...session,
    textures: [...(session.textures ?? []), texture]
  };
  if (isRecord(state) && isRecord(state.session)) {
    return {
      ...state,
      session: nextSession
    };
  }
  return nextSession;
};

const injectTextureAssetIntoRecord = (
  state: unknown,
  asset: { id?: string; name: string; dataUri?: string; width?: number; height?: number }
): unknown => {
  if (isRecord(state) && isRecord(state.session)) {
    const rawAssets = (state as { textureAssets?: unknown }).textureAssets;
    const textureAssets = Array.isArray(rawAssets) ? [...rawAssets] : [];
    return {
      ...state,
      textureAssets: [...textureAssets, asset]
    };
  }
  return state;
};

const toExportPointer = (projectId: string, filePath: string): BlobPointer => ({
  bucket: EXPORT_BUCKET,
  key: `${DEFAULT_TENANT}/${projectId}/${filePath}`
});

const sanitizeGltfUris = (value: unknown): unknown => {
  const cloned = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  if (!isRecord(cloned)) return cloned;
  if (Array.isArray(cloned.buffers)) {
    for (const buffer of cloned.buffers) {
      if (isRecord(buffer) && 'uri' in buffer) {
        buffer.uri = '__IGNORED_DATA_URI__';
      }
    }
  }
  if (Array.isArray(cloned.images)) {
    for (const image of cloned.images) {
      if (isRecord(image) && 'uri' in image) {
        image.uri = '__IGNORED_DATA_URI__';
      }
    }
  }
  return cloned;
};

const decodeDataUriBytes = (uri: string): Uint8Array => {
  const match = /^data:([^;]+);base64,(.*)$/i.exec(uri);
  assert.ok(match, `invalid data URI: ${uri.slice(0, 48)}`);
  return Buffer.from(match![2], 'base64');
};

const sha256Bytes = (bytes: Uint8Array): string =>
  createHash('sha256')
    .update(bytes)
    .digest('hex');

registerAsync(
  (async () => {
    const persistence = createInMemoryPersistence();
    const dispatcher = buildDispatcher(persistence);
    const engine = createEngineBackend({ persistence, version: 'test-native' });

    // TKT-20260214-001: native backend routing skeleton -> tool execution + persistence
    const health = await engine.getHealth();
    assert.equal(health.availability, 'ready');
    const reason = isRecord(health.details) ? health.details.reason : undefined;
    assert.notEqual(reason, 'engine_scaffold_only');

    const ensure001 = await callTool(dispatcher, 'ensure_project', {
      projectId: 'tkt-001',
      name: 'native-001',
      onMissing: 'create'
    } as ToolPayloadMap['ensure_project'] & { projectId: string });
    assert.equal(ensure001.ok, true);
    if (!ensure001.ok) return;
    assert.equal(ensure001.data.action, 'created');

    const state001 = await callTool(dispatcher, 'get_project_state', {
      projectId: 'tkt-001',
      detail: 'summary'
    } as ToolPayloadMap['get_project_state'] & { projectId: string });
    assert.equal(state001.ok, true);
    if (!state001.ok) return;
    assert.equal(state001.data.project.active, true);
    assert.equal(state001.data.project.name, 'native-001');

    const saved001 = await persistence.projectRepository.find({
      tenantId: DEFAULT_TENANT,
      projectId: 'tkt-001'
    });
    assert.ok(saved001);
    const saved001Session = extractSessionState(saved001?.state);
    assert.equal(saved001Session.name, 'native-001');

    // TKT-20260214-002: SessionState mutation e2e + invalid_payload/invalid_state failure paths
    const ensure002 = await callTool(dispatcher, 'ensure_project', {
      projectId: 'tkt-002',
      name: 'mutation-002',
      onMissing: 'create'
    } as ToolPayloadMap['ensure_project'] & { projectId: string });
    assert.equal(ensure002.ok, true);

    const addRoot = await callTool(dispatcher, 'add_bone', {
      projectId: 'tkt-002',
      name: 'root',
      pivot: [0, 0, 0]
    } as ToolPayloadMap['add_bone'] & { projectId: string });
    assert.equal(addRoot.ok, true);

    const addCube = await callTool(dispatcher, 'add_cube', {
      projectId: 'tkt-002',
      name: 'body',
      bone: 'root',
      from: [0, 0, 0],
      to: [4, 4, 4]
    } as ToolPayloadMap['add_cube'] & { projectId: string });
    assert.equal(addCube.ok, true);

    const addClip = await callTool(dispatcher, 'create_animation_clip', {
      projectId: 'tkt-002',
      name: 'idle',
      length: 1,
      loop: true,
      fps: 20
    } as ToolPayloadMap['create_animation_clip'] & { projectId: string });
    assert.equal(addClip.ok, true);

    const setPose = await callTool(dispatcher, 'set_frame_pose', {
      projectId: 'tkt-002',
      clip: 'idle',
      frame: 0,
      bones: [{ name: 'root', rot: [0, 10, 0] }]
    } as ToolPayloadMap['set_frame_pose'] & { projectId: string });
    assert.equal(setPose.ok, true);

    const record002 = await persistence.projectRepository.find({
      tenantId: DEFAULT_TENANT,
      projectId: 'tkt-002'
    });
    assert.ok(record002);
    if (!record002) return;
    await persistence.projectRepository.save({
      ...record002,
      state: injectTextureIntoRecord(record002.state, {
        id: 'atlas-id',
        name: 'atlas',
        width: 64,
        height: 64
      }),
      updatedAt: new Date().toISOString()
    });

    const assignTexture = await callTool(dispatcher, 'assign_texture', {
      projectId: 'tkt-002',
      textureName: 'atlas',
      cubeNames: ['body'],
      faces: ['north', 'south']
    } as ToolPayloadMap['assign_texture'] & { projectId: string });
    assert.equal(assignTexture.ok, true);

    const state002 = await callTool(dispatcher, 'get_project_state', {
      projectId: 'tkt-002',
      detail: 'full',
      includeUsage: true
    } as ToolPayloadMap['get_project_state'] & { projectId: string });
    assert.equal(state002.ok, true);
    if (!state002.ok) return;
    assert.equal(state002.data.project.counts.bones >= 1, true);
    assert.equal(state002.data.project.counts.cubes >= 1, true);
    assert.equal(state002.data.project.counts.animations >= 1, true);
    const usage = state002.data.project.textureUsage;
    assert.ok(usage);
    const atlasUsage = usage?.textures.find((entry) => entry.name === 'atlas');
    assert.ok(atlasUsage);
    const bodyUsage = atlasUsage?.cubes.find((cube) => cube.name === 'body');
    assert.ok(bodyUsage);
    const northFace = bodyUsage?.faces.find((face) => face.face === 'north');
    assert.ok(northFace);

    // TKT-20260217-004: read_texture saveToTmp should work in native profile.
    const ensure004 = await callTool(dispatcher, 'ensure_project', {
      projectId: 'tkt-004',
      name: 'texture-read-004',
      onMissing: 'create'
    } as ToolPayloadMap['ensure_project'] & { projectId: string });
    assert.equal(ensure004.ok, true);

    const record004 = await persistence.projectRepository.find({
      tenantId: DEFAULT_TENANT,
      projectId: 'tkt-004'
    });
    assert.ok(record004);
    if (!record004) return;
    const stateWithTexture004 = injectTextureIntoRecord(record004.state, {
      id: 'atlas-read-id',
      name: 'atlas-read',
      width: 1,
      height: 1
    });
    const stateWithAssets004 = injectTextureAssetIntoRecord(stateWithTexture004, {
      id: 'atlas-read-id',
      name: 'atlas-read',
      dataUri: PNG_1X1_TRANSPARENT,
      width: 1,
      height: 1
    });
    await persistence.projectRepository.save({
      ...record004,
      state: stateWithAssets004,
      updatedAt: new Date().toISOString()
    });

    const readTextureTmp = await callTool(dispatcher, 'read_texture', {
      projectId: 'tkt-004',
      name: 'atlas-read',
      saveToTmp: true,
      tmpPrefix: 'native',
      tmpName: 'atlas-read'
    } as ToolPayloadMap['read_texture'] & { projectId: string });
    assert.equal(readTextureTmp.ok, true);
    if (readTextureTmp.ok) {
      assert.equal(readTextureTmp.data.texture.name, 'atlas-read');
      assert.equal(readTextureTmp.data.texture.mimeType, 'image/png');
      const savedPath = readTextureTmp.data.saved?.texture?.path;
      assert.equal(typeof savedPath, 'string');
      if (typeof savedPath === 'string') {
        assert.equal(fs.existsSync(savedPath), true);
        fs.unlinkSync(savedPath);
      }
    }

    const invalidState = await callTool(dispatcher, 'add_bone', {
      projectId: 'tkt-002-empty',
      name: 'orphan'
    } as ToolPayloadMap['add_bone'] & { projectId: string });
    assert.equal(invalidState.ok, false);
    if (!invalidState.ok) {
      assert.equal(invalidState.error.code, 'invalid_state');
    }

    const invalidPayload = await callTool(dispatcher, 'add_cube', {
      projectId: 'tkt-002'
    } as ToolPayloadMap['add_cube'] & { projectId: string });
    assert.equal(invalidPayload.ok, false);
    if (!invalidPayload.ok) {
      assert.equal(invalidPayload.error.code, 'invalid_payload');
    }

    // TKT-20260217-005: worker should execute real backend tool path (no payload-echo placeholder).
    const workerLogger = createNoopLogger();

    const ensureWorkerProject = await callTool(dispatcher, 'ensure_project', {
      projectId: 'worker-job-1',
      name: 'worker-job-1',
      onMissing: 'create'
    } as ToolPayloadMap['ensure_project'] & { projectId: string });
    assert.equal(ensureWorkerProject.ok, true);

    const addWorkerRoot = await callTool(dispatcher, 'add_bone', {
      projectId: 'worker-job-1',
      name: 'root',
      pivot: [0, 0, 0]
    } as ToolPayloadMap['add_bone'] & { projectId: string });
    assert.equal(addWorkerRoot.ok, true);

    const addWorkerCube = await callTool(dispatcher, 'add_cube', {
      projectId: 'worker-job-1',
      name: 'body',
      bone: 'root',
      from: [0, 0, 0],
      to: [2, 2, 2]
    } as ToolPayloadMap['add_cube'] & { projectId: string });
    assert.equal(addWorkerCube.ok, true);

    let gltfResult: NativeJobResult | undefined;
    await processOneNativeJob({
      workerId: 'worker-native-e2e',
      logger: workerLogger,
      enabled: true,
      backend: engine,
      store: {
        claimNextJob: async () => ({
          id: 'job-native-1',
          projectId: 'worker-job-1',
          kind: 'gltf.convert',
          payload: { codecId: 'gltf', optimize: true },
          status: 'running',
          attemptCount: 1,
          maxAttempts: 3,
          leaseMs: 30000,
          createdAt: new Date().toISOString()
        }),
        completeJob: async (_jobId: string, result?: NativeJobResult) => {
          gltfResult = result;
          return null;
        },
        failJob: async (_jobId: string, message: string) => {
          throw new Error(`unexpected gltf failure: ${message}`);
        }
      }
    });
    assert.equal(gltfResult?.kind, 'gltf.convert');
    assert.equal(gltfResult?.status, 'converted');
    assert.equal(typeof gltfResult?.output?.exportPath, 'string');

    let codecFailureMessage = '';
    await processOneNativeJob({
      workerId: 'worker-native-e2e',
      logger: workerLogger,
      enabled: true,
      backend: engine,
      store: {
        claimNextJob: async () => ({
          id: 'job-native-codec-fail',
          projectId: 'worker-job-1',
          kind: 'gltf.convert',
          payload: { codecId: 'unknown-codec' },
          status: 'running',
          attemptCount: 1,
          maxAttempts: 3,
          leaseMs: 30000,
          createdAt: new Date().toISOString()
        }),
        completeJob: async () => {
          throw new Error('unknown codec should fail');
        },
        failJob: async (_jobId: string, message: string) => {
          codecFailureMessage = message;
          return null;
        }
      }
    });
    assert.equal(codecFailureMessage.includes('export failed (unsupported_format)'), true);

    let preflightResult: NativeJobResult | undefined;
    await processOneNativeJob({
      workerId: 'worker-native-e2e',
      logger: workerLogger,
      enabled: true,
      backend: engine,
      store: {
        claimNextJob: async () => ({
          id: 'job-native-2',
          projectId: 'worker-job-1',
          kind: 'texture.preflight',
          payload: {
            textureIds: ['missing-texture'],
            maxDimension: 16,
            allowNonPowerOfTwo: false
          },
          status: 'running',
          attemptCount: 1,
          maxAttempts: 3,
          leaseMs: 30000,
          createdAt: new Date().toISOString()
        }),
        completeJob: async (_jobId: string, result?: NativeJobResult) => {
          preflightResult = result;
          return null;
        },
        failJob: async (_jobId: string, message: string) => {
          throw new Error(`unexpected preflight failure: ${message}`);
        }
      }
    });
    assert.equal(preflightResult?.kind, 'texture.preflight');
    assert.equal(preflightResult?.status, 'failed');
    assert.equal(preflightResult?.summary?.checked, 0);
    assert.equal(Array.isArray(preflightResult?.diagnostics), true);
    if (Array.isArray(preflightResult?.diagnostics)) {
      assert.equal(preflightResult.diagnostics.some((entry) => entry.includes('missing texture id(s): missing-texture')), true);
    }

    let unconfiguredFailMessage = '';
    await processOneNativeJob({
      workerId: 'worker-native-e2e',
      logger: workerLogger,
      enabled: true,
      store: {
        claimNextJob: async () => ({
          id: 'job-native-3',
          projectId: 'worker-job-1',
          kind: 'gltf.convert',
          status: 'running',
          attemptCount: 1,
          maxAttempts: 3,
          leaseMs: 30000,
          createdAt: new Date().toISOString()
        }),
        completeJob: async () => {
          throw new Error('completeJob must not run without backend');
        },
        failJob: async (_jobId: string, message: string) => {
          unconfiguredFailMessage = message;
          return null;
        }
      }
    });
    assert.equal(unconfiguredFailMessage, 'Engine backend is required for native job execution.');

    // TKT-20260214-003: export e2e + oracle gate + render_preview unsupported
    const fx006Dir = path.join(oracleFixturesRoot, 'FX-006');
    const fx006State = readJson<SessionState>(path.join(fx006Dir, 'state.json'));
    const fx006ExpectedResult = readJson<ToolResultMap['export']>(path.join(fx006Dir, 'expected', 'result.json'));
    const fx006ExpectedGeo = readJson<unknown>(path.join(fx006Dir, 'expected', 'fx006.geo.json'));
    const fx006ExpectedAnim = readJson<unknown>(path.join(fx006Dir, 'expected', 'fx006.animation.json'));
    const fx006PreviewErr = readJson<{ code: string; message: string }>(
      path.join(fx006Dir, 'expected', 'preview_error.json')
    );

    await persistence.projectRepository.save({
      scope: { tenantId: DEFAULT_TENANT, projectId: 'fx006' },
      revision: 'seed-fx006',
      state: fx006State,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const exportFx006 = await callTool(dispatcher, 'export', {
      projectId: 'fx006',
      format: 'gecko_geo_anim',
      destPath: 'fx006.json',
      options: { includeDiagnostics: true }
    } as ToolPayloadMap['export'] & { projectId: string });
    assert.equal(exportFx006.ok, true);
    if (!exportFx006.ok) return;
    assert.equal(
      exportFx006.data.path === fx006ExpectedResult.path || exportFx006.data.path === 'fx006.json',
      true
    );
    assert.deepEqual(exportFx006.data.selectedTarget, fx006ExpectedResult.selectedTarget);
    assert.equal(exportFx006.data.stage === fx006ExpectedResult.stage || exportFx006.data.stage === 'done', true);
    if (exportFx006.data.stage === fx006ExpectedResult.stage) {
      assert.deepEqual(exportFx006.data.warnings, fx006ExpectedResult.warnings);
    }
    assert.equal(typeof exportFx006.data.revision, 'string');

    const fx006GeoActual = await persistence.blobStore.readUtf8(toExportPointer('fx006', 'fx006.geo.json'));
    const fx006AnimActual = await persistence.blobStore.readUtf8(toExportPointer('fx006', 'fx006.animation.json'));
    assert.ok(fx006GeoActual);
    assert.ok(fx006AnimActual);
    assert.deepEqual(JSON.parse(fx006GeoActual ?? '{}'), fx006ExpectedGeo);
    assert.deepEqual(JSON.parse(fx006AnimActual ?? '{}'), fx006ExpectedAnim);

    const exportFx006Again = await callTool(dispatcher, 'export', {
      projectId: 'fx006',
      format: 'gecko_geo_anim',
      destPath: 'fx006.json',
      options: { includeDiagnostics: true }
    } as ToolPayloadMap['export'] & { projectId: string });
    assert.equal(exportFx006Again.ok, true);
    if (exportFx006Again.ok) {
      assert.deepEqual(exportFx006Again.data, exportFx006.data);
    }

    const capabilitiesFx006 = await callTool(
      dispatcher,
      'list_capabilities',
      {} as ToolPayloadMap['list_capabilities'] & { projectId?: string }
    );
    assert.equal(capabilitiesFx006.ok, true);
    if (capabilitiesFx006.ok) {
      const toolAvailability = capabilitiesFx006.data.toolAvailability ?? {};
      assert.equal(toolAvailability.export?.available, true);
      assert.equal(toolAvailability.render_preview?.available, false);
      assert.equal(toolAvailability.reload_plugins?.available, false);
      assert.equal(toolAvailability.export_trace_log?.available, false);
      assert.equal(toolAvailability.paint_faces?.available, false);
    }

    const previewFx006 = await callTool(dispatcher, 'render_preview', {
      projectId: 'fx006',
      mode: 'fixed'
    } as ToolPayloadMap['render_preview'] & { projectId: string });
    assert.equal(previewFx006.ok, false);
    if (!previewFx006.ok) {
      assert.equal(previewFx006.error.code, fx006PreviewErr.code);
      assert.equal(previewFx006.error.message.includes(fx006PreviewErr.message), true);
      assert.equal(previewFx006.error.message.includes('disabled in native production profile'), false);
    }

    const reloadPluginsFx006 = await callTool(dispatcher, 'reload_plugins', {
      projectId: 'fx006',
      confirm: true
    } as ToolPayloadMap['reload_plugins'] & { projectId: string });
    assert.equal(reloadPluginsFx006.ok, false);
    if (!reloadPluginsFx006.ok) {
      assert.equal(reloadPluginsFx006.error.code, 'invalid_state');
      assert.equal(reloadPluginsFx006.error.message.includes('Plugin reload is not available in this host.'), true);
      assert.equal(reloadPluginsFx006.error.message.includes('disabled in native production profile'), false);
    }

    const traceLogFx006 = await callTool(dispatcher, 'export_trace_log', {
      projectId: 'fx006',
      destPath: 'trace.ndjson'
    } as ToolPayloadMap['export_trace_log'] & { projectId: string });
    assert.equal(traceLogFx006.ok, false);
    if (!traceLogFx006.ok) {
      assert.equal(traceLogFx006.error.code, 'invalid_state');
      assert.equal(traceLogFx006.error.message.includes('Trace log export is unavailable.'), true);
      assert.equal(traceLogFx006.error.message.includes('disabled in native production profile'), false);
    }

    const paintFacesFx006 = await callTool(dispatcher, 'paint_faces', {
      projectId: 'fx006'
    } as ToolPayloadMap['paint_faces'] & { projectId: string });
    assert.equal(paintFacesFx006.ok, false);
    if (!paintFacesFx006.ok) {
      assert.equal(paintFacesFx006.error.code, 'invalid_state');
      assert.equal(paintFacesFx006.error.message.includes('disabled in native production profile'), false);
    }

    const fx007Dir = path.join(oracleFixturesRoot, 'FX-007');
    const fx007State = readJson<SessionState>(path.join(fx007Dir, 'state.json'));
    const fx007ExpectedResult = readJson<ToolResultMap['export']>(path.join(fx007Dir, 'expected', 'result.json'));
    const fx007ExpectedGltf = readJson<unknown>(path.join(fx007Dir, 'expected', 'fx007.gltf'));
    const fx007ExpectedSha = readJson<Record<string, string>>(
      path.join(fx007Dir, 'expected', 'expected.gltf.sha256.json')
    );

    await persistence.projectRepository.save({
      scope: { tenantId: DEFAULT_TENANT, projectId: 'fx007' },
      revision: 'seed-fx007',
      state: fx007State,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const exportFx007 = await callTool(dispatcher, 'export', {
      projectId: 'fx007',
      format: 'gltf',
      destPath: 'fx007.gltf'
    } as ToolPayloadMap['export'] & { projectId: string });
    assert.equal(exportFx007.ok, true);
    if (!exportFx007.ok) return;
    assert.equal(exportFx007.data.path, fx007ExpectedResult.path);
    assert.deepEqual(exportFx007.data.selectedTarget, fx007ExpectedResult.selectedTarget);
    assert.equal(exportFx007.data.stage, fx007ExpectedResult.stage);
    assert.deepEqual(exportFx007.data.warnings, fx007ExpectedResult.warnings);
    assert.equal(typeof exportFx007.data.revision, 'string');

    const fx007GltfRaw = await persistence.blobStore.readUtf8(toExportPointer('fx007', 'fx007.gltf'));
    assert.ok(fx007GltfRaw);
    const fx007GltfActual = JSON.parse(fx007GltfRaw ?? '{}') as Record<string, unknown>;
    assert.deepEqual(sanitizeGltfUris(fx007GltfActual), sanitizeGltfUris(fx007ExpectedGltf));

    const bufferUri = ((fx007GltfActual.buffers as Array<Record<string, unknown>> | undefined) ?? [])[0]?.uri;
    assert.equal(typeof bufferUri, 'string');
    const bufferSha = sha256Bytes(decodeDataUriBytes(bufferUri as string));
    assert.equal(bufferSha, fx007ExpectedSha.buffer0_sha256);

    const images = (fx007GltfActual.images as Array<Record<string, unknown>> | undefined) ?? [];
    images.forEach((image, index) => {
      const uri = image.uri;
      assert.equal(typeof uri, 'string');
      const key = `image${index}_sha256`;
      assert.equal(sha256Bytes(decodeDataUriBytes(uri as string)), fx007ExpectedSha[key]);
    });

    const exportFx007Again = await callTool(dispatcher, 'export', {
      projectId: 'fx007',
      format: 'gltf',
      destPath: 'fx007.gltf'
    } as ToolPayloadMap['export'] & { projectId: string });
    assert.equal(exportFx007Again.ok, true);
    if (exportFx007Again.ok) {
      assert.deepEqual(exportFx007Again.data, exportFx007.data);
    }

    const exportFx007NativeCodec = await callTool(dispatcher, 'export', {
      projectId: 'fx007',
      format: 'native_codec',
      codecId: 'gltf',
      destPath: 'fx007-native.gltf'
    } as ToolPayloadMap['export'] & { projectId: string });
    assert.equal(exportFx007NativeCodec.ok, true);
    if (exportFx007NativeCodec.ok) {
      assert.equal(exportFx007NativeCodec.data.stage, 'done');
      assert.equal(exportFx007NativeCodec.data.selectedTarget?.kind, 'native_codec');
      assert.equal(exportFx007NativeCodec.data.selectedTarget?.id, 'gltf');
      const nativeCodecRaw = await persistence.blobStore.readUtf8(toExportPointer('fx007', 'fx007-native.gltf'));
      assert.ok(nativeCodecRaw);
      const nativeCodecJson = JSON.parse(nativeCodecRaw ?? '{}') as Record<string, unknown>;
      assert.equal(isRecord(nativeCodecJson.asset), true);
      assert.equal((nativeCodecJson.asset as { version?: string }).version, '2.0');
    }

    const exportFx007UnknownCodec = await callTool(dispatcher, 'export', {
      projectId: 'fx007',
      format: 'native_codec',
      codecId: 'unknown-codec',
      destPath: 'fx007-unknown.gltf'
    } as ToolPayloadMap['export'] & { projectId: string });
    assert.equal(exportFx007UnknownCodec.ok, false);
    if (!exportFx007UnknownCodec.ok) {
      assert.equal(exportFx007UnknownCodec.error.code, 'unsupported_format');
      assert.equal(exportFx007UnknownCodec.error.message.includes('Native codec'), true);
    }
  })()
);
