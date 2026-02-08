import type { ToolName } from '../toolConstants';

export const VIEWPORT_EFFECTS = ['none', 'geometry', 'texture', 'animation', 'project'] as const;

export type ViewportEffect = typeof VIEWPORT_EFFECTS[number];

export const TOOL_VIEWPORT_EFFECTS: Record<ToolName, ViewportEffect> = {
  list_capabilities: 'none',
  get_project_state: 'none',
  read_texture: 'none',
  export_trace_log: 'none',
  reload_plugins: 'none',
  paint_faces: 'texture',
  paint_mesh_face: 'texture',
  ensure_project: 'project',
  delete_texture: 'texture',
  assign_texture: 'texture',
  add_bone: 'geometry',
  update_bone: 'geometry',
  delete_bone: 'geometry',
  add_cube: 'geometry',
  update_cube: 'geometry',
  delete_cube: 'geometry',
  add_mesh: 'geometry',
  update_mesh: 'geometry',
  delete_mesh: 'geometry',
  create_animation_clip: 'animation',
  update_animation_clip: 'animation',
  delete_animation_clip: 'animation',
  set_frame_pose: 'animation',
  set_trigger_keyframes: 'animation',
  export: 'none',
  render_preview: 'none',
  validate: 'none'
};

export const getViewportEffectForTool = (tool: ToolName): ViewportEffect => TOOL_VIEWPORT_EFFECTS[tool];
