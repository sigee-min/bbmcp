export const FORMAT_KINDS = ['Java Block/Item', 'geckolib', 'animated_java'] as const;
export type FormatKind = typeof FORMAT_KINDS[number];

export const PROJECT_STATE_DETAILS = ['summary', 'full'] as const;
export type ProjectStateDetail = typeof PROJECT_STATE_DETAILS[number];

export const TOOL_NAMES = [
  'list_capabilities',
  'get_project_state',
  'read_texture',
  'reload_plugins',
  'generate_texture_preset',
  'auto_uv_atlas',
  'set_project_texture_resolution',
  'preflight_texture',
  'ensure_project',
  'block_pipeline',
  'delete_texture',
  'assign_texture',
  'set_face_uv',
  'add_bone',
  'update_bone',
  'delete_bone',
  'add_cube',
  'update_cube',
  'delete_cube',
  'export',
  'render_preview',
  'validate'
] as const;
export type ToolName = typeof TOOL_NAMES[number];

export const PROXY_TOOL_NAMES = [
  'apply_texture_spec',
  'apply_uv_spec',
  'entity_pipeline',
  'model_pipeline',
  'texture_pipeline',
  'render_preview',
  'validate'
] as const;
export type ProxyTool = typeof PROXY_TOOL_NAMES[number];

export const ENSURE_PROJECT_MATCHES = ['none', 'format', 'name', 'format_and_name'] as const;
export type EnsureProjectMatch = typeof ENSURE_PROJECT_MATCHES[number];

export const ENSURE_PROJECT_ON_MISMATCH = ['reuse', 'error', 'create'] as const;
export type EnsureProjectOnMismatch = typeof ENSURE_PROJECT_ON_MISMATCH[number];

export const ENSURE_PROJECT_ON_MISSING = ['create', 'error'] as const;
export type EnsureProjectOnMissing = typeof ENSURE_PROJECT_ON_MISSING[number];

export const TEXTURE_PRESET_NAMES = [
  'painted_metal',
  'rubber',
  'glass',
  'wood',
  'dirt',
  'plant',
  'stone',
  'sand',
  'leather',
  'fabric',
  'ceramic'
] as const;
export type TexturePresetName = typeof TEXTURE_PRESET_NAMES[number];

export const CUBE_FACE_DIRECTIONS = ['north', 'south', 'east', 'west', 'up', 'down'] as const;
export type CubeFaceDirection = typeof CUBE_FACE_DIRECTIONS[number];

export const RIG_TEMPLATE_KINDS = ['empty', 'biped', 'quadruped', 'block_entity'] as const;
export type RigTemplateKind = typeof RIG_TEMPLATE_KINDS[number];

export const ENTITY_FORMATS = ['geckolib', 'modded_entity', 'optifine_entity'] as const;
export type EntityFormat = typeof ENTITY_FORMATS[number];

export const GECKOLIB_TARGET_VERSIONS = ['v3', 'v4'] as const;
export type GeckoLibTargetVersion = typeof GECKOLIB_TARGET_VERSIONS[number];

export const ENTITY_ANIMATION_CHANNELS = ['rot', 'pos', 'scale'] as const;
export type EntityAnimationChannel = typeof ENTITY_ANIMATION_CHANNELS[number];

export const ENTITY_ANIMATION_TRIGGER_TYPES = ['sound', 'particle', 'timeline'] as const;
export type EntityAnimationTriggerType = typeof ENTITY_ANIMATION_TRIGGER_TYPES[number];

export const PREVIEW_MODES = ['fixed', 'turntable'] as const;
export type PreviewMode = typeof PREVIEW_MODES[number];

export const PREVIEW_OUTPUTS = ['single', 'sequence'] as const;
export type PreviewOutput = typeof PREVIEW_OUTPUTS[number];
