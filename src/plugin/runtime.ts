import {
  computeCapabilities,
  PLUGIN_ID,
  PLUGIN_VERSION,
  TOOL_SCHEMA_VERSION,
  DEFAULT_SERVER_HOST,
  DEFAULT_SERVER_PORT,
  DEFAULT_SERVER_PATH
} from '../config';
import { ProjectSession } from '../session';
import { ToolDispatcherImpl } from '../dispatcher';
import { Capabilities, Dispatcher, ExportPayload, FormatKind } from '../types';
import { ProxyRouter } from '../proxy';
import { ConsoleLogger, errorMessage, LogLevel } from '../logging';
import {
  ApplyEntitySpecPayload,
  ApplyModelSpecPayload,
  ApplyTextureSpecPayload,
  ApplyUvSpecPayload,
  ProxyTool
} from '../spec';
import { SidecarProcess } from '../sidecar/SidecarProcess';
import { SidecarLaunchConfig } from '../sidecar/types';
import { ToolService } from '../usecases/ToolService';
import type { ExportPolicy } from '../usecases/policies';
import { BlockbenchEditor } from '../adapters/blockbench/BlockbenchEditor';
import { BlockbenchHost } from '../adapters/blockbench/BlockbenchHost';
import { BlockbenchFormats } from '../adapters/blockbench/BlockbenchFormats';
import { BlockbenchSnapshot } from '../adapters/blockbench/BlockbenchSnapshot';
import { BlockbenchExport } from '../adapters/blockbench/BlockbenchExport';
import { BlockbenchTextureRenderer } from '../adapters/blockbench/BlockbenchTextureRenderer';
import { BlockbenchDom } from '../adapters/blockbench/BlockbenchDom';
import { FormatOverrides, resolveFormatId } from '../services/format';
import { buildInternalExport } from '../services/exporters';
import { DEFAULT_UV_POLICY } from '../domain/uvPolicy';
import { BLOCK_PIPELINE_RESOURCE_TEMPLATES } from '../services/blockPipeline';
import { GUIDE_RESOURCE_TEMPLATES, GUIDE_RESOURCES } from '../services/guides';
import { InMemoryResourceStore } from '../services/resources';
import { LocalTmpStore } from '../services/tmpStore';
import { startServer } from '../server';
import { readGlobals } from '../adapters/blockbench/blockbenchUtils';
import { deleteGlobalValue, readGlobalValue, writeGlobalValue } from '../services/globalState';
import { TOOL_REGISTRY_COUNT, TOOL_REGISTRY_HASH } from '../mcp/tools';
import { registerDebugMenu, registerDevReloadAction, registerInspectorAction, registerServerConfigAction } from './menus';
import {
  registerExportPolicySetting,
  registerFormatSettings,
  registerLogSettings,
  registerSettings
} from './settings';
import type { ServerSettings } from './types';

type BbmcpBridge = {
  invoke: Dispatcher['handle'];
  invokeProxy: (tool: ProxyTool, payload: unknown) => unknown;
  capabilities: Capabilities;
  serverConfig: () => ServerSettings;
  settings: () => ServerSettings;
};

const formatOverrides: FormatOverrides = {};
const resourceStore = new InMemoryResourceStore([
  ...BLOCK_PIPELINE_RESOURCE_TEMPLATES,
  ...GUIDE_RESOURCE_TEMPLATES
]);
GUIDE_RESOURCES.forEach((resource) => resourceStore.put(resource));
const policies = {
  formatOverrides,
  snapshotPolicy: 'hybrid' as const,
  rigMergeStrategy: 'skip_existing' as const,
  exportPolicy: 'strict' as ExportPolicy,
  uvPolicy: { ...DEFAULT_UV_POLICY },
  autoDiscardUnsaved: true,
  autoAttachActiveProject: true,
  autoIncludeState: false,
  autoIncludeDiff: false,
  requireRevision: true,
  autoRetryRevision: true
};

let logLevel: LogLevel = 'info';

const serverConfig: ServerSettings = {
  host: DEFAULT_SERVER_HOST,
  port: DEFAULT_SERVER_PORT,
  path: DEFAULT_SERVER_PATH,
  enabled: true,
  autoDiscardUnsaved: true,
  autoAttachActiveProject: true,
  autoIncludeState: false,
  autoIncludeDiff: false,
  requireRevision: true,
  autoRetryRevision: true,
  execPath: undefined
};

let sidecar: SidecarProcess | null = null;
let inlineServerStop: (() => void) | null = null;
let globalDispatcher: Dispatcher | null = null;
let globalProxy: ProxyRouter | null = null;

const INSTANCE_KEY = '__bbmcp_instance__';
type RuntimeInstance = { cleanup: () => void; version: string };

const cleanupBridge = () => {
  deleteGlobalValue('bbmcp');
  deleteGlobalValue('bbmcpVersion');
};

const cleanupRuntime = () => {
  if (inlineServerStop) {
    inlineServerStop();
    inlineServerStop = null;
  }
  if (sidecar) {
    sidecar.stop();
    sidecar = null;
  }
  globalDispatcher = null;
  globalProxy = null;
  cleanupBridge();
};

const claimSingleton = () => {
  const existing = readGlobalValue(INSTANCE_KEY) as RuntimeInstance | undefined;
  if (existing?.cleanup) {
    try {
      existing.cleanup();
    } catch (err) {
      const message = errorMessage(err, 'cleanup failed');
      try {
        new ConsoleLogger(PLUGIN_ID, () => logLevel).warn('previous instance cleanup failed', { message });
      } catch (logErr) {
        // Last resort: avoid crashing during startup.
      }
    }
  }
  writeGlobalValue(INSTANCE_KEY, { cleanup: cleanupRuntime, version: PLUGIN_VERSION } satisfies RuntimeInstance);
};

function registerCodecs(capabilities: Capabilities, session: ProjectSession, formats: BlockbenchFormats) {
  const globals = readGlobals();
  const blockbench = globals.Blockbench;
  const codecCtor = globals.Codec;
  if (!blockbench || !codecCtor) return;
  const resolveCompiler = (formatId: string | null) => {
    if (!formatId) return null;
    const registry = globals.Formats ?? globals.ModelFormat?.formats ?? null;
    if (!registry || typeof registry !== 'object') return null;
    const format = registry[formatId] ?? null;
    if (!format) return null;
    const compile = format.compile;
    if (typeof compile === 'function') {
      return () => compile();
    }
    const codecCompile = format.codec?.compile;
    if (typeof codecCompile === 'function') {
      return () => codecCompile();
    }
    return null;
  };

  const compileFor = (kind: FormatKind, exportKind: ExportPayload['format']) => {
    const formatId = resolveFormatId(kind, formats.listFormats(), formatOverrides);
    const compiler = resolveCompiler(formatId);
    if (compiler) {
      const compiled = compiler();
      if (compiled === null || compiled === undefined) {
        if (policies.exportPolicy === 'best_effort') {
          const snapshot = session.snapshot();
          return { ok: true, data: buildInternalExport(exportKind, snapshot).data };
        }
        return { ok: false, message: 'Native compiler returned empty result' };
      }
      if (isThenable(compiled)) {
        if (policies.exportPolicy === 'best_effort') {
          const snapshot = session.snapshot();
          return { ok: true, data: buildInternalExport(exportKind, snapshot).data };
        }
        return { ok: false, message: 'Async compiler not supported' };
      }
      return { ok: true, data: compiled };
    }
    if (policies.exportPolicy === 'best_effort') {
      const snapshot = session.snapshot();
      return { ok: true, data: buildInternalExport(exportKind, snapshot).data };
    }
    const reason = formatId ? 'Native compiler not available for ' + formatId : 'No format ID for ' + kind;
    return { ok: false, message: reason };
  };

  const register = (kind: FormatKind, exportKind: ExportPayload['format'], codecName: string) => {
    new codecCtor({
      name: codecName,
      extension: 'json',
      remember: true,
      compile() {
        const result = compileFor(kind, exportKind);
        if (!result.ok) {
          throw new Error(result.message);
        }
        return result.data;
      },
      export() {
        try {
          const result = compileFor(kind, exportKind);
          if (!result.ok) {
            blockbench.showQuickMessage?.('bbmcp export failed: ' + result.message, 2000);
            return;
          }
          blockbench.exportFile?.(
            { content: result.data, name: 'model.json' },
            () => blockbench.showQuickMessage?.('bbmcp export complete', 1500)
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : 'export failed';
          blockbench.showQuickMessage?.('bbmcp export failed: ' + message, 2000);
        }
      }
    });
  };

  if (capabilities.formats.find((f) => f.format === 'Java Block/Item' && f.enabled)) {
    register('Java Block/Item', 'java_block_item_json', PLUGIN_ID + '_java_block_item');
  }
  if (capabilities.formats.find((f) => f.format === 'geckolib' && f.enabled)) {
    register('geckolib', 'gecko_geo_anim', PLUGIN_ID + '_geckolib');
  }
  if (capabilities.formats.find((f) => f.format === 'animated_java' && f.enabled)) {
    register('animated_java', 'animated_java', PLUGIN_ID + '_animated_java');
  }
}

function exposeBridge(bridge: BbmcpBridge) {
  writeGlobalValue('bbmcp', bridge);
  writeGlobalValue('bbmcpVersion', PLUGIN_VERSION);
}

function restartServer() {
  if (sidecar) {
    sidecar.stop();
    sidecar = null;
  }
  if (inlineServerStop) {
    inlineServerStop();
    inlineServerStop = null;
  }
  if (!serverConfig.enabled) {
    return;
  }
  const logger = new ConsoleLogger(PLUGIN_ID, () => logLevel);
  const globals = readGlobals();
  const blockbench = globals.Blockbench;
  if (blockbench?.isWeb) {
    logger.warn('MCP server not started (web mode)');
    return;
  }
  if (globalDispatcher && globalProxy) {
    const inlineStop = startServer(
      { host: serverConfig.host, port: serverConfig.port, path: serverConfig.path, toolProfile: 'texture_minimal' },
      globalDispatcher,
      globalProxy,
      logger,
      resourceStore
    );
    if (inlineStop) {
      inlineServerStop = inlineStop;
      return;
    }
    logger.warn('Inline MCP server unavailable; starting sidecar');
    const endpoint: SidecarLaunchConfig = {
      host: serverConfig.host,
      port: serverConfig.port,
      path: serverConfig.path,
      execPath: serverConfig.execPath,
      toolProfile: 'texture_minimal'
    };
    sidecar = new SidecarProcess(endpoint, globalDispatcher, globalProxy, logger);
    if (!sidecar.start()) {
      sidecar = null;
      logger.warn('MCP sidecar failed to start');
    }
  }
}

 

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

- High-level spec proxy: validate and normalize model/animation specs before applying.
- Low-level tools: create/update textures via ops, add bones/cubes, create animation clips, set keyframes, export, preview, validate.
  - Formats: Java Block/Item enabled by default; GeckoLib/Animated Java gated by capability flags.
- MCP endpoint: configurable host/port/path via Settings or the Help menu action "bbmcp: set MCP endpoint".
- Dev workflow: esbuild watch + Plugins.devReload, debug menu actions for capabilities/state logging.

Recommended flow:
1) Set MCP endpoint in Settings or via menu.
2) Use \`bbmcp.invokeProxy\` with sanitized specs (model/anim).
3) Export, render preview, and run validate to catch issues early.

Notes:
- undo/redo is wrapped where applicable using Blockbench.edit/Undo.
- preview capture falls back to canvas toDataURL; ensure a renderable viewport.
- export currently writes a session snapshot JSON; format-specific codecs to be extended.
- support is limited to the latest Blockbench desktop release (older versions untested).`,
    variant: 'desktop',
    onload() {
      claimSingleton();
      const blockbench = readGlobals().Blockbench;
      const session = new ProjectSession();
      const logger = new ConsoleLogger(PLUGIN_ID, () => logLevel);
      logger.info('plugin loading', { version: PLUGIN_VERSION, schema: TOOL_SCHEMA_VERSION });
      registerSettings({ readGlobals, serverConfig, policies, restartServer });
    registerLogSettings({
      readGlobals,
      getLogLevel: () => logLevel,
      setLogLevel: (level) => {
        logLevel = level;
      }
    });
    registerFormatSettings({ readGlobals, formatOverrides });
    registerExportPolicySetting({ readGlobals, policies });
      const editor = new BlockbenchEditor(logger);
      const host = new BlockbenchHost();
      const formats = new BlockbenchFormats();
      const snapshot = new BlockbenchSnapshot(logger);
      const exporter = new BlockbenchExport(logger);
      const textureRenderer = new BlockbenchTextureRenderer();
      const dom = new BlockbenchDom();
      const tmpStore = new LocalTmpStore();
      const previewCapability = {
        pngOnly: true,
        fixedOutput: 'single' as const,
        turntableOutput: 'sequence' as const,
        response: 'content' as const
      };
      const capabilities = computeCapabilities(
        blockbench?.version,
        formats.listFormats(),
        formatOverrides,
        previewCapability
      );
      capabilities.toolRegistry = { hash: TOOL_REGISTRY_HASH, count: TOOL_REGISTRY_COUNT };
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
        resources: resourceStore,
        policies
      });
      const dispatcher = new ToolDispatcherImpl(session, capabilities, service, {
        includeStateByDefault: () => policies.autoIncludeState,
        includeDiffByDefault: () => policies.autoIncludeDiff,
        logger
      });
      const proxy = new ProxyRouter(service, dom, logger, capabilities.limits, {
        includeStateByDefault: () => policies.autoIncludeState,
        includeDiffByDefault: () => policies.autoIncludeDiff
      });
      globalDispatcher = dispatcher;
      globalProxy = proxy;

      registerCodecs(capabilities, session, formats);
    registerDebugMenu({ readGlobals, capabilities });
    registerDevReloadAction({ readGlobals });
    registerInspectorAction({ readGlobals });
    registerServerConfigAction({ readGlobals, serverConfig, restartServer });
      restartServer();

      exposeBridge({
        invoke: dispatcher.handle.bind(dispatcher),
        invokeProxy: (tool: ProxyTool, payload: unknown) =>
          proxy.handle(tool, payload as ApplyModelSpecPayload | ApplyTextureSpecPayload | ApplyUvSpecPayload | ApplyEntitySpecPayload),
        capabilities,
        serverConfig: () => ({ ...serverConfig }),
        settings: () => ({ ...serverConfig })
      });

      blockbench?.showQuickMessage?.('bbmcp v' + PLUGIN_VERSION + ' loaded', 1200);
    },
    onunload() {
      const blockbench = readGlobals().Blockbench;
      cleanupRuntime();
      deleteGlobalValue(INSTANCE_KEY);
      blockbench?.showQuickMessage?.('bbmcp unloaded', 1200);
    }
  });
};

function isThenable(value: unknown): value is { then: (onFulfilled: (arg: unknown) => unknown) => unknown } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { then?: unknown };
  return typeof candidate.then === 'function';
}
