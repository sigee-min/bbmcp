import type { ToolError } from '@ashfox/contracts/types/internal';

export const resolveIfRevision = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== 'object') return undefined;
  const record = payload as Record<string, unknown>;
  return typeof record.ifRevision === 'string' ? record.ifRevision : undefined;
};

export const toRevisionPayload = (payload: unknown): { ifRevision?: string } | undefined => {
  const ifRevision = resolveIfRevision(payload);
  return ifRevision ? { ifRevision } : undefined;
};

export const resolveGuardReason = (error: ToolError): string | null => {
  if (error.code === 'invalid_state_revision_mismatch') return 'revision_mismatch';
  const details = error.details as Record<string, unknown> | undefined;
  const reason = details?.reason;
  return typeof reason === 'string' ? reason : null;
};

export const extractGuardMeta = (error: ToolError): Record<string, unknown> => {
  const details = error.details;
  if (!details || typeof details !== 'object') return {};
  const record = details as Record<string, unknown>;
  const meta: Record<string, unknown> = {};
  if (typeof record.expected === 'string') meta.expected = record.expected;
  if (typeof record.currentRevision === 'string') meta.currentRevision = record.currentRevision;
  if (typeof record.current === 'string') meta.currentRevision = record.current;
  if (typeof record.active === 'boolean') meta.active = record.active;
  if (typeof record.reason === 'string') meta.reason = record.reason;
  return meta;
};

