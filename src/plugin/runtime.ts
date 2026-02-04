import {
  DEFAULT_SERVER_HOST,
  DEFAULT_SERVER_PATH,
  DEFAULT_SERVER_PORT,
  PLUGIN_ID,
  PLUGIN_VERSION,
  TOOL_SCHEMA_VERSION
} from '../config';
import { Capabilities, Dispatcher } from '../types';
import { ConsoleLogger, errorMessage, LogLevel } from '../logging';
import type { ExportPolicy } from '../usecases/policies';
import { FormatOverrides } from '../domain/formats';
import { DEFAULT_TOOL_REGISTRY } from '../transport/mcp/tools';
import { GUIDE_RESOURCE_TEMPLATES, GUIDE_RESOURCES } from '../shared/resources/guides';
import { InMemoryResourceStore } from '../adapters/resources/resourceStore';
import { readGlobals } from '../adapters/blockbench/blockbenchUtils';
import { cleanupBridge, claimSingleton, exposeBridge, releaseSingleton } from './runtimeBridge';
import type { EndpointConfig } from './types';
import { resolveEndpointConfig } from './endpointConfig';
import { registerPluginSettings } from './pluginSettings';
import { resolveTraceLogDestPath } from './traceLogPath';
import { buildRuntimeServices } from './runtimeServices';
import { registerCodecs } from './runtimeCodecs';
import { restartServer, type RuntimeServerState } from './runtimeServer';
import { createDefaultPolicies, createTraceLogDefaults } from './runtimeDefaults';
import type { TraceRecorder } from '../trace/traceRecorder';
import type { TraceLogFlushScheduler } from '../trace/traceLogFlushScheduler';
import type { TraceLogWriter } from '../ports/traceLog';
import { PLUGIN_LOG_LOADING, PLUGIN_LOG_PREVIOUS_CLEANUP_FAILED, PLUGIN_UI_LOADED, PLUGIN_UI_UNLOADED } from './messages';

type BbmcpBridge = {
  invoke: Dispatcher['handle'];
  capabilities: Capabilities;
  serverConfig: () => EndpointConfig;
  settings: () => EndpointConfig;
};

const formatOverrides: FormatOverrides = {};
const resourceStore = new InMemoryResourceStore([...GUIDE_RESOURCE_TEMPLATES]);
GUIDE_RESOURCES.forEach((resource) => resourceStore.put(resource));
const policies = createDefaultPolicies(formatOverrides) as {
  formatOverrides: FormatOverrides;
  snapshotPolicy: 'hybrid';
  exportPolicy: ExportPolicy;
  uvPolicy: ReturnType<typeof createDefaultPolicies>['uvPolicy'];
  autoDiscardUnsaved: boolean;
  autoAttachActiveProject: boolean;
  autoIncludeState: boolean;
  autoIncludeDiff: boolean;
  requireRevision: boolean;
  autoRetryRevision: boolean;
};

let logLevel: LogLevel = 'info';

const traceLogDefaults = createTraceLogDefaults();

let endpointConfig: EndpointConfig = {
  host: DEFAULT_SERVER_HOST,
  port: DEFAULT_SERVER_PORT,
  path: DEFAULT_SERVER_PATH
};

let serverState: RuntimeServerState = { sidecar: null, inlineServerStop: null };
let globalDispatcher: Dispatcher | null = null;
let globalTraceRecorder: TraceRecorder | null = null;
let globalTraceLogWriter: TraceLogWriter | null = null;
let globalTraceLogFlushScheduler: TraceLogFlushScheduler | null = null;
const toolRegistry = DEFAULT_TOOL_REGISTRY;

const cleanupRuntime = () => {
  if (globalTraceLogFlushScheduler) {
    globalTraceLogFlushScheduler.flushNow();
  }
  if (globalTraceRecorder && globalTraceLogWriter) {
    try {
      globalTraceRecorder.flushTo(globalTraceLogWriter);
    } catch (err) {
      const message = errorMessage(err, 'trace log flush failed');
      try {
        new ConsoleLogger(PLUGIN_ID, () => logLevel).warn('trace log flush failed', { message });
      } catch (logErr) {
        // Swallow logging errors during cleanup.
      }
    }
  }
  if (serverState.inlineServerStop) {
    serverState.inlineServerStop();
    serverState.inlineServerStop = null;
  }
  if (serverState.sidecar) {
    serverState.sidecar.stop();
    serverState.sidecar = null;
  }
  globalDispatcher = null;
  globalTraceRecorder = null;
  globalTraceLogWriter = null;
  globalTraceLogFlushScheduler = null;
  cleanupBridge();
};

const claimSingletonWithLogger = () => {
  claimSingleton({
    cleanup: cleanupRuntime,
    version: PLUGIN_VERSION,
    onCleanupError: (message) => {
      try {
        new ConsoleLogger(PLUGIN_ID, () => logLevel).warn(PLUGIN_LOG_PREVIOUS_CLEANUP_FAILED, { message });
      } catch (logErr) {
        // Last resort: avoid crashing during startup.
      }
    }
  });
};

const exposeBridgeWithVersion = (bridge: BbmcpBridge) => {
  exposeBridge(bridge, PLUGIN_VERSION);
};
const restartServerWithState = () => {
  serverState = restartServer({
    endpointConfig,
    dispatcher: globalDispatcher,
    logLevel,
    resourceStore,
    toolRegistry,
    state: serverState
  });
};

 

export const registerPlugin = () => {
  const globals = readGlobals();
  const pluginApi = globals.Plugin;

  pluginApi?.register(PLUGIN_ID, {
    title: 'bbmcp',
    author: 'sigee-min',
    icon: 'extension',
    description: 'Blockbench MCP bridge scaffold (Java Block/Item default, GeckoLib optional). Latest Blockbench desktop only.',
    creation_date: '2024-01-04',
    version: PLUGIN_VERSION,
    native_modules: ['child_process'],
    tags: ['mcp', 'automation', 'ai'],
    about: `### bbmcp (MCP Bridge for Blockbench)

**Author:** sigee-min
**Version:** ${PLUGIN_VERSION}
**Published:** 2024-01-04
**Last Updated:** ${new Date().toISOString().slice(0, 10)}

bbmcp exposes a clean MCP-facing tool surface for AI/agents:

- Modeling is low-level only: add_bone/add_cube (one item per call).
- UV + texture flow is explicit: assign_texture -> preflight_texture -> set_face_uv (as needed) -> generate_texture_preset.
- Deterministic low-level tools only; no high-level pipelines.
  - Formats: Java Block/Item enabled by default; GeckoLib/Animated Java gated by capability flags.
- MCP endpoint: set in Settings (bbmcp: Server) or read from user/project .bbmcp/endpoint.json, or BBMCP_HOST/PORT/PATH env vars (default 0.0.0.0:8787/mcp).
- Server starts automatically and restarts on endpoint changes.

Recommended flow:
1) Configure endpoint via Settings or .bbmcp/endpoint.json when needed.
  2) Use \`bbmcp.invoke\` with low-level tools (model/texture/animation).
3) Export, render preview, and run validate to catch issues early.

Notes:
- undo/redo is wrapped where applicable using Blockbench.edit/Undo.
- preview capture falls back to canvas toDataURL; ensure a renderable viewport.
- export currently writes a session snapshot JSON; format-specific codecs to be extended.
- support is limited to the latest Blockbench desktop release (older versions untested).`,
    variant: 'desktop',
    onload() {
      claimSingletonWithLogger();
      const blockbench = readGlobals().Blockbench;
      const logger = new ConsoleLogger(PLUGIN_ID, () => logLevel);
      logger.info(PLUGIN_LOG_LOADING, { version: PLUGIN_VERSION, schema: TOOL_SCHEMA_VERSION });
      endpointConfig = resolveEndpointConfig(logger);
      registerPluginSettings({
        readGlobals,
        endpointConfig,
        restartServer: restartServerWithState
      });
      const traceLogDestPath = resolveTraceLogDestPath(traceLogDefaults.fileName, logger);
      const traceLogDestResolved = traceLogDestPath ?? traceLogDefaults.destPath;
      const runtime = buildRuntimeServices({
        blockbenchVersion: blockbench?.version,
        formatOverrides,
        policies,
        resourceStore,
        logger,
        traceLog: {
          enabled: traceLogDefaults.enabled,
          mode: traceLogDefaults.mode,
          destPath: traceLogDestResolved || undefined,
          fileName: traceLogDefaults.fileName || undefined,
          resourceEnabled: traceLogDefaults.resourceEnabled,
          maxEntries: traceLogDefaults.maxEntries,
          maxBytes: traceLogDefaults.maxBytes,
          minEntries: traceLogDefaults.minEntries,
          flushEvery: traceLogDefaults.flushEvery,
          flushIntervalMs: traceLogDefaults.flushIntervalMs
        }
      });
      const {
        session,
        capabilities,
        dispatcher,
        formats,
        traceRecorder,
        traceLogFileWriter,
        traceLogFlushScheduler
      } = runtime;
      globalDispatcher = dispatcher;
      globalTraceRecorder = traceRecorder;
      globalTraceLogWriter = traceLogFileWriter;
      globalTraceLogFlushScheduler = traceLogFlushScheduler;

      registerCodecs({
        capabilities,
        session,
        formats,
        formatOverrides,
        exportPolicy: policies.exportPolicy
      });
      restartServerWithState();

      exposeBridgeWithVersion({
        invoke: dispatcher.handle.bind(dispatcher),
        capabilities,
        serverConfig: () => ({ ...endpointConfig }),
        settings: () => ({ ...endpointConfig })
      });

      blockbench?.showQuickMessage?.(PLUGIN_UI_LOADED(PLUGIN_VERSION), 1200);
    },
    onunload() {
      const blockbench = readGlobals().Blockbench;
      cleanupRuntime();
      releaseSingleton();
      blockbench?.showQuickMessage?.(PLUGIN_UI_UNLOADED, 1200);
    }
  });
};










