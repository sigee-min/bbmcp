export const PLUGIN_LOG_PREVIOUS_CLEANUP_FAILED = 'previous instance cleanup failed';
export const PLUGIN_LOG_LOADING = 'plugin loading';
export const PLUGIN_LOG_SERVER_WEB_MODE = 'MCP server not started (web mode)';
export const PLUGIN_LOG_INLINE_SERVER_UNAVAILABLE = 'Inline MCP server unavailable; starting sidecar';
export const PLUGIN_LOG_SIDECAR_FAILED = 'MCP sidecar failed to start';

export const PLUGIN_UI_EXPORT_FAILED_PREFIX = 'ashfox export failed: ';
export const PLUGIN_UI_EXPORT_COMPLETE = 'ashfox export complete';
export const PLUGIN_UI_EXPORT_FAILED_GENERIC = 'export failed';
export const PLUGIN_UI_LOADED = (version: string) => `ashfox v${version} loaded`;
export const PLUGIN_UI_UNLOADED = 'ashfox unloaded';
export const PLUGIN_UI_EXPORT_FAILED = (message: string) => `${PLUGIN_UI_EXPORT_FAILED_PREFIX}${message}`;




