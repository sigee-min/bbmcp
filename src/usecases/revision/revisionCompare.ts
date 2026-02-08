import type { ToolError } from '@ashfox/contracts/types/internal';
import { buildMissingRevisionError, buildRevisionMismatchError } from './revisionErrors';

export type RevisionCompareInput = {
  requiresRevision: boolean;
  allowAutoRetry?: boolean;
  expected?: string;
  currentRevision?: string;
  active?: boolean;
};

export type RevisionCompareDecision =
  | { ok: true; action: 'proceed'; currentRevision?: string }
  | { ok: true; action: 'retry'; currentRevision: string }
  | { ok: false; error: ToolError };

export const decideRevisionMatch = (input: RevisionCompareInput): RevisionCompareDecision => {
  if (!input.requiresRevision) {
    return { ok: true, action: 'proceed' };
  }
  const currentRevision = input.currentRevision;
  if (!input.expected) {
    return { ok: false, error: buildMissingRevisionError(currentRevision, input.active) };
  }
  if (currentRevision && currentRevision !== input.expected) {
    if (input.allowAutoRetry) {
      return { ok: true, action: 'retry', currentRevision };
    }
    return { ok: false, error: buildRevisionMismatchError(input.expected, currentRevision) };
  }
  return { ok: true, action: 'proceed', ...(currentRevision ? { currentRevision } : {}) };
};

