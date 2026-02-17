export const PROJECT_STATE_DETAILS = ['summary', 'full'] as const;

export const TOOL_NAMES = [
  'list_capabilities',
  'get_project_state',
  'preflight_texture',
  'read_texture',
  'export_trace_log',
  'reload_plugins',
  'paint_faces',
  'ensure_project',
  'delete_texture',
  'assign_texture',
  'add_bone',
  'update_bone',
  'delete_bone',
  'add_cube',
  'update_cube',
  'delete_cube',
  'create_animation_clip',
  'update_animation_clip',
  'delete_animation_clip',
  'set_frame_pose',
  'set_trigger_keyframes',
  'export',
  'render_preview',
  'validate'
] as const;

export const ENSURE_PROJECT_MATCHES = ['none', 'name'] as const;
export const ENSURE_PROJECT_ON_MISMATCH = ['reuse', 'error', 'create'] as const;
export const ENSURE_PROJECT_ON_MISSING = ['create', 'error'] as const;
export const ENSURE_PROJECT_ACTIONS = ['ensure', 'delete'] as const;

export const CUBE_FACE_DIRECTIONS = ['north', 'south', 'east', 'west', 'up', 'down'] as const;

export const PREVIEW_MODES = ['fixed', 'turntable'] as const;
export const PREVIEW_OUTPUTS = ['single', 'sequence'] as const;
