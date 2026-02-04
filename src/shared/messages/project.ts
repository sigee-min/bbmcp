export const PROJECT_NO_ACTIVE = 'No active project.';
export const PROJECT_MATCH_FORMAT_REQUIRED = 'format is required when match includes format.';
export const PROJECT_MATCH_NAME_REQUIRED = 'name is required when match includes name.';
export const PROJECT_CREATE_REQUIREMENTS = 'format and name are required to create a new project.';
export const PROJECT_CREATE_REQUIREMENTS_ON_MISSING_FIX = 'Provide format and name or set onMissing=error.';
export const PROJECT_CREATE_REQUIREMENTS_ON_MISMATCH_FIX = 'Provide format and name or set onMismatch=reuse/error.';
export const PROJECT_FORMAT_UNKNOWN = 'Active project format is unknown.';
export const PROJECT_MISMATCH = 'Active project does not match requested criteria.';
export const PROJECT_DELETE_NAME_REQUIRED = 'target.name is required when action=delete.';
export const PROJECT_DELETE_NAME_REQUIRED_FIX = 'Provide target.name matching the open project.';
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


