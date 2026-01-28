export const CONFIG_HOST_REQUIRED = 'host is required';
export const CONFIG_PORT_RANGE = 'port must be between 1 and 65535';
export const CONFIG_PATH_REQUIRED = 'path is required';
export const CONFIG_PATH_SLASH_REQUIRED = 'path must start with /';
export const SERVER_HTTP_PERMISSION_MESSAGE = 'bbmcp needs HTTP access for the local MCP server.';
export const SERVER_NET_PERMISSION_MESSAGE = 'bbmcp needs network permission to accept MCP connections.';
export const SERVER_NET_PERMISSION_DETAIL = 'bbmcp opens a local server so AI assistants can connect.';
export const SERVER_NO_TRANSPORT = 'http/net modules not available; MCP server not started';
export const SIDECAR_PERMISSION_MESSAGE = 'bbmcp needs permission to run a local MCP sidecar process.';
export const SIDECAR_CHILD_PROCESS_UNAVAILABLE = 'child_process not available; sidecar not started';
export const SIDECAR_PATH_MODULE_UNAVAILABLE = 'path module not available; sidecar not started';
export const SIDECAR_ENTRY_NOT_FOUND = 'sidecar entry not found; expected bbmcp-sidecar.js near plugin';
export const SIDECAR_EXECPATH_UNAVAILABLE = 'execPath unavailable; sidecar not started';
export const SIDECAR_STDIO_UNAVAILABLE = 'sidecar stdio unavailable';
export const SIDECAR_INFLIGHT_LIMIT_REACHED = 'too many in-flight requests';
export const SIDECAR_TOOL_ERROR = 'sidecar error';
export const SIDECAR_RUN_AS_NODE_REJECTED = 'sidecar runtime rejected --run-as-node; retry without it';

export const TMP_STORE_UNAVAILABLE = 'Tmp store is not available.';
export const TMP_STORE_PERMISSION_MESSAGE = 'bbmcp needs filesystem access to store image snapshots.';
export const TMP_STORE_DATA_URI_INVALID = 'Invalid dataUri for image snapshot.';
export const TMP_STORE_FILESYSTEM_UNAVAILABLE = 'Filesystem access unavailable.';
export const TMP_STORE_DIR_CREATE_FAILED = 'Failed to create tmp directory.';
export const TMP_STORE_BASE64_DECODE_FAILED = 'Image base64 decode failed.';
export const TMP_STORE_WRITE_FAILED = 'Failed to write image snapshot.';

export const ADAPTER_ANIMATION_API_UNAVAILABLE = 'Animation API not available';
export const ADAPTER_ANIMATOR_API_UNAVAILABLE = 'Animator API not available';
export const ADAPTER_GROUP_API_UNAVAILABLE = 'Group API not available';
export const ADAPTER_CUBE_API_UNAVAILABLE = 'Cube API not available';
export const ADAPTER_CUBE_TEXTURE_API_UNAVAILABLE = 'Cube/Texture API not available';
export const ADAPTER_CUBE_APPLY_TEXTURE_UNAVAILABLE = 'Cube.applyTexture is not available';
export const ADAPTER_TEXTURE_API_UNAVAILABLE = 'Texture API not available';
export const ADAPTER_TEXTURE_CANVAS_UNAVAILABLE = 'Texture canvas unavailable';
export const ADAPTER_TEXTURE_DATA_UNAVAILABLE = 'Texture data unavailable';
export const ADAPTER_PREVIEW_DATA_URL_INVALID = 'invalid data url';
export const ADAPTER_PREVIEW_DATA_URL_NOT_BASE64 = 'data url is not base64';
export const ADAPTER_PREVIEW_DATA_URL_EMPTY = 'empty base64 payload';
export const ADAPTER_PREVIEW_FIXED_SINGLE_ONLY = 'fixed mode only supports single output';
export const ADAPTER_PREVIEW_FIXED_SINGLE_ONLY_FIX =
  'Set output="single" or use mode="turntable" for a sequence.';
export const ADAPTER_PREVIEW_TURNTABLE_SEQUENCE_ONLY = 'turntable mode only supports sequence output';
export const ADAPTER_PREVIEW_TURNTABLE_SEQUENCE_ONLY_FIX =
  'Set output="sequence" or use mode="fixed" for a single frame.';
export const ADAPTER_PREVIEW_CANVAS_UNAVAILABLE = 'preview canvas not available';
export const ADAPTER_PREVIEW_CANVAS_NO_SIZE = 'preview canvas has no size';
export const ADAPTER_PREVIEW_CONTROLS_UNAVAILABLE = 'preview controls not available for angle';
export const ADAPTER_PREVIEW_CONTROLS_UNAVAILABLE_FIX = 'Open a preview viewport and retry.';
export const ADAPTER_PREVIEW_TURNTABLE_CONTROLS_UNAVAILABLE = 'turntable preview controls not available';
export const ADAPTER_PREVIEW_CLIP_REQUIRED = 'clip is required when timeSeconds is set';
export const ADAPTER_PREVIEW_TIME_NON_NEGATIVE = 'timeSeconds must be >= 0';
export const ADAPTER_PREVIEW_ANGLE_FIXED_ONLY = 'angle is only supported for fixed previews';
export const ADAPTER_PREVIEW_ANGLE_FIXED_ONLY_FIX = 'Remove angle or switch to mode="fixed".';
export const ADAPTER_PREVIEW_FPS_DURATION_POSITIVE = 'fps and durationSeconds must be > 0';
export const ADAPTER_PREVIEW_ANIMATION_CLIP_NOT_FOUND = (name: string) => `animation clip not found: ${name}`;
export const ADAPTER_PROJECT_UNSAVED_CHANGES =
  'Project has unsaved changes. Save or close it before creating a new project.';
export const ADAPTER_PROJECT_CREATE_UNAVAILABLE = 'Blockbench project creation unavailable';
export const ADAPTER_BLOCKBENCH_WRITEFILE_UNAVAILABLE = 'Blockbench.writeFile not available';
export const ADAPTER_PROJECT_DIALOG_INPUT_REQUIRED =
  'Project dialog requires input. Provide ensure_project.dialog values and set confirmDialog=true.';

export const ADAPTER_NATIVE_COMPILER_UNAVAILABLE = (formatId: string) =>
  `Native compiler not available for ${formatId}`;
export const ADAPTER_NATIVE_COMPILER_EMPTY = 'Native compiler returned empty result';
export const ADAPTER_NATIVE_COMPILER_ASYNC_UNSUPPORTED = 'Async compiler not supported';
export const ADAPTER_TEXTURE_RENDERER_DOCUMENT_UNAVAILABLE = 'document unavailable for texture rendering';
export const ADAPTER_PLUGINS_DEVRELOAD_UNAVAILABLE = 'Plugins.devReload not available.';

export const PLUGIN_RELOAD_CONFIRM_REQUIRED = 'confirm=true is required to reload plugins.';
export const PLUGIN_RELOAD_CONFIRM_REQUIRED_FIX = 'Set confirm=true to proceed.';
export const PLUGIN_RELOAD_UNAVAILABLE = 'Plugin reload is not available in this host.';
