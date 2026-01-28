export const PLUGIN_LOG_PREVIOUS_CLEANUP_FAILED = 'previous instance cleanup failed';
export const PLUGIN_LOG_LOADING = 'plugin loading';
export const PLUGIN_LOG_SERVER_WEB_MODE = 'MCP server not started (web mode)';
export const PLUGIN_LOG_INLINE_SERVER_UNAVAILABLE = 'Inline MCP server unavailable; starting sidecar';
export const PLUGIN_LOG_SIDECAR_FAILED = 'MCP sidecar failed to start';

export const PLUGIN_UI_EXPORT_FAILED_PREFIX = 'bbmcp export failed: ';
export const PLUGIN_UI_EXPORT_COMPLETE = 'bbmcp export complete';
export const PLUGIN_UI_EXPORT_FAILED_GENERIC = 'export failed';
export const PLUGIN_UI_LOADED = (version: string) => `bbmcp v${version} loaded`;
export const PLUGIN_UI_UNLOADED = 'bbmcp unloaded';
export const PLUGIN_UI_DEVRELOAD_UNAVAILABLE = 'Plugins.devReload not available';
export const PLUGIN_UI_CAPABILITIES_TITLE = 'bbmcp capabilities';
export const PLUGIN_UI_PLUGIN_STATE_TITLE = 'bbmcp plugin state';
export const PLUGIN_UI_PROMPT_HOST = 'MCP host';
export const PLUGIN_UI_PROMPT_PORT = 'MCP port';
export const PLUGIN_UI_PROMPT_PATH = 'MCP path';
export const PLUGIN_UI_ENDPOINT_MESSAGE = (host: string, port: number, path: string) =>
  `MCP endpoint: ${host}:${port}${path}`;
export const PLUGIN_UI_EXPORT_FAILED = (message: string) => `${PLUGIN_UI_EXPORT_FAILED_PREFIX}${message}`;
