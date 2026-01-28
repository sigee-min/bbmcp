export const BLOCK_PIPELINE_NAME_REQUIRED = 'name is required';
export const BLOCK_PIPELINE_TEXTURE_REQUIRED = 'texture is required';
export const BLOCK_PIPELINE_NAMESPACE_INVALID = (value: string) => `Invalid namespace: ${value}`;
export const BLOCK_PIPELINE_NAME_INVALID = (value: string) => `Invalid name: ${value}`;
export const BLOCK_PIPELINE_TOKEN_FIX = 'Use lowercase letters, numbers, underscore, dash, or dot.';
export const BLOCK_PIPELINE_NAME_PREFIX_INVALID = 'name must not include a namespace prefix.';
export const BLOCK_PIPELINE_NAME_PREFIX_FIX = 'Provide only the base name (e.g., adamantium_ore).';
export const BLOCK_PIPELINE_VARIANTS_REQUIRED =
  'variants must include at least one of block, slab, stairs, or wall.';
export const BLOCK_PIPELINE_RESOURCE_STORE_MISSING = 'Resource store is not available.';
export const BLOCK_PIPELINE_RESOURCES_EXIST = 'Resources already exist for this block pipeline.';
export const BLOCK_PIPELINE_VERSIONED_FAILED = 'Could not allocate versioned resource names.';
export const BLOCK_PIPELINE_IFREVISION_REQUIRED = 'ifRevision is required when mode=with_blockbench.';
export const BLOCK_PIPELINE_IFREVISION_FIX = 'Call get_project_state and retry with ifRevision.';
export const BLOCK_PIPELINE_CREATED_NOTE = 'Blockbench project created with a base cube. Import textures separately.';

export const PROJECT_NO_ACTIVE = 'No active project.';
export const PROJECT_MATCH_FORMAT_REQUIRED = 'format is required when match includes format.';
export const PROJECT_MATCH_NAME_REQUIRED = 'name is required when match includes name.';
export const PROJECT_CREATE_REQUIREMENTS = 'format and name are required to create a new project.';
export const PROJECT_CREATE_REQUIREMENTS_ON_MISSING_FIX = 'Provide format and name or set onMissing=error.';
export const PROJECT_CREATE_REQUIREMENTS_ON_MISMATCH_FIX = 'Provide format and name or set onMismatch=reuse/error.';
export const PROJECT_FORMAT_UNKNOWN = 'Active project format is unknown.';
export const PROJECT_MISMATCH = 'Active project does not match requested criteria.';
export const PROJECT_FORMAT_REQUIRED_FOR_TOOL = (expected: string, toolName: string) =>
  `Active project format must be ${expected} for ${toolName}.`;
export const PROJECT_FORMAT_REQUIRED_FOR_TOOL_FIX = (toolName: string, expected: string) =>
  `Call ${toolName} with ensureProject or switch to a ${expected} project.`;
export const PROJECT_UNSUPPORTED_FORMAT = (format: string) => `Unsupported format: ${format}`;
export const PROJECT_FORMAT_ID_MISSING = (format: string) => `No matching format ID for ${format}`;
export const PROJECT_FORMAT_ID_MISSING_FIX = 'Set a format ID override in settings or choose another format.';
export const PROJECT_NAME_REQUIRED_FIX = 'Provide a non-empty project name.';
export const PROJECT_FORMAT_UNSUPPORTED_FIX = 'Use list_capabilities to pick an enabled format.';

export const EXPORT_FORMAT_NOT_ENABLED = (format: string) => `Export format not enabled: ${format}`;
export const EXPORT_FORMAT_MISMATCH = 'Export format does not match active format';
export const EXPORT_FORMAT_ID_MISSING = 'No matching format ID for export';
export const EXPORT_FORMAT_ID_MISSING_FOR_KIND = (kind: string) => `No format ID for ${kind}`;
