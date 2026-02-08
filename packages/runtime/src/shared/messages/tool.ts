export const DIMENSION_POSITIVE_MESSAGE = (label: string, axis?: string | null) =>
  `${label} must be ${axis ? 'a positive number' : 'positive numbers'}.`;
export const DIMENSION_INTEGER_MESSAGE = (label: string, axis?: string | null) =>
  `${label} must be ${axis ? 'an integer' : 'integers'}.`;

export const NON_EMPTY_STRING_MESSAGE = (label: string) => `${label} must be a non-empty string.`;
export const ID_NAME_MISMATCH_MESSAGE = (
  kind: string,
  idLabel: string,
  nameLabel: string,
  plural: string,
  id: string,
  name: string
) => `${kind} ${idLabel} and ${nameLabel} refer to different ${plural} (${id}, ${name}).`;
export const TARGET_NAME_AMBIGUOUS = (kind: string, name: string) =>
  `Multiple ${kind} entries named: ${name}. Use id to disambiguate.`;

export const TOOL_RESPONSE_MALFORMED = 'malformed tool response';
export const TOOL_ERROR_GENERIC = 'tool error';
export const TOOL_FIX_INVALID_PAYLOAD = 'Check the input parameters and retry';
export const TOOL_FIX_INVALID_STATE = 'Call get_project_state and retry';
export const TOOL_FIX_NOT_IMPLEMENTED = 'This operation is not available in the current host';
export const TOOL_FIX_UNSUPPORTED_FORMAT = 'Use list_capabilities to pick a supported format';
export const TOOL_FIX_NO_CHANGE = 'Adjust the input and retry';
export const TOOL_FIX_IO_ERROR = 'Check file paths and permissions and retry';
export const TOOL_FIX_UNKNOWN = 'Retry the operation or check logs';
export const TOOL_HINT_INVALID_PAYLOAD = 'Invalid payload.';
export const TOOL_HINT_INVALID_STATE = 'Invalid state.';
export const TOOL_HINT_NOT_IMPLEMENTED = 'Not implemented.';
export const TOOL_HINT_UNSUPPORTED_FORMAT = 'Unsupported format.';
export const TOOL_HINT_NO_CHANGE = 'No changes detected.';
export const TOOL_HINT_IO_ERROR = 'I/O error.';
export const TOOL_HINT_UNKNOWN = 'Unknown error.';

export const REVISION_REQUIRED_MESSAGE = 'ifRevision is required. Call get_project_state before mutating.';
export const REVISION_REQUIRED_FIX = 'Call get_project_state and retry with ifRevision set to the returned revision.';
export const REVISION_MISMATCH_MESSAGE = 'Project revision mismatch. Refresh project state before retrying.';
export const REVISION_MISMATCH_FIX = 'Call get_project_state and retry with the latest revision.';


