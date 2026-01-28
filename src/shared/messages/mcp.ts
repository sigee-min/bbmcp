export const MCP_VALIDATION_TYPE_MESSAGE = (path: string, schemaType: string) => `${path} must be ${schemaType}`;
export const MCP_VALIDATION_ENUM_MESSAGE = (path: string, values: ReadonlyArray<unknown>) =>
  `${path} must be one of ${values.join(', ')}`;
export const MCP_VALIDATION_MIN_ITEMS_MESSAGE = (path: string, minItems: number) =>
  `${path} must have at least ${minItems} items`;
export const MCP_VALIDATION_MAX_ITEMS_MESSAGE = (path: string, maxItems: number) =>
  `${path} must have at most ${maxItems} items`;
export const MCP_VALIDATION_REQUIRED_MESSAGE = (path: string, key: string) => `${path}.${key} is required`;
export const MCP_VALIDATION_NOT_ALLOWED_MESSAGE = (path: string, key: string) => `${path}.${key} is not allowed`;

export const MCP_ROUTE_NOT_FOUND = 'not found';
export const MCP_UNAUTHORIZED = 'unauthorized';
export const MCP_METHOD_NOT_ALLOWED = 'method not allowed';
export const MCP_ACCEPT_SSE_REQUIRED = 'accept text/event-stream required';
export const MCP_SESSION_ID_REQUIRED = 'Mcp-Session-Id required';
export const MCP_TOO_MANY_SSE = 'too many SSE connections';
export const MCP_CONTENT_TYPE_REQUIRED = 'content-type must be application/json';
export const MCP_JSONRPC_PARSE_ERROR = 'Parse error';
export const MCP_JSONRPC_INVALID_REQUEST = 'Invalid Request';
export const MCP_UNSUPPORTED_PROTOCOL = (version: string) => `Unsupported protocol version: ${version}`;
export const MCP_INITIALIZE_REQUIRES_ID = 'initialize requires id';
export const MCP_SESSION_UNAVAILABLE = 'Session unavailable';
export const MCP_SERVER_NOT_INITIALIZED = 'Server not initialized';
export const MCP_URI_REQUIRED = 'uri is required';
export const MCP_RESOURCE_NOT_FOUND = 'Resource not found';
export const MCP_METHOD_NOT_FOUND = (method: string) => `Method not found: ${method}`;
export const MCP_TOOL_NAME_REQUIRED = 'Tool name is required';
export const MCP_UNKNOWN_TOOL = (name: string) => `Unknown tool: ${name}`;
export const MCP_PROTOCOL_VERSION_MISMATCH = 'MCP-Protocol-Version mismatch';
export const MCP_TOOL_EXECUTION_FAILED = 'tool execution failed';
export const MCP_PAYLOAD_READ_FAILED = 'payload read failed';
export const MCP_PAYLOAD_TOO_LARGE = 'payload too large';
export const MCP_REQUEST_ERROR = 'request error';
export const MCP_REQUEST_ABORTED = 'request aborted';
export const MCP_REQUEST_CLOSED = 'request closed';
export const MCP_REQUEST_TIMEOUT = 'request timeout';
export const MCP_INVALID_REQUEST_LINE = 'invalid request line';
export const MCP_INVALID_CONTENT_LENGTH = 'invalid content-length';
