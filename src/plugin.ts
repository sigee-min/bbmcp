import {
  computeCapabilities,
  PLUGIN_ID,
  PLUGIN_VERSION,
  TOOL_SCHEMA_VERSION,
  DEFAULT_SERVER_HOST,
  DEFAULT_SERVER_PORT,
  DEFAULT_SERVER_PATH
} from './config';
import { ProjectSession } from './session';
import { ToolDispatcherImpl } from './dispatcher';
import { Capabilities, Dispatcher, ExportPayload, FormatKind } from './types';
import { ProxyRouter } from './proxy';
import { ConsoleLogger, LogLevel } from './logging';
import {
  ApplyEntitySpecPayload,
  ApplyModelSpecPayload,
  ApplyTextureSpecPayload,
  ApplyUvSpecPayload,
  ProxyTool
} from './spec';
import { SidecarProcess } from './sidecar/SidecarProcess';
import { SidecarLaunchConfig } from './sidecar/types';
import { ToolService } from './usecases/ToolService';
import type { ExportPolicy } from './usecases/policies';
import { BlockbenchEditor } from './adapters/blockbench/BlockbenchEditor';
import { BlockbenchHost } from './adapters/blockbench/BlockbenchHost';
import { BlockbenchFormats } from './adapters/blockbench/BlockbenchFormats';
import { BlockbenchSnapshot } from './adapters/blockbench/BlockbenchSnapshot';
import { BlockbenchExport } from './adapters/blockbench/BlockbenchExport';
import { BlockbenchTextureRenderer } from './adapters/blockbench/BlockbenchTextureRenderer';
import { FormatOverrides, resolveFormatId } from './services/format';
import { buildInternalExport } from './services/exporters';
import { DEFAULT_UV_POLICY } from './domain/uvPolicy';
import { BLOCK_PIPELINE_RESOURCE_TEMPLATES } from './services/blockPipeline';
import { GUIDE_RESOURCE_TEMPLATES, GUIDE_RESOURCES } from './services/guides';
import { InMemoryResourceStore } from './services/resources';
import { LocalTmpStore } from './services/tmpStore';
import { startServer } from './server';
import { UnknownRecord, readBlockbenchGlobals } from './types/blockbench';
import { TOOL_REGISTRY_COUNT, TOOL_REGISTRY_HASH } from './mcp/tools';

const readGlobals = () => readBlockbenchGlobals();

type ServerSettings = SidecarLaunchConfig & {
  enabled: boolean;
  autoDiscardUnsaved: boolean;
  autoAttachActiveProject: boolean;
  autoIncludeState: boolean;
  autoIncludeDiff: boolean;
  requireRevision: boolean;
  autoRetryRevision: boolean;
};

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
let globalDispatcher: Dispatcher;
let globalProxy: ProxyRouter;

function registerDebugMenu(dispatcher: Dispatcher, capabilities: Capabilities) {
  const globals = readGlobals();
  const blockbench = globals.Blockbench;
  const menuBar = globals.MenuBar;
  if (!blockbench || !menuBar) return;
  const action = {
    id: `${PLUGIN_ID}_debug_capabilities`,
    name: 'bbmcp: show capabilities',
    icon: 'info',
    click: () => {
      blockbench.textPrompt?.(
        'bbmcp capabilities',
        JSON.stringify(capabilities, null, 2),
        () => {}
      );
    }
  };
  menuBar.addAction(action, 'help');
}

function registerDevReloadAction() {
  const globals = readGlobals();
  const blockbench = globals.Blockbench;
  const menuBar = globals.MenuBar;
  const plugins = globals.Plugins;
  if (!blockbench || !menuBar) return;
  const action = {
    id: `${PLUGIN_ID}_dev_reload`,
    name: 'bbmcp: dev reload plugins',
    icon: 'refresh',
    click: () => {
      if (typeof plugins?.devReload === 'function') {
        plugins.devReload();
        blockbench.showQuickMessage?.('bbmcp unloaded', 1200);
      } else {
        blockbench.showQuickMessage?.('Plugins.devReload not available', 1200);
      }
    }
  };
  menuBar.addAction(action, 'help');
}

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
  const globalObj = globalThis as UnknownRecord & { bbmcp?: BbmcpBridge };
  globalObj.bbmcp = bridge;
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
          { host: serverConfig.host, port: serverConfig.port, path: serverConfig.path },
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
        execPath: serverConfig.execPath
      };
      sidecar = new SidecarProcess(endpoint, globalDispatcher, globalProxy, logger);
      if (!sidecar.start()) {
        sidecar = null;
        logger.warn('MCP sidecar failed to start');
      }
    }
}

function registerInspectorAction() {
  const globals = readGlobals();
  const menuBar = globals.MenuBar;
  const blockbench = globals.Blockbench;
  if (!menuBar || !blockbench) return;
  const action = {
    id: `${PLUGIN_ID}_inspect_plugins`,
    name: 'bbmcp: log plugin state',
    icon: 'search',
    click: () => {
      const plugins = readGlobals().Plugins;
      const path = plugins?.path;
      const registered = plugins?.registered;
      console.log('[bbmcp] Plugins.path', path);
      console.log('[bbmcp] Plugins.registered keys', registered ? Object.keys(registered) : 'n/a');
      blockbench.showQuickMessage?.('Logged plugin state to console.', 1200);
    }
  };
  menuBar.addAction(action, 'help');
}

function registerServerConfigAction() {
  const globals = readGlobals();
  const menuBar = globals.MenuBar;
  const blockbench = globals.Blockbench;
  if (!menuBar || !blockbench) return;
  const action = {
    id: `${PLUGIN_ID}_server_config`,
    name: 'bbmcp: set MCP endpoint',
    icon: 'settings',
    click: async () => {
      const host = await blockbench.textPrompt?.('MCP host', serverConfig.host, () => {});
      if (typeof host === 'string' && host.length > 0) {
        serverConfig.host = host;
      }
      const portStr = await blockbench.textPrompt?.('MCP port', String(serverConfig.port), () => {});
      const portNum = parseInt(portStr ?? `${serverConfig.port}`, 10);
      if (!Number.isNaN(portNum)) {
        serverConfig.port = portNum;
      }
      const path = await blockbench.textPrompt?.('MCP path', serverConfig.path, () => {});
      if (typeof path === 'string' && path.length > 0) {
        serverConfig.path = path.startsWith('/') ? path : `/${path}`;
      }
      restartServer();
      blockbench.showQuickMessage?.(
        `MCP endpoint: ${serverConfig.host}:${serverConfig.port}${serverConfig.path}`,
        1500
      );
    }
  };
  menuBar.addAction(action, 'help');
}

function registerSettings() {
  const globals = readGlobals();
  const SettingCtor = globals.Setting;
  if (typeof SettingCtor === 'undefined') return;
  type SettingType = 'text' | 'number' | 'toggle';
  type SettingId = keyof ServerSettings;
  const settings: Array<{
    id: SettingId;
    name: string;
    type: SettingType;
    value: ServerSettings[SettingId];
    description?: string;
  }> = [
    {
      id: 'enabled',
      name: 'MCP Server Enabled',
      type: 'toggle',
      value: serverConfig.enabled,
      description: 'Enable MCP HTTP server'
    },
    {
      id: 'execPath',
      name: 'Sidecar Exec Path',
      type: 'text',
      value: serverConfig.execPath ?? '',
      description: 'Optional sidecar executable (node or full path)'
    },
    {
      id: 'autoDiscardUnsaved',
      name: 'Auto Discard Unsaved Project',
      type: 'toggle',
      value: serverConfig.autoDiscardUnsaved,
      description: 'Automatically discard unsaved changes when creating a new project'
    },
    {
      id: 'autoAttachActiveProject',
      name: 'Auto Attach Active Project',
      type: 'toggle',
      value: serverConfig.autoAttachActiveProject,
      description: 'Automatically attach the active project when no session is set'
    },
    {
      id: 'autoIncludeState',
      name: 'Auto Include Project State',
      type: 'toggle',
      value: serverConfig.autoIncludeState,
      description: 'Include summary project state in tool responses by default'
    },
    {
      id: 'autoIncludeDiff',
      name: 'Auto Include Project Diff',
      type: 'toggle',
      value: serverConfig.autoIncludeDiff,
      description: 'Include project diff in tool responses by default (requires ifRevision)'
    },
    {
      id: 'requireRevision',
      name: 'Require Revision for Mutations',
      type: 'toggle',
      value: serverConfig.requireRevision,
      description: 'Require ifRevision on mutation tools to guard against stale state'
    },
    {
      id: 'autoRetryRevision',
      name: 'Auto Retry on Revision Mismatch',
      type: 'toggle',
      value: serverConfig.autoRetryRevision,
      description: 'Retry once on revision mismatch using the latest project state'
    },
    { id: 'host', name: 'MCP Host', type: 'text', value: serverConfig.host, description: 'MCP server host' },
    { id: 'port', name: 'MCP Port', type: 'number', value: serverConfig.port, description: 'MCP server port' },
    { id: 'path', name: 'MCP Path', type: 'text', value: serverConfig.path, description: 'MCP server path' }
  ];

  const applySetting = (id: SettingId, value: unknown, shouldRestart = true) => {
    if (id === 'enabled') {
      serverConfig.enabled = Boolean(value);
    } else if (id === 'execPath') {
      const next = String(value ?? '').trim();
      serverConfig.execPath = next.length > 0 ? next : undefined;
    } else if (id === 'autoDiscardUnsaved') {
      const enabled = Boolean(value);
      serverConfig.autoDiscardUnsaved = enabled;
      policies.autoDiscardUnsaved = enabled;
    } else if (id === 'autoAttachActiveProject') {
      const enabled = Boolean(value);
      serverConfig.autoAttachActiveProject = enabled;
      policies.autoAttachActiveProject = enabled;
    } else if (id === 'autoIncludeState') {
      const enabled = Boolean(value);
      serverConfig.autoIncludeState = enabled;
      policies.autoIncludeState = enabled;
    } else if (id === 'autoIncludeDiff') {
      const enabled = Boolean(value);
      serverConfig.autoIncludeDiff = enabled;
      policies.autoIncludeDiff = enabled;
    } else if (id === 'requireRevision') {
      const enabled = Boolean(value);
      serverConfig.requireRevision = enabled;
      policies.requireRevision = enabled;
    } else if (id === 'autoRetryRevision') {
      const enabled = Boolean(value);
      serverConfig.autoRetryRevision = enabled;
      policies.autoRetryRevision = enabled;
    } else if (id === 'host') {
      serverConfig.host = String(value);
    } else if (id === 'port') {
      const parsed = parseInt(String(value ?? serverConfig.port), 10);
      if (!Number.isNaN(parsed)) serverConfig.port = parsed;
    } else if (id === 'path') {
      const next = String(value ?? '');
      serverConfig.path = next.startsWith('/') ? next : `/${next}`;
    }
    if (shouldRestart) restartServer();
  };

  settings.forEach((s) => {
    const setting = new SettingCtor(`${PLUGIN_ID}_${s.id}`, {
      name: s.name,
      category: PLUGIN_ID,
      plugin: PLUGIN_ID,
      type: s.type,
      value: s.value,
      description: s.description,
      onChange: (v: unknown) => {
        applySetting(s.id, v);
      }
    });
    applySetting(s.id, setting?.value ?? s.value, false);
  });
}

function registerFormatSettings() {
  const globals = readGlobals();
  const SettingCtor = globals.Setting;
  if (typeof SettingCtor === 'undefined') return;
  type FormatKey = keyof FormatOverrides;
  const apply = (key: FormatKey, value: unknown) => {
    const next = String(value ?? '').trim();
    if (next.length > 0) {
      formatOverrides[key] = next;
    } else {
      delete formatOverrides[key];
    }
  };

  const entries: Array<{ id: string; name: string; key: FormatKey }> = [
    { id: 'format_java_block_item', name: 'Format ID (Java Block/Item)', key: 'Java Block/Item' },
    { id: 'format_geckolib', name: 'Format ID (geckolib)', key: 'geckolib' },
    { id: 'format_animated_java', name: 'Format ID (animated_java)', key: 'animated_java' }
  ];

  entries.forEach((entry) => {
    const setting = new SettingCtor(`${PLUGIN_ID}_${entry.id}`, {
      name: entry.name,
      category: PLUGIN_ID,
      plugin: PLUGIN_ID,
      type: 'text',
      value: formatOverrides[entry.key] ?? '',
      description: 'Override format ID when auto-detect fails',
      onChange: (v: unknown) => {
        apply(entry.key, v);
      }
    });
    apply(entry.key, setting?.value ?? '');
  });
}
function registerExportPolicySetting() {
  const globals = readGlobals();
  const SettingCtor = globals.Setting;
  if (typeof SettingCtor === 'undefined') return;
  const apply = (value: unknown) => {
    const enabled = Boolean(value);
    policies.exportPolicy = enabled ? 'strict' : 'best_effort';
  };

  const setting = new SettingCtor(`${PLUGIN_ID}_export_strict`, {
    name: 'Strict Export (no fallback)',
    category: PLUGIN_ID,
    plugin: PLUGIN_ID,
    type: 'toggle',
    value: policies.exportPolicy === 'strict',
    description: 'Require native compile; disable internal fallback',
    onChange: (v: unknown) => {
      apply(v);
    }
  });
  apply(setting?.value ?? (policies.exportPolicy === 'strict'));
}

function registerLogSettings() {
  const globals = readGlobals();
  const SettingCtor = globals.Setting;
  if (typeof SettingCtor === 'undefined') return;
  const apply = (value: unknown) => {
    logLevel = Boolean(value) ? 'debug' : 'info';
  };

  const setting = new SettingCtor(PLUGIN_ID + '_diagnostic_logs', {
    name: 'Diagnostic Logging',
    category: PLUGIN_ID,
    plugin: PLUGIN_ID,
    type: 'toggle',
    value: logLevel === 'debug',
    description: 'Enable verbose logs for troubleshooting',
    onChange: (v: unknown) => {
      apply(v);
    }
  });
  apply(setting?.value ?? (logLevel === 'debug'));
}

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
    console.log(`[bbmcp] loading... v${PLUGIN_VERSION} schema ${TOOL_SCHEMA_VERSION}`);
    const blockbench = readGlobals().Blockbench;
    const session = new ProjectSession();
    const logger = new ConsoleLogger(PLUGIN_ID, () => logLevel);
    registerSettings();
    registerLogSettings();
    registerFormatSettings();
    registerExportPolicySetting();
    const editor = new BlockbenchEditor(logger);
    const host = new BlockbenchHost();
    const formats = new BlockbenchFormats();
    const snapshot = new BlockbenchSnapshot(logger);
    const exporter = new BlockbenchExport(logger);
    const textureRenderer = new BlockbenchTextureRenderer();
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
      includeDiffByDefault: () => policies.autoIncludeDiff
    });
    const proxy = new ProxyRouter(service, logger, capabilities.limits, {
      includeStateByDefault: () => policies.autoIncludeState,
      includeDiffByDefault: () => policies.autoIncludeDiff
    });
    globalDispatcher = dispatcher;
    globalProxy = proxy;

    registerCodecs(capabilities, session, formats);
    registerDebugMenu(dispatcher, capabilities);
    registerDevReloadAction();
    registerInspectorAction();
    registerServerConfigAction();
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
    if (inlineServerStop) {
      inlineServerStop();
      inlineServerStop = null;
    }
    if (sidecar) {
      sidecar.stop();
      sidecar = null;
    }
    blockbench?.showQuickMessage?.('bbmcp unloaded', 1200);
  }
});

function isThenable(value: unknown): value is { then: (onFulfilled: (arg: unknown) => unknown) => unknown } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { then?: unknown };
  return typeof candidate.then === 'function';
}


















