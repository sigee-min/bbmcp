import type { McpContentBlock, NextAction, ToolError, ToolResponse } from '../types';
import { errFromDomain, toolError } from './toolResponse';
import { isRecord } from '../domain/guards';
import { TOOL_ERROR_GENERIC, TOOL_RESPONSE_MALFORMED } from '../shared/messages';

type GuardContext = { source?: string };

const isToolError = (value: unknown): value is ToolError => {
  if (!isRecord(value)) return false;
  return typeof value.code === 'string' && typeof value.message === 'string';
};

const normalizeActions = (value: unknown): NextAction[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry) => isRecord(entry)) as NextAction[];
};

const normalizeContent = (value: unknown): McpContentBlock[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry) => isRecord(entry)) as McpContentBlock[];
};

export const normalizeToolResponseShape = (value: unknown, context: GuardContext = {}): ToolResponse<unknown> => {
  if (!isRecord(value) || typeof value.ok !== 'boolean') {
    return {
      ok: false,
      error: toolError('unknown', TOOL_RESPONSE_MALFORMED, {
        reason: 'malformed_tool_response',
        source: context.source ?? 'unknown'
      })
    };
  }
  if (value.ok) {
    const content = normalizeContent(value.content);
    const nextActions = normalizeActions(value.nextActions);
    return {
      ok: true,
      data: 'data' in value ? (value as { data?: unknown }).data : undefined,
      ...(content ? { content } : {}),
      ...('structuredContent' in value ? { structuredContent: value.structuredContent } : {}),
      ...(nextActions ? { nextActions } : {})
    };
  }
  const error = isToolError(value.error)
    ? value.error
    : toolError('unknown', TOOL_ERROR_GENERIC, {
        reason: 'malformed_tool_error',
        source: context.source ?? 'unknown'
      });
  const content = normalizeContent(value.content);
  const nextActions = normalizeActions(value.nextActions);
  return {
    ok: false,
    error,
    ...(content ? { content } : {}),
    ...('structuredContent' in value ? { structuredContent: value.structuredContent } : {}),
    ...(nextActions ? { nextActions } : {})
  };
};

export const normalizeToolResponse = (
  value: unknown,
  options: { source?: string; ensureReason?: boolean; preserveContent?: boolean } = {}
): ToolResponse<unknown> => {
  const normalized = normalizeToolResponseShape(value, { source: options.source });
  if (normalized.ok || !options.ensureReason) return normalized;
  const details = { ...(normalized.error.details ?? {}) };
  if (typeof details.reason !== 'string' || details.reason.length === 0) {
    details.reason = normalized.error.code;
  }
  const error = { ...normalized.error, details };
  if (options.preserveContent) {
    return { ...normalized, error };
  }
  return errFromDomain(error);
};
