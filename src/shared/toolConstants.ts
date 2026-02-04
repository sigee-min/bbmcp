import { TEXTURE_PRESET_NAMES } from './texturePolicy';

export const FORMAT_KINDS = ['Java Block/Item', 'geckolib', 'animated_java'] as const;
export type FormatKind = typeof FORMAT_KINDS[number];

export const PROJECT_STATE_DETAILS = ['summary', 'full'] as const;
export type ProjectStateDetail = typeof PROJECT_STATE_DETAILS[number];

export const TOOL_NAMES = [
  'list_capabilities',
  'get_project_state',
  'read_texture',
  'export_trace_log',
  'reload_plugins',
  'generate_texture_preset',
  'auto_uv_atlas',
  'set_project_texture_resolution',
  'preflight_texture',
  'ensure_project',
  'delete_texture',
  'assign_texture',
  'set_face_uv',
  'add_bone',
  'update_bone',
  'delete_bone',
  'add_cube',
  'update_cube',
  'delete_cube',
  'create_animation_clip',
  'update_animation_clip',
  'delete_animation_clip',
  'set_keyframes',
  'set_trigger_keyframes',
  'export',
  'render_preview',
  'validate'
] as const;
export type ToolName = typeof TOOL_NAMES[number];

export const ENSURE_PROJECT_MATCHES = ['none', 'format', 'name', 'format_and_name'] as const;
export type EnsureProjectMatch = typeof ENSURE_PROJECT_MATCHES[number];

export const ENSURE_PROJECT_ON_MISMATCH = ['reuse', 'error', 'create'] as const;
export type EnsureProjectOnMismatch = typeof ENSURE_PROJECT_ON_MISMATCH[number];

export const ENSURE_PROJECT_ON_MISSING = ['create', 'error'] as const;
export type EnsureProjectOnMissing = typeof ENSURE_PROJECT_ON_MISSING[number];

export const ENSURE_PROJECT_ACTIONS = ['ensure', 'delete'] as const;
export type EnsureProjectAction = typeof ENSURE_PROJECT_ACTIONS[number];

export { TEXTURE_PRESET_NAMES } from './texturePolicy';
export type TexturePresetName = typeof TEXTURE_PRESET_NAMES[number];

export const CUBE_FACE_DIRECTIONS = ['north', 'south', 'east', 'west', 'up', 'down'] as const;
export type CubeFaceDirection = typeof CUBE_FACE_DIRECTIONS[number];

export const PREVIEW_MODES = ['fixed', 'turntable'] as const;
export type PreviewMode = typeof PREVIEW_MODES[number];

export const PREVIEW_OUTPUTS = ['single', 'sequence'] as const;
export type PreviewOutput = typeof PREVIEW_OUTPUTS[number];



