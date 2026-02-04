import type { Capabilities, Dispatcher } from '../types';
import type { Logger } from '../logging';
import type { ToolPolicies } from '../usecases/policies';
import { computeCapabilities } from '../config';
import { ToolDispatcherImpl } from '../dispatcher';
import { ProjectSession } from '../session';
import { BlockbenchEditor } from '../adapters/blockbench/BlockbenchEditor';
import { BlockbenchHost } from '../adapters/blockbench/BlockbenchHost';
import { BlockbenchFormats } from '../adapters/blockbench/BlockbenchFormats';
import { BlockbenchSnapshot } from '../adapters/blockbench/BlockbenchSnapshot';
import { BlockbenchExport } from '../adapters/blockbench/BlockbenchExport';
import { BlockbenchTextureRenderer } from '../adapters/blockbench/BlockbenchTextureRenderer';
import { BlockbenchTraceLogWriter } from '../adapters/blockbench/BlockbenchTraceLogWriter';
import type { FormatOverrides } from '../domain/formats';
import { InMemoryResourceStore } from '../adapters/resources/resourceStore';
import { LocalTmpStore } from '../adapters/tmp/LocalTmpStore';
import { ToolService } from '../usecases/ToolService';
import { DEFAULT_TOOL_REGISTRY } from '../transport/mcp/tools';
import { TraceRecorder } from '../trace/traceRecorder';
import { TraceLogStore } from '../trace/traceLogStore';
import { ResourceTraceLogWriter } from '../trace/traceLogWriters';
import { PLUGIN_VERSION } from '../config';
import { TraceLogService } from '../usecases/TraceLogService';
import type { TraceLogWriteMode, TraceLogWriterFactory } from '../ports/traceLog';
import { TraceLogFlushScheduler } from '../trace/traceLogFlushScheduler';

export type RuntimeServices = {
  session: ProjectSession;
  capabilities: Capabilities;
  dispatcher: Dispatcher;
  formats: BlockbenchFormats;
  traceRecorder: TraceRecorder;
  traceLogStore: TraceLogStore;
  traceLogFileWriter: BlockbenchTraceLogWriter;
  traceLogFlushScheduler: TraceLogFlushScheduler;
  traceLogService: TraceLogService;
};

type BuildRuntimeServicesOptions = {
  blockbenchVersion?: string;
  formatOverrides: FormatOverrides;
  policies: ToolPolicies;
  resourceStore: InMemoryResourceStore;
  logger: Logger;
  traceLog?: {
    enabled?: boolean;
    mode?: TraceLogWriteMode;
    destPath?: string;
    fileName?: string;
    resourceEnabled?: boolean;
    maxEntries?: number;
    maxBytes?: number;
    minEntries?: number;
    flushEvery?: number;
    flushIntervalMs?: number;
    detailOps?: string[];
  };
};

const DEFAULT_DETAIL_OPS = [
  'auto_uv_atlas',
  'preflight_texture',
  'generate_texture_preset',
  'set_project_texture_resolution',
  'assign_texture',
  'set_face_uv'
];

export const buildRuntimeServices = (options: BuildRuntimeServicesOptions): RuntimeServices => {
  const session = new ProjectSession();
  const editor = new BlockbenchEditor(options.logger);
  const host = new BlockbenchHost();
  const formats = new BlockbenchFormats();
  const snapshot = new BlockbenchSnapshot(options.logger);
  const exporter = new BlockbenchExport(options.logger);
  const textureRenderer = new BlockbenchTextureRenderer();
  const tmpStore = new LocalTmpStore();
  const previewCapability = {
    pngOnly: true,
    fixedOutput: 'single' as const,
    turntableOutput: 'sequence' as const,
    response: 'content' as const
  };
  const capabilities = computeCapabilities(
    options.blockbenchVersion,
    formats.listFormats(),
    options.formatOverrides,
    previewCapability
  );
  const toolRegistry = DEFAULT_TOOL_REGISTRY;
  capabilities.toolRegistry = { hash: toolRegistry.hash, count: toolRegistry.count };
  const service = new ToolService({
    session,
    capabilities,
    editor,
    host,
    formats,
    snapshot,
    exporter,
    textureRenderer,
    tmpStore,
    resources: options.resourceStore,
    policies: options.policies
  });
  const traceDefaults = options.traceLog ?? {};
  const detailOps = traceDefaults.detailOps ?? DEFAULT_DETAIL_OPS;
  const traceLogStore = new TraceLogStore({
    writer: traceDefaults.resourceEnabled === false ? null : new ResourceTraceLogWriter(options.resourceStore),
    autoFlush: true,
    maxEntries: traceDefaults.maxEntries ?? 2000,
    maxBytes: traceDefaults.maxBytes,
    minEntries: traceDefaults.minEntries
  });
  const traceLogFileWriter = new BlockbenchTraceLogWriter({
    mode: 'writeFile',
    destPath: traceDefaults.destPath,
    fileName: traceDefaults.fileName
  });
  const traceLogFlushScheduler = new TraceLogFlushScheduler({
    store: traceLogStore,
    writer:
      traceDefaults.enabled === false || traceDefaults.mode === 'export'
        ? null
        : traceLogFileWriter,
    policy: {
      enabled: traceDefaults.enabled !== false && traceDefaults.mode !== 'export',
      flushEvery: traceDefaults.flushEvery,
      flushIntervalMs: traceDefaults.flushIntervalMs
    },
    logger: options.logger
  });
  const traceLogWriterFactory: TraceLogWriterFactory = {
    create: (opts) =>
      new BlockbenchTraceLogWriter({
        mode: opts?.mode ?? traceDefaults.mode ?? 'auto',
        destPath: opts?.destPath ?? traceDefaults.destPath,
        fileName: opts?.fileName ?? traceDefaults.fileName
      })
  };
  const traceRecorder = new TraceRecorder(
    {
      getProjectState: (payload) => service.getProjectState(payload),
      getProjectDiff: (payload) => service.getProjectDiff(payload)
    },
    traceLogStore,
    {
      enabled: traceDefaults.enabled !== false,
      includeState: true,
      includeDiff: true,
      stateDetail: 'summary',
      diffDetail: 'summary',
      detailRules: detailOps.length
        ? [
            {
              ops: detailOps,
              includeState: true,
              includeDiff: true,
              includeUsage: true,
              stateDetail: 'full',
              diffDetail: 'full'
            }
          ]
        : [],
      onRecord: () => traceLogFlushScheduler.recorded(),
      pluginVersion: PLUGIN_VERSION,
      blockbenchVersion: options.blockbenchVersion
    }
  );
  const traceLogService = new TraceLogService({
    store: traceLogStore,
    writerFactory: traceLogWriterFactory,
    defaults: {
      mode: traceDefaults.mode,
      destPath: traceDefaults.destPath,
      fileName: traceDefaults.fileName
    }
  });
  const dispatcher = new ToolDispatcherImpl(session, capabilities, service, {
    includeStateByDefault: () => Boolean(options.policies.autoIncludeState),
    includeDiffByDefault: () => Boolean(options.policies.autoIncludeDiff),
    logger: options.logger,
    traceRecorder,
    traceLogService
  });
  return {
    session,
    capabilities,
    dispatcher,
    formats,
    traceRecorder,
    traceLogStore,
    traceLogFileWriter,
    traceLogFlushScheduler,
    traceLogService
  };
};






