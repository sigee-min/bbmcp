import { JsonSchema, McpToolDefinition } from './types';

const numberArray = (minItems: number, maxItems: number): JsonSchema => ({
  type: 'array',
  items: { type: 'number' },
  minItems,
  maxItems
});

const emptyObject: JsonSchema = { type: 'object', additionalProperties: false };
const cubeFaceSchema: JsonSchema = {
  type: 'string',
  enum: ['north', 'south', 'east', 'west', 'up', 'down']
};

const texturePresetSchema: JsonSchema = {
  type: 'string',
  enum: [
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
  ]
};

const textureOpSchema: JsonSchema = {
  type: 'object',
  required: ['op'],
  additionalProperties: false,
  properties: {
    op: { type: 'string', enum: ['set_pixel', 'fill_rect', 'draw_rect', 'draw_line'] },
    x: { type: 'number' },
    y: { type: 'number' },
    width: { type: 'number' },
    height: { type: 'number' },
    x1: { type: 'number' },
    y1: { type: 'number' },
    x2: { type: 'number' },
    y2: { type: 'number' },
    color: { type: 'string' },
    lineWidth: { type: 'number' }
  }
};

const faceUvSchema: JsonSchema = {
  type: 'object',
  minProperties: 1,
  additionalProperties: false,
  properties: {
    north: numberArray(4, 4),
    south: numberArray(4, 4),
    east: numberArray(4, 4),
    west: numberArray(4, 4),
    up: numberArray(4, 4),
    down: numberArray(4, 4)
  }
};

const modelPartSchema: JsonSchema = {
  type: 'object',
  required: ['id', 'size', 'offset'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    size: numberArray(3, 3),
    offset: numberArray(3, 3),
    uv: numberArray(2, 2),
    inflate: { type: 'number' },
    mirror: { type: 'boolean' },
    pivot: numberArray(3, 3),
    parent: { type: 'string' }
  }
};

const modelSpecSchema: JsonSchema = {
  type: 'object',
  required: ['rigTemplate', 'parts'],
  additionalProperties: false,
  properties: {
    rigTemplate: { type: 'string', enum: ['empty', 'biped', 'quadruped', 'block_entity'] },
    parts: {
      type: 'array',
      items: modelPartSchema
    }
  }
};

const stateProps: Record<string, JsonSchema> = {
  includeState: { type: 'boolean' }
};

const metaProps: Record<string, JsonSchema> = {
  includeState: { type: 'boolean' },
  includeDiff: { type: 'boolean' },
  diffDetail: { type: 'string', enum: ['summary', 'full'] }
};

const toolSchemas: Record<string, JsonSchema> = {
  list_capabilities: emptyObject,
  get_project_state: {
    type: 'object',
    additionalProperties: false,
    properties: {
      detail: { type: 'string', enum: ['summary', 'full'] }
    }
  },
  read_texture: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string' },
      name: { type: 'string' }
    }
  },
  reload_plugins: {
    type: 'object',
    required: ['confirm'],
    additionalProperties: false,
    properties: {
      confirm: { type: 'boolean' },
      delayMs: { type: 'number' }
    }
  },
  generate_texture_preset: {
    type: 'object',
    required: ['preset', 'width', 'height'],
    additionalProperties: false,
    properties: {
      preset: texturePresetSchema,
      width: { type: 'number' },
      height: { type: 'number' },
      name: { type: 'string' },
      targetId: { type: 'string' },
      targetName: { type: 'string' },
      mode: { type: 'string', enum: ['create', 'update'] },
      seed: { type: 'number' },
      palette: { type: 'array', items: { type: 'string' } },
      ifRevision: { type: 'string' },
      ...metaProps
    }
  },
  ensure_project: {
    type: 'object',
    additionalProperties: false,
    properties: {
      format: { type: 'string', enum: ['Java Block/Item', 'geckolib', 'animated_java'] },
      name: { type: 'string' },
      match: { type: 'string', enum: ['none', 'format', 'name', 'format_and_name'] },
      onMismatch: { type: 'string', enum: ['reuse', 'error', 'create'] },
      onMissing: { type: 'string', enum: ['create', 'error'] },
      confirmDiscard: { type: 'boolean' },
      confirmDialog: { type: 'boolean' },
      dialog: { type: 'object', additionalProperties: true },
      ifRevision: { type: 'string' },
      ...metaProps
    }
  },
  generate_block_pipeline: {
    type: 'object',
    required: ['name', 'texture'],
    additionalProperties: false,
    properties: {
      name: { type: 'string' },
      texture: { type: 'string' },
      namespace: { type: 'string' },
      variants: {
        type: 'array',
        minItems: 1,
        items: { type: 'string', enum: ['block', 'slab', 'stairs', 'wall'] }
      },
      textures: {
        type: 'object',
        additionalProperties: false,
        properties: {
          top: { type: 'string' },
          side: { type: 'string' },
          bottom: { type: 'string' }
        }
      },
      onConflict: { type: 'string', enum: ['error', 'overwrite', 'versioned'] },
      mode: { type: 'string', enum: ['json_only', 'with_blockbench'] },
      ifRevision: { type: 'string' }
    }
  },
  set_project_texture_resolution: {
    type: 'object',
    required: ['width', 'height'],
    additionalProperties: false,
    properties: {
      width: { type: 'number' },
      height: { type: 'number' },
      modifyUv: { type: 'boolean' },
      ifRevision: { type: 'string' },
      ...metaProps
    }
  },
  preflight_texture: {
    type: 'object',
    additionalProperties: false,
    properties: {
      textureId: { type: 'string' },
      textureName: { type: 'string' },
      includeUsage: { type: 'boolean' }
    }
  },
  delete_texture: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      ifRevision: { type: 'string' },
      ...metaProps
    }
  },
  assign_texture: {
    type: 'object',
    additionalProperties: false,
    properties: {
      textureId: { type: 'string' },
      textureName: { type: 'string' },
      cubeIds: { type: 'array', items: { type: 'string' } },
      cubeNames: { type: 'array', items: { type: 'string' } },
      faces: { type: 'array', minItems: 1, items: cubeFaceSchema },
      ifRevision: { type: 'string' },
      ...metaProps
    }
  },
  set_face_uv: {
    type: 'object',
    required: ['faces'],
    additionalProperties: false,
    properties: {
      cubeId: { type: 'string' },
      cubeName: { type: 'string' },
      faces: faceUvSchema,
      ifRevision: { type: 'string' },
      ...metaProps
    }
  },
  add_bone: {
    type: 'object',
    required: ['name', 'pivot'],
    additionalProperties: false,
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      parent: { type: 'string' },
      parentId: { type: 'string' },
      pivot: numberArray(3, 3),
      rotation: numberArray(3, 3),
      scale: numberArray(3, 3),
      ifRevision: { type: 'string' },
      ...metaProps
    }
  },
  update_bone: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      newName: { type: 'string' },
      parent: { type: 'string' },
      parentId: { type: 'string' },
      parentRoot: { type: 'boolean' },
      pivot: numberArray(3, 3),
      rotation: numberArray(3, 3),
      scale: numberArray(3, 3),
      ifRevision: { type: 'string' },
      ...metaProps
    }
  },
  delete_bone: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      ifRevision: { type: 'string' },
      ...metaProps
    }
  },
  add_cube: {
    type: 'object',
    required: ['name', 'from', 'to'],
    additionalProperties: false,
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      from: numberArray(3, 3),
      to: numberArray(3, 3),
      bone: { type: 'string' },
      boneId: { type: 'string' },
      uv: numberArray(2, 2),
      inflate: { type: 'number' },
      mirror: { type: 'boolean' },
      ifRevision: { type: 'string' },
      ...metaProps
    }
  },
  update_cube: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      newName: { type: 'string' },
      bone: { type: 'string' },
      boneId: { type: 'string' },
      boneRoot: { type: 'boolean' },
      from: numberArray(3, 3),
      to: numberArray(3, 3),
      uv: numberArray(2, 2),
      inflate: { type: 'number' },
      mirror: { type: 'boolean' },
      ifRevision: { type: 'string' },
      ...metaProps
    }
  },
  delete_cube: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      ifRevision: { type: 'string' },
      ...metaProps
    }
  },
  apply_rig_template: {
    type: 'object',
    required: ['templateId'],
    additionalProperties: false,
    properties: {
      templateId: { type: 'string' },
      ifRevision: { type: 'string' },
      ...metaProps
    }
  },
  export: {
    type: 'object',
    required: ['format', 'destPath'],
    additionalProperties: false,
    properties: {
      format: { enum: ['java_block_item_json', 'gecko_geo_anim', 'animated_java'] },
      destPath: { type: 'string' },
      ...stateProps
    }
  },
  render_preview: {
    type: 'object',
    required: ['mode'],
    additionalProperties: false,
    properties: {
      mode: { enum: ['fixed', 'turntable'] },
      angle: numberArray(2, 3),
      clip: { type: 'string' },
      timeSeconds: { type: 'number' },
      durationSeconds: { type: 'number' },
      fps: { type: 'number' },
      output: { enum: ['single', 'sequence'] },
      ...stateProps
    }
  },
  validate: {
    type: 'object',
    additionalProperties: false,
    properties: {
      ...stateProps
    }
  },
  apply_model_spec: {
    type: 'object',
    required: ['model'],
    additionalProperties: false,
    properties: {
      model: modelSpecSchema,
      ifRevision: { type: 'string' },
      ...metaProps
    }
  },
  apply_texture_spec: {
    type: 'object',
    required: ['textures'],
    additionalProperties: false,
    properties: {
      textures: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['width', 'height'],
          additionalProperties: false,
          properties: {
            mode: { type: 'string', enum: ['create', 'update'] },
            id: { type: 'string' },
            targetId: { type: 'string' },
            targetName: { type: 'string' },
            name: { type: 'string' },
            width: { type: 'number' },
            height: { type: 'number' },
            background: { type: 'string' },
            useExisting: { type: 'boolean' },
            ops: {
              type: 'array',
              items: textureOpSchema
            }
          }
        }
      },
      ifRevision: { type: 'string' },
      ...metaProps
    }
  },

};

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'list_capabilities',
    title: 'List Capabilities',
    description: 'Returns plugin capabilities and limits. Tool schemas are strict (extra fields are rejected).',
    inputSchema: toolSchemas.list_capabilities
  },
  {
    name: 'get_project_state',
    title: 'Get Project State',
    description:
      'Returns the current project state (summary by default). Summary includes texture metadata and textureResolution. Full detail includes textureUsage (per-face mappings) when available.',
    inputSchema: toolSchemas.get_project_state
  },
  {
    name: 'read_texture',
    title: 'Read Texture',
    description:
      'Developer tool: reads a texture image (PNG) by id or name. Returns MCP image content plus structured metadata. Requires an active project.',
    inputSchema: toolSchemas.read_texture
  },
  {
    name: 'reload_plugins',
    title: 'Reload Plugins',
    description:
      'Schedules a Blockbench plugin reload using Plugins.devReload (developer-only). Requires confirm=true. Optional delayMs (default 100) to allow the MCP response to flush before reload.',
    inputSchema: toolSchemas.reload_plugins
  },
  {
    name: 'generate_texture_preset',
    title: 'Generate Texture Preset',
    description:
      'Generates a procedural texture preset without local files. Use for 64x64+ textures to avoid large ops payloads. Requires ifRevision; call get_project_state first. mode=create needs name; mode=update needs targetId/targetName.',
    inputSchema: toolSchemas.generate_texture_preset
  },
  {
    name: 'ensure_project',
    title: 'Ensure Project',
    description:
      'Ensures a usable project. Reuses the active project by default and can create a new one when missing or on mismatch (per options). Use match/onMismatch/onMissing to control behavior.',
    inputSchema: toolSchemas.ensure_project
  },
  {
    name: 'generate_block_pipeline',
    title: 'Generate Block Pipeline',
    description:
      'Generates Minecraft block assets (blockstates + models + item models) using vanilla parents. Returns JSON in structuredContent and also stores them as MCP resources. mode=with_blockbench creates a new Java Block/Item project named after name and adds a base cube (requires ifRevision).',
    inputSchema: toolSchemas.generate_block_pipeline
  },
  {
    name: 'set_project_texture_resolution',
    title: 'Set Project Texture Resolution',
    description:
      'Sets the project texture resolution (width/height). Requires ifRevision; call get_project_state first. Set modifyUv=true to scale existing UVs to the new resolution (if supported). This does not resize existing textures; use it before creating textures. If you change resolution after painting, repaint using the new UV mapping. If UVs exceed the current resolution, increase it (width >= 2*(w+d), height >= 2*(h+d), round up to 32/64/128) or split textures per material.',
    inputSchema: toolSchemas.set_project_texture_resolution
  },
  {
    name: 'preflight_texture',
    title: 'Preflight Texture',
    description:
      'Returns UV bounds, usage summary, and a recommended texture resolution based on current face UVs. Use this before painting to avoid out-of-bounds UVs. Set includeUsage=true to include the full textureUsage mapping table.',
    inputSchema: toolSchemas.preflight_texture
  },
  {
    name: 'delete_texture',
    title: 'Delete Texture',
    description: 'Deletes a texture by id or name. Requires ifRevision; call get_project_state first.',
    inputSchema: toolSchemas.delete_texture
  },
  {
    name: 'assign_texture',
    title: 'Assign Texture',
    description:
      'Assigns a texture to cubes/faces without changing UVs (forces per-face UV mode; auto UV disabled). Requires ifRevision; call get_project_state first. Use this after apply_texture_spec. Omit cubeIds/cubeNames to apply to all cubes. Use set_face_uv to define per-face UVs explicitly. If UVs change after painting, repaint using the updated mapping. Prefer material-group textures (pot/soil/plant) and assign by cubeNames for stability. If UVs exceed the current textureResolution, increase it or split textures per material.',
    inputSchema: toolSchemas.assign_texture
  },
  {
    name: 'set_face_uv',
    title: 'Set Face UV',
    description:
      'Sets per-face UVs for a cube (manual UV only; auto UV disabled). Requires ifRevision; call get_project_state first. Provide cubeId or cubeName plus a faces map (e.g., {north:[x1,y1,x2,y2], up:[x1,y1,x2,y2]}). UVs are in texture pixels and must fit within the project textureResolution; if they exceed it, increase resolution or split textures. If you change UVs after painting, repaint using the new mapping.',
    inputSchema: toolSchemas.set_face_uv
  },
  {
    name: 'add_bone',
    title: 'Add Bone',
    description: 'Adds a bone to the current project. Requires ifRevision; call get_project_state first.',
    inputSchema: toolSchemas.add_bone
  },
  {
    name: 'update_bone',
    title: 'Update Bone',
    description: 'Updates a bone (rename, transform, or reparent). Requires ifRevision; call get_project_state first.',
    inputSchema: toolSchemas.update_bone
  },
  {
    name: 'delete_bone',
    title: 'Delete Bone',
    description: 'Deletes a bone (and its descendants). Requires ifRevision; call get_project_state first.',
    inputSchema: toolSchemas.delete_bone
  },
  {
    name: 'add_cube',
    title: 'Add Cube',
    description:
      'Adds a cube to the given bone. Requires ifRevision; call get_project_state first. If uv is provided it must fit within the project textureResolution. Texture binding is separate; use assign_texture.',
    inputSchema: toolSchemas.add_cube
  },
  {
    name: 'update_cube',
    title: 'Update Cube',
    description:
      'Updates a cube (rename, transform, or reparent). Requires ifRevision; call get_project_state first. If uv is provided it must fit within the project textureResolution.',
    inputSchema: toolSchemas.update_cube
  },
  {
    name: 'delete_cube',
    title: 'Delete Cube',
    description: 'Deletes a cube. Requires ifRevision; call get_project_state first.',
    inputSchema: toolSchemas.delete_cube
  },
  {
    name: 'apply_rig_template',
    title: 'Apply Rig Template',
    description:
      'Applies a rig template to the project. Use this for additive rigging; avoid combining with apply_model_spec unless you intend to add more bones/cubes. Requires ifRevision; call get_project_state first.',
    inputSchema: toolSchemas.apply_rig_template
  },
  {
    name: 'export',
    title: 'Export',
    description: 'Exports the current model to a file path. Requires ifRevision; call get_project_state first.',
    inputSchema: toolSchemas.export
  },
  {
    name: 'render_preview',
    title: 'Render Preview',
    description:
      'Renders a preview image. fixed -> single (optional angle). turntable -> sequence. Returns MCP image content blocks (base64 PNG) plus structured metadata without dataUri. Single returns result.image; sequence returns result.frames[]. Example(single): {"mode":"fixed","output":"single","angle":[30,45,0]} Example(sequence): {"mode":"turntable","output":"sequence","durationSeconds":2,"fps":12}',
    inputSchema: toolSchemas.render_preview
  },
  {
    name: 'validate',
    title: 'Validate',
    description: 'Validates the current project.',
    inputSchema: toolSchemas.validate
  },
  {
    name: 'apply_model_spec',
    title: 'Apply Model Spec',
    description:
      'Applies a structured model specification (rigTemplate + parts) to the active project (does not create a new project). Requires ifRevision; call get_project_state first. Textures are handled separately via apply_texture_spec + assign_texture.',
    inputSchema: toolSchemas.apply_model_spec
  },
  {
    name: 'apply_texture_spec',
    title: 'Apply Texture Spec',
    description:
      'Applies a structured texture specification. Requires ifRevision; returns no_change when no pixels change. This creates/updates texture data only; call assign_texture to bind it to cubes, then set_face_uv for manual per-face UVs. Before painting, call preflight_texture to build a UV mapping table and verify with a checker/label texture. If UVs change, repaint using the new mapping. Low opaque coverage is rejected to avoid transparent results; fill a larger area or tighten UVs. width/height are required and must match the intended project textureResolution. Prefer separate textures per material group (pot/soil/plant) rather than one mega-texture. If UVs exceed the current textureResolution, increase it (width >= 2*(w+d), height >= 2*(h+d), round up to 32/64/128) or split textures per material. Use set_project_texture_resolution before creating textures when increasing size. ops are optional; omit ops to create a blank texture (background can still fill). Success responses include report.textureCoverage (opaque ratio + bounds) for each rendered texture.',
    inputSchema: toolSchemas.apply_texture_spec
  },
];

const hashText = (value: string): string => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
};

const toolRegistrySignature = () =>
  JSON.stringify(MCP_TOOLS.map((tool) => ({ name: tool.name, inputSchema: tool.inputSchema })));

export const TOOL_REGISTRY_HASH = hashText(toolRegistrySignature());
export const TOOL_REGISTRY_COUNT = MCP_TOOLS.length;

export const getToolSchema = (name: string): JsonSchema | null => toolSchemas[name] ?? null;

export const isKnownTool = (name: string) => Boolean(toolSchemas[name]);

