import { hashTextToHex } from '../../shared/hash';
import { McpToolDefinition } from './types';
import { toolSchemas } from '../../shared/mcpSchemas/toolSchemas';

export type ToolRegistry = {
  tools: McpToolDefinition[];
  map: Map<string, McpToolDefinition>;
  hash: string;
  count: number;
};

const defineTool = (tool: McpToolDefinition): McpToolDefinition => tool;

export const MCP_HIGH_LEVEL_TOOLS: McpToolDefinition[] = [
  defineTool({
    name: 'list_capabilities',
    title: 'List Capabilities',
    description: 'Returns plugin capabilities and limits. Tool schemas are strict (extra fields are rejected).',
    inputSchema: toolSchemas.list_capabilities
  }),
  defineTool({
    name: 'ensure_project',
    title: 'Ensure Project',
    description:
      'Ensures a usable project. Reuses the active project by default and can create a new one when missing or on mismatch (per options). Use match/onMismatch/onMissing to control behavior. action="delete" closes the active project (requires target.name).',
    inputSchema: toolSchemas.ensure_project
  }),
  defineTool({
    name: 'get_project_state',
    title: 'Get Project State',
    description:
      'Returns the current project state (summary by default). Summary includes texture metadata and textureResolution. Full detail includes textureUsage (per-face mappings) when available.',
    inputSchema: toolSchemas.get_project_state
  }),
  defineTool({
    name: 'export_trace_log',
    title: 'Export Trace Log',
    description:
      'Flushes the trace log to disk (writeFile/export) and returns the resource URI for the in-memory log.',
    inputSchema: toolSchemas.export_trace_log
  }),
  defineTool({
    name: 'render_preview',
    title: 'Render Preview',
    description:
      'Renders a preview image. fixed -> single (optional angle). turntable -> sequence. Returns MCP image content blocks (base64 PNG) plus structured metadata without dataUri. Set saveToTmp=true to write snapshots into .bbmcp/tmp for manual upload fallback. See bbmcp://guide/vision-fallback via resources/read. Single returns result.image; sequence returns result.frames[]. Example(single): {"mode":"fixed","output":"single","angle":[30,45,0]} Example(sequence): {"mode":"turntable","output":"sequence","durationSeconds":2,"fps":12}',
    inputSchema: toolSchemas.render_preview
  }),
  defineTool({
    name: 'validate',
    title: 'Validate',
    description: 'Validates the current project.',
    inputSchema: toolSchemas.validate
  }),
  defineTool({
    name: 'export',
    title: 'Export',
    description: 'Exports the current project to JSON output.',
    inputSchema: toolSchemas.export
  })
];

export const MCP_LOW_LEVEL_TOOLS: McpToolDefinition[] = [
  defineTool({
    name: 'read_texture',
    title: 'Read Texture',
    description: 'Reads a texture image (dataUri + metadata) or saves a snapshot to .bbmcp/tmp.',
    inputSchema: toolSchemas.read_texture
  }),
  defineTool({
    name: 'reload_plugins',
    title: 'Reload Plugins',
    description: 'Reloads Blockbench plugins (confirm required).',
    inputSchema: toolSchemas.reload_plugins
  }),
  defineTool({
    name: 'paint_faces',
    title: 'Paint Faces',
    description:
      'Paints one cube face with one drawing op (UV handled internally). Default coordSpace=face; use coordSpace=texture with width/height for texture-space coordinates.',
    inputSchema: toolSchemas.paint_faces
  }),
  defineTool({
    name: 'paint_mesh_face',
    title: 'Paint Mesh Face',
    description:
      'Paints mesh face UV regions with one drawing op. Use scope=single_face (target.faceId required) or scope=all_faces. Default coordSpace=face; use coordSpace=texture with width/height for texture-space coordinates.',
    inputSchema: toolSchemas.paint_mesh_face
  }),
  defineTool({
    name: 'delete_texture',
    title: 'Delete Texture',
    description: 'Deletes a texture by id or name.',
    inputSchema: toolSchemas.delete_texture
  }),
  defineTool({
    name: 'assign_texture',
    title: 'Assign Texture',
    description: 'Binds a texture to cubes/faces (no UV edits).',
    inputSchema: toolSchemas.assign_texture
  }),
  defineTool({
    name: 'add_bone',
    title: 'Add Bone',
    description: 'Adds a bone to the current project.',
    inputSchema: toolSchemas.add_bone
  }),
  defineTool({
    name: 'update_bone',
    title: 'Update Bone',
    description: 'Updates a bone by id/name.',
    inputSchema: toolSchemas.update_bone
  }),
  defineTool({
    name: 'delete_bone',
    title: 'Delete Bone',
    description: 'Deletes a bone by id/name (or ids/names for bulk removal).',
    inputSchema: toolSchemas.delete_bone
  }),
  defineTool({
    name: 'add_cube',
    title: 'Add Cube',
    description: 'Adds a cube to the current project.',
    inputSchema: toolSchemas.add_cube
  }),
  defineTool({
    name: 'update_cube',
    title: 'Update Cube',
    description: 'Updates a cube by id/name.',
    inputSchema: toolSchemas.update_cube
  }),
  defineTool({
    name: 'delete_cube',
    title: 'Delete Cube',
    description: 'Deletes a cube by id/name (or ids/names for bulk removal).',
    inputSchema: toolSchemas.delete_cube
  }),
  defineTool({
    name: 'add_mesh',
    title: 'Add Mesh',
    description: 'Adds a mesh with explicit vertices/faces (mesh-centered modeling).',
    inputSchema: toolSchemas.add_mesh
  }),
  defineTool({
    name: 'update_mesh',
    title: 'Update Mesh',
    description: 'Updates mesh geometry/transform by id/name.',
    inputSchema: toolSchemas.update_mesh
  }),
  defineTool({
    name: 'delete_mesh',
    title: 'Delete Mesh',
    description: 'Deletes a mesh by id/name (or ids/names for bulk removal).',
    inputSchema: toolSchemas.delete_mesh
  }),
  defineTool({
    name: 'create_animation_clip',
    title: 'Create Animation Clip',
    description: 'Creates an animation clip (low-level).',
    inputSchema: toolSchemas.create_animation_clip
  }),
  defineTool({
    name: 'update_animation_clip',
    title: 'Update Animation Clip',
    description: 'Updates an animation clip by id/name.',
    inputSchema: toolSchemas.update_animation_clip
  }),
  defineTool({
    name: 'delete_animation_clip',
    title: 'Delete Animation Clip',
    description: 'Deletes an animation clip by id/name (or ids/names for bulk removal).',
    inputSchema: toolSchemas.delete_animation_clip
  }),
  defineTool({
    name: 'set_frame_pose',
    title: 'Set Pose Frame',
    description: 'Sets a pose frame for multiple bones at a single frame (rot/pos/scale).',
    inputSchema: toolSchemas.set_frame_pose
  }),
  defineTool({
    name: 'set_trigger_keyframes',
    title: 'Set Trigger Keyframes',
    description: 'Sets trigger keyframes (sound/particle/timeline), one key per call.',
    inputSchema: toolSchemas.set_trigger_keyframes
  })
];

export const buildToolRegistry = (options?: { includeLowLevel?: boolean }): ToolRegistry => {
  const tools = options?.includeLowLevel ? [...MCP_HIGH_LEVEL_TOOLS, ...MCP_LOW_LEVEL_TOOLS] : MCP_HIGH_LEVEL_TOOLS;
  const map = new Map<string, McpToolDefinition>(tools.map((tool) => [tool.name, tool]));
  const signature = JSON.stringify(tools.map((tool) => ({ name: tool.name, inputSchema: tool.inputSchema })));
  return {
    tools,
    map,
    hash: hashTextToHex(signature),
    count: tools.length
  };
};

export const DEFAULT_TOOL_REGISTRY = buildToolRegistry({ includeLowLevel: true });




