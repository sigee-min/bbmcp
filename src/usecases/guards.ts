import type { ToolError } from '@ashfox/contracts/types/internal';
import { fail, type UsecaseResult } from './result';

type EnsureActive = () => ToolError | null;
type EnsureRevision = (ifRevision?: string) => ToolError | null;

export const ensureActiveOnly = (ensureActive: EnsureActive): ToolError | null => ensureActive();

export const ensureActiveAndRevision = (
  ensureActive: EnsureActive,
  ensureRevision: EnsureRevision,
  ifRevision?: string,
  options?: { skipRevisionCheck?: boolean }
): ToolError | null => {
  const activeErr = ensureActive();
  if (activeErr) return activeErr;
  if (options?.skipRevisionCheck) return null;
  return ensureRevision(ifRevision);
};

export const withActiveOnly = <T>(
  ensureActive: EnsureActive,
  fn: () => UsecaseResult<T>
): UsecaseResult<T> => {
  const activeErr = ensureActiveOnly(ensureActive);
  if (activeErr) return fail(activeErr);
  return fn();
};

export const withActiveAndRevision = <T>(
  ensureActive: EnsureActive,
  ensureRevision: EnsureRevision,
  ifRevision: string | undefined,
  fn: () => UsecaseResult<T>,
  options?: { skipRevisionCheck?: boolean }
): UsecaseResult<T> => {
  const guardErr = ensureActiveAndRevision(ensureActive, ensureRevision, ifRevision, options);
  if (guardErr) return fail(guardErr);
  return fn();
};



