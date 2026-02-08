export const MCP_VALIDATION_TYPE_MESSAGE = (path: string, schemaType: string) => `${path} must be ${schemaType}`;
export const MCP_VALIDATION_ENUM_MESSAGE = (path: string, values: ReadonlyArray<unknown>) =>
  `${path} must be one of ${values.join(', ')}`;
export const MCP_VALIDATION_MIN_ITEMS_MESSAGE = (path: string, minItems: number) =>
  `${path} must have at least ${minItems} items`;
export const MCP_VALIDATION_MAX_ITEMS_MESSAGE = (path: string, maxItems: number) =>
  `${path} must have at most ${maxItems} items`;
export const MCP_VALIDATION_REQUIRED_MESSAGE = (path: string, key: string) => `${path}.${key} is required`;
export const MCP_VALIDATION_NOT_ALLOWED_MESSAGE = (path: string, key: string) => `${path}.${key} is not allowed`;
export const MCP_VALIDATION_ANY_OF_MESSAGE = (path: string, candidates?: string[]) =>
  candidates && candidates.length > 0
    ? `${path} must include one of: ${candidates.join(', ')}`
    : `${path} must satisfy one of the allowed schemas`;
