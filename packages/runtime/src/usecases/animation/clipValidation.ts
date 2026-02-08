import type { ToolError } from '@ashfox/contracts/types/internal';
import {
  ANIMATION_FPS_POSITIVE,
  ANIMATION_LENGTH_EXCEEDS_MAX,
  ANIMATION_LENGTH_POSITIVE
} from '../../shared/messages';

export const validateAnimationLength = (length: number, maxSeconds: number): ToolError | null => {
  if (!Number.isFinite(length) || length <= 0) {
    return { code: 'invalid_payload', message: ANIMATION_LENGTH_POSITIVE };
  }
  if (length > maxSeconds) {
    return {
      code: 'invalid_payload',
      message: ANIMATION_LENGTH_EXCEEDS_MAX(maxSeconds)
    };
  }
  return null;
};

export const validateAnimationFps = (fps: number): ToolError | null => {
  if (!Number.isFinite(fps) || fps <= 0) {
    return { code: 'invalid_payload', message: ANIMATION_FPS_POSITIVE };
  }
  return null;
};

