import {
  CUBE_FACE_DIRECTIONS,
  ENSURE_PROJECT_ACTIONS,
  ENSURE_PROJECT_MATCHES,
  ENSURE_PROJECT_ON_MISMATCH,
  ENSURE_PROJECT_ON_MISSING,
  FORMAT_KINDS,
  PROJECT_STATE_DETAILS,
  TOOL_NAMES
} from '../mcpSchemas/constants';

export type FormatKind = typeof FORMAT_KINDS[number];
export type ProjectStateDetail = typeof PROJECT_STATE_DETAILS[number];
export type ToolName = typeof TOOL_NAMES[number];
export type EnsureProjectMatch = typeof ENSURE_PROJECT_MATCHES[number];
export type EnsureProjectOnMismatch = typeof ENSURE_PROJECT_ON_MISMATCH[number];
export type EnsureProjectOnMissing = typeof ENSURE_PROJECT_ON_MISSING[number];
export type EnsureProjectAction = typeof ENSURE_PROJECT_ACTIONS[number];
export type CubeFaceDirection = typeof CUBE_FACE_DIRECTIONS[number];

export {
  CUBE_FACE_DIRECTIONS,
  ENSURE_PROJECT_ACTIONS,
  ENSURE_PROJECT_MATCHES,
  ENSURE_PROJECT_ON_MISMATCH,
  ENSURE_PROJECT_ON_MISSING,
  FORMAT_KINDS,
  PROJECT_STATE_DETAILS,
  TOOL_NAMES
};

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
  | 'invalid_state_revision_mismatch'
  | 'invalid_payload'
  | 'no_change'
  | 'io_error'
  | 'unknown';

export interface ToolError {
  code: ToolErrorCode;
  message: string;
  fix?: string;
  details?: Record<string, unknown>;
}

export type NextActionRef =
  | {
      kind: 'tool';
      tool: string;
      pointer: string;
      note?: string;
    }
  | {
      kind: 'user';
      hint: string;
    };

export type NextActionValueRef = { $ref: NextActionRef };

export type NextActionArgPrimitive = string | number | boolean | null;

export type NextActionArgValue =
  | NextActionArgPrimitive
  | NextActionValueRef
  | NextActionArgValue[]
  | { [key: string]: NextActionArgValue };

export type NextActionArgs = Record<string, NextActionArgValue>;

export type NextAction =
  | {
      type: 'call_tool';
      tool: string;
      arguments: NextActionArgs;
      reason: string;
      priority?: number;
    }
  | {
      type: 'read_resource';
      uri: string;
      reason: string;
      priority?: number;
    }
  | {
      type: 'ask_user';
      question: string;
      reason: string;
      priority?: number;
    }
  | {
      type: 'noop';
      reason: string;
      priority?: number;
    };

export type McpTextContent = { type: 'text'; text: string };

export type McpImageContent = { type: 'image'; data: string; mimeType: string };

export type McpContentBlock = McpTextContent | McpImageContent;

export type ToolResponse<T> =
  | { ok: true; data: T; content?: McpContentBlock[]; structuredContent?: unknown; nextActions?: NextAction[] }
  | { ok: false; error: ToolError; content?: McpContentBlock[]; structuredContent?: unknown; nextActions?: NextAction[] };

export type ToolErrorResponse = Extract<ToolResponse<unknown>, { ok: false }>;
