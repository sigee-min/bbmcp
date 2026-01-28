import { hashTextToHex } from '../shared/hash';
import { JsonSchema, McpToolDefinition } from './types';
import { toolSchemas } from './toolSchemas';

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
      'Ensures a usable project. Reuses the active project by default and can create a new one when missing or on mismatch (per options). Use match/onMismatch/onMissing to control behavior.',
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
    name: 'model_pipeline',
    title: 'Model Pipeline',
    description:
      'High-level modeling pipeline: applies a structured ModelSpec with create/merge/replace/patch semantics, optional preview/validate/export, and returns a detailed report.',
    inputSchema: toolSchemas.model_pipeline
  }),
  defineTool({
    name: 'texture_pipeline',
    title: 'Texture Pipeline',
    description:
      'Macro: runs the standard texture workflow in one call and returns nextActions for follow-ups when needed.',
    inputSchema: toolSchemas.texture_pipeline
  }),
  defineTool({
    name: 'entity_pipeline',
    title: 'Entity Pipeline',
    description: 'High-level entity pipeline (model + textures + animations) with GeckoLib targeting.',
    inputSchema: toolSchemas.entity_pipeline
  }),
  defineTool({
    name: 'block_pipeline',
    title: 'Block Pipeline',
    description: 'Generates Minecraft blockstate + block/item models and exposes them as MCP resources.',
    inputSchema: toolSchemas.block_pipeline
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
    name: 'generate_texture_preset',
    title: 'Generate Texture Preset',
    description: 'Procedural texture preset painting with uvPaint mapping.',
    inputSchema: toolSchemas.generate_texture_preset
  }),
  defineTool({
    name: 'auto_uv_atlas',
    title: 'Auto UV Atlas',
    description: 'Plans or applies UV atlas packing; may grow texture resolution.',
    inputSchema: toolSchemas.auto_uv_atlas
  }),
  defineTool({
    name: 'set_project_texture_resolution',
    title: 'Set Project Texture Resolution',
    description: 'Updates project texture resolution (optionally scaling UVs).',
    inputSchema: toolSchemas.set_project_texture_resolution
  }),
  defineTool({
    name: 'preflight_texture',
    title: 'Preflight Texture',
    description: 'Computes uvUsageId + mapping and reports UV warnings.',
    inputSchema: toolSchemas.preflight_texture
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
    name: 'set_face_uv',
    title: 'Set Face UV',
    description: 'Sets per-face UV coordinates for a cube.',
    inputSchema: toolSchemas.set_face_uv
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
    description: 'Deletes a bone by id/name.',
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
    description: 'Deletes a cube by id/name.',
    inputSchema: toolSchemas.delete_cube
  }),
  defineTool({
    name: 'apply_uv_spec',
    title: 'Apply UV Spec',
    description: 'High-level UV assignment with uvUsageId guards.',
    inputSchema: toolSchemas.apply_uv_spec
  }),
  defineTool({
    name: 'apply_texture_spec',
    title: 'Apply Texture Spec',
    description: 'Paints textures via deterministic ops + uvPaint mapping.',
    inputSchema: toolSchemas.apply_texture_spec
  })
];

export const buildToolRegistry = (options?: { includeLowLevel?: boolean }): ToolRegistry => {
  const tools = options?.includeLowLevel
    ? [...MCP_HIGH_LEVEL_TOOLS, ...MCP_LOW_LEVEL_TOOLS]
    : MCP_HIGH_LEVEL_TOOLS;
  const map = new Map<string, McpToolDefinition>(tools.map((tool) => [tool.name, tool]));
  const signature = JSON.stringify(tools.map((tool) => ({ name: tool.name, inputSchema: tool.inputSchema })));
  return {
    tools,
    map,
    hash: hashTextToHex(signature),
    count: tools.length
  };
};

export const DEFAULT_TOOL_REGISTRY = buildToolRegistry();

export const MCP_TOOLS = DEFAULT_TOOL_REGISTRY.tools;
export const TOOL_REGISTRY_HASH = DEFAULT_TOOL_REGISTRY.hash;
export const TOOL_REGISTRY_COUNT = DEFAULT_TOOL_REGISTRY.count;

export const getToolSchema = (name: string, registry: ToolRegistry = DEFAULT_TOOL_REGISTRY): JsonSchema | null =>
  registry.map.get(name)?.inputSchema ?? null;

export const isKnownTool = (name: string, registry: ToolRegistry = DEFAULT_TOOL_REGISTRY) =>
  registry.map.has(name);
