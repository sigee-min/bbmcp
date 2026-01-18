export type FormatKind = 'vanilla' | 'geckolib' | 'animated_java';

export type ProjectStateDetail = 'summary' | 'full';

export interface IncludeStateOption {
  includeState?: boolean;
}

export interface IncludeDiffOption {
  includeDiff?: boolean;
  diffDetail?: ProjectStateDetail;
}

export interface IfRevisionOption {
  ifRevision?: string;
}

export type ToolErrorCode =
  | 'unsupported_format'
  | 'not_implemented'
  | 'invalid_state'
  | 'invalid_payload'
  | 'io_error'
  | 'unknown';

export interface ToolError {
  code: ToolErrorCode;
  message: string;
  fix?: string;
  details?: Record<string, unknown>;
}

export type McpTextContent = { type: 'text'; text: string };

export type McpImageContent = { type: 'image'; data: string; mimeType: string };

export type McpContentBlock = McpTextContent | McpImageContent;

export type ToolResponse<T> =
  | { ok: true; data: T; content?: McpContentBlock[]; structuredContent?: unknown }
  | { ok: false; error: ToolError; content?: McpContentBlock[]; structuredContent?: unknown };
