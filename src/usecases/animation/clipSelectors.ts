import type { ToolError } from '@ashfox/contracts/types/internal';
import type { SessionState } from '../../session';
import { resolveAnimationTarget } from '../targetResolvers';
import { ensureNonBlankString } from '../../shared/payloadValidation';
import { fail, ok, type UsecaseResult } from '../result';

export const ensureClipSelector = (clipId?: string, clip?: string): ToolError | null => {
  const clipIdBlankErr = ensureNonBlankString(clipId, 'Animation clip id');
  if (clipIdBlankErr) return clipIdBlankErr;
  const clipBlankErr = ensureNonBlankString(clip, 'Animation clip name');
  if (clipBlankErr) return clipBlankErr;
  return null;
};

export const resolveClipTarget = (
  snapshot: SessionState,
  clipId?: string,
  clip?: string
): UsecaseResult<SessionState['animations'][number]> => {
  const resolved = resolveAnimationTarget(snapshot.animations, clipId, clip);
  if (resolved.error) return fail(resolved.error);
  return ok(resolved.target!);
};

