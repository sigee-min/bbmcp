import type { ToolError } from '@ashfox/contracts/types/internal';
import {
  REVISION_MISMATCH_FIX,
  REVISION_MISMATCH_MESSAGE,
  REVISION_REQUIRED_FIX,
  REVISION_REQUIRED_MESSAGE
} from '../../shared/messages';

export const buildMissingRevisionError = (currentRevision?: string, active?: boolean): ToolError => ({
  code: 'invalid_state',
  message: REVISION_REQUIRED_MESSAGE,
  fix: REVISION_REQUIRED_FIX,
  details: {
    reason: 'missing_ifRevision',
    ...(currentRevision ? { currentRevision } : {}),
    ...(typeof active === 'boolean' ? { active } : {})
  }
});

export const buildRevisionMismatchError = (expected: string, currentRevision: string): ToolError => ({
  code: 'invalid_state_revision_mismatch',
  message: REVISION_MISMATCH_MESSAGE,
  fix: REVISION_MISMATCH_FIX,
  details: { expected, currentRevision, reason: 'revision_mismatch' }
});




