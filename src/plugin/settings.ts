import { PLUGIN_ID } from '../config';
import type { FormatOverrides } from '../services/format';
import type { ExportPolicy } from '../usecases/policies';
import type { LogLevel } from '../logging';
import type { ReadGlobals, ServerSettings } from './types';

type PolicySettings = {
  autoDiscardUnsaved: boolean;
  autoAttachActiveProject: boolean;
  autoIncludeState: boolean;
  autoIncludeDiff: boolean;
  requireRevision: boolean;
  autoRetryRevision: boolean;
  exportPolicy: ExportPolicy;
  exposeLowLevelTools: boolean;
};

export const registerSettings = (deps: {
  readGlobals: ReadGlobals;
  serverConfig: ServerSettings;
  policies: PolicySettings;
  restartServer: () => void;
}) => {
  const globals = deps.readGlobals();
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
      value: deps.serverConfig.enabled,
      description: 'Enable MCP HTTP server'
    },
    {
      id: 'execPath',
      name: 'Sidecar Exec Path',
      type: 'text',
      value: deps.serverConfig.execPath ?? '',
      description: 'Optional sidecar executable (node or full path)'
    },
    {
      id: 'autoDiscardUnsaved',
      name: 'Auto Discard Unsaved Project',
      type: 'toggle',
      value: deps.serverConfig.autoDiscardUnsaved,
      description: 'Automatically discard unsaved changes when creating a new project'
    },
    {
      id: 'autoAttachActiveProject',
      name: 'Auto Attach Active Project',
      type: 'toggle',
      value: deps.serverConfig.autoAttachActiveProject,
      description: 'Automatically attach the active project when no session is set'
    },
    {
      id: 'autoIncludeState',
      name: 'Auto Include Project State',
      type: 'toggle',
      value: deps.serverConfig.autoIncludeState,
      description: 'Include summary project state in tool responses by default'
    },
    {
      id: 'autoIncludeDiff',
      name: 'Auto Include Project Diff',
      type: 'toggle',
      value: deps.serverConfig.autoIncludeDiff,
      description: 'Include project diff in tool responses by default (requires ifRevision)'
    },
    {
      id: 'requireRevision',
      name: 'Require Revision for Mutations',
      type: 'toggle',
      value: deps.serverConfig.requireRevision,
      description: 'Require ifRevision on mutation tools to guard against stale state'
    },
    {
      id: 'autoRetryRevision',
      name: 'Auto Retry on Revision Mismatch',
      type: 'toggle',
      value: deps.serverConfig.autoRetryRevision,
      description: 'Retry once on revision mismatch using the latest project state'
    },
    {
      id: 'exposeLowLevelTools',
      name: 'Expose Low-Level Tools (Expert)',
      type: 'toggle',
      value: deps.serverConfig.exposeLowLevelTools,
      description: 'Expose low-level tools in tools/list (requires server restart)'
    },
    { id: 'host', name: 'MCP Host', type: 'text', value: deps.serverConfig.host, description: 'MCP server host' },
    { id: 'port', name: 'MCP Port', type: 'number', value: deps.serverConfig.port, description: 'MCP server port' },
    { id: 'path', name: 'MCP Path', type: 'text', value: deps.serverConfig.path, description: 'MCP server path' }
  ];

  const applySetting = (id: SettingId, value: unknown, shouldRestart = true) => {
    if (id === 'enabled') {
      deps.serverConfig.enabled = Boolean(value);
    } else if (id === 'execPath') {
      const next = String(value ?? '').trim();
      deps.serverConfig.execPath = next.length > 0 ? next : undefined;
    } else if (id === 'autoDiscardUnsaved') {
      const enabled = Boolean(value);
      deps.serverConfig.autoDiscardUnsaved = enabled;
      deps.policies.autoDiscardUnsaved = enabled;
    } else if (id === 'autoAttachActiveProject') {
      const enabled = Boolean(value);
      deps.serverConfig.autoAttachActiveProject = enabled;
      deps.policies.autoAttachActiveProject = enabled;
    } else if (id === 'autoIncludeState') {
      const enabled = Boolean(value);
      deps.serverConfig.autoIncludeState = enabled;
      deps.policies.autoIncludeState = enabled;
    } else if (id === 'autoIncludeDiff') {
      const enabled = Boolean(value);
      deps.serverConfig.autoIncludeDiff = enabled;
      deps.policies.autoIncludeDiff = enabled;
    } else if (id === 'requireRevision') {
      const enabled = Boolean(value);
      deps.serverConfig.requireRevision = enabled;
      deps.policies.requireRevision = enabled;
    } else if (id === 'autoRetryRevision') {
      const enabled = Boolean(value);
      deps.serverConfig.autoRetryRevision = enabled;
      deps.policies.autoRetryRevision = enabled;
    } else if (id === 'exposeLowLevelTools') {
      const enabled = Boolean(value);
      deps.serverConfig.exposeLowLevelTools = enabled;
      deps.policies.exposeLowLevelTools = enabled;
    } else if (id === 'host') {
      deps.serverConfig.host = String(value);
    } else if (id === 'port') {
      const parsed = parseInt(String(value ?? deps.serverConfig.port), 10);
      if (!Number.isNaN(parsed)) deps.serverConfig.port = parsed;
    } else if (id === 'path') {
      const next = String(value ?? '');
      deps.serverConfig.path = next.startsWith('/') ? next : `/${next}`;
    }
    if (shouldRestart) deps.restartServer();
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
};

export const registerFormatSettings = (deps: { readGlobals: ReadGlobals; formatOverrides: FormatOverrides }) => {
  const globals = deps.readGlobals();
  const SettingCtor = globals.Setting;
  if (typeof SettingCtor === 'undefined') return;
  type FormatKey = keyof FormatOverrides;
  const apply = (key: FormatKey, value: unknown) => {
    const next = String(value ?? '').trim();
    if (next.length > 0) {
      deps.formatOverrides[key] = next;
    } else {
      delete deps.formatOverrides[key];
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
      value: deps.formatOverrides[entry.key] ?? '',
      description: 'Override format ID when auto-detect fails',
      onChange: (v: unknown) => {
        apply(entry.key, v);
      }
    });
    apply(entry.key, setting?.value ?? '');
  });
};

export const registerExportPolicySetting = (deps: { readGlobals: ReadGlobals; policies: PolicySettings }) => {
  const globals = deps.readGlobals();
  const SettingCtor = globals.Setting;
  if (typeof SettingCtor === 'undefined') return;
  const apply = (value: unknown) => {
    const enabled = Boolean(value);
    deps.policies.exportPolicy = enabled ? 'strict' : 'best_effort';
  };

  const setting = new SettingCtor(`${PLUGIN_ID}_export_strict`, {
    name: 'Strict Export (no fallback)',
    category: PLUGIN_ID,
    plugin: PLUGIN_ID,
    type: 'toggle',
    value: deps.policies.exportPolicy === 'strict',
    description: 'Require native compile; disable internal fallback',
    onChange: (v: unknown) => {
      apply(v);
    }
  });
  apply(setting?.value ?? (deps.policies.exportPolicy === 'strict'));
};

export const registerLogSettings = (deps: {
  readGlobals: ReadGlobals;
  getLogLevel: () => LogLevel;
  setLogLevel: (level: LogLevel) => void;
}) => {
  const globals = deps.readGlobals();
  const SettingCtor = globals.Setting;
  if (typeof SettingCtor === 'undefined') return;
  const apply = (value: unknown) => {
    deps.setLogLevel(Boolean(value) ? 'debug' : 'info');
  };

  const setting = new SettingCtor(PLUGIN_ID + '_diagnostic_logs', {
    name: 'Diagnostic Logging',
    category: PLUGIN_ID,
    plugin: PLUGIN_ID,
    type: 'toggle',
    value: deps.getLogLevel() === 'debug',
    description: 'Enable verbose logs for troubleshooting',
    onChange: (v: unknown) => {
      apply(v);
    }
  });
  apply(setting?.value ?? (deps.getLogLevel() === 'debug'));
};
