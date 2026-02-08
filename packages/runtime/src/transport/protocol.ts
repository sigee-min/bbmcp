import type { ToolError, ToolName, ToolPayloadMap } from '@ashfox/contracts/types/internal';
import { isRecord } from '../domain/guards';
import type { McpContentBlock, NextAction } from '@ashfox/contracts/types/shared';

export const PROTOCOL_VERSION = 1 as const;

export type SidecarRole = 'plugin' | 'sidecar';

export type SidecarHelloMessage = {
  type: 'hello';
  version: number;
  role: SidecarRole;
  ts: number;
};

export type SidecarReadyMessage = {
  type: 'ready';
  version: number;
  ts: number;
};

export type SidecarRequestMessage = {
  type: 'request';
  id: string;
  ts: number;
  tool: ToolName;
  payload: ToolPayloadMap[ToolName] | unknown;
};

export type SidecarResponseMessage = {
  type: 'response';
  id: string;
  ts: number;
  ok: boolean;
  data?: unknown;
  error?: ToolError;
  content?: McpContentBlock[];
  structuredContent?: unknown;
  nextActions?: NextAction[];
};

export type SidecarErrorMessage = {
  type: 'error';
  ts: number;
  id?: string;
  message: string;
  details?: Record<string, unknown>;
};

export type SidecarMessage =
  | SidecarHelloMessage
  | SidecarReadyMessage
  | SidecarRequestMessage
  | SidecarResponseMessage
  | SidecarErrorMessage;

const isToolError = (value: unknown): value is ToolError => {
  if (!isRecord(value)) return false;
  if (typeof value.code !== 'string') return false;
  if (typeof value.message !== 'string') return false;
  if ('fix' in value && typeof value.fix !== 'string' && typeof value.fix !== 'undefined') return false;
  if ('details' in value && !isRecord(value.details) && typeof value.details !== 'undefined') return false;
  return true;
};

export const isSidecarMessage = (value: unknown): value is SidecarMessage => {
  if (!isRecord(value)) return false;
  const type = value.type;
  if (typeof type !== 'string') return false;

  const ts = value.ts;
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return false;

  if (type === 'hello') {
    if (typeof value.version !== 'number' || !Number.isFinite(value.version)) return false;
    return value.role === 'plugin' || value.role === 'sidecar';
  }
  if (type === 'ready') {
    return typeof value.version === 'number' && Number.isFinite(value.version);
  }
  if (type === 'request') {
    if (typeof value.id !== 'string' || !value.id) return false;
    if (typeof value.tool !== 'string') return false;
    return true;
  }
  if (type === 'response') {
    if (typeof value.id !== 'string' || !value.id) return false;
    if (typeof value.ok !== 'boolean') return false;
    if (!value.ok) {
      if (typeof value.error === 'undefined') return true;
      return isToolError(value.error);
    }
    return true;
  }
  if (type === 'error') {
    if (typeof value.message !== 'string') return false;
    if ('id' in value && typeof value.id !== 'string' && typeof value.id !== 'undefined') return false;
    if ('details' in value && !isRecord(value.details) && typeof value.details !== 'undefined') return false;
    return true;
  }
  return false;
};



