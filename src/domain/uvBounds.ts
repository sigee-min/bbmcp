import type { DomainResult } from './result';
import { fail } from './result';
import { UV_BOUNDS_NEGATIVE, UV_BOUNDS_ORDER, UV_BOUNDS_OUT_OF_BOUNDS } from '../shared/messages';

export type UvBoundsErrorReason = 'negative' | 'out_of_bounds' | 'order';

export const validateUvBounds = (
  uv: [number, number, number, number],
  resolution: { width: number; height: number },
  details?: Record<string, unknown>
): DomainResult<never> | null => {
  const [x1, y1, x2, y2] = uv;
  if (x1 < 0 || y1 < 0 || x2 < 0 || y2 < 0) {
    return fail('invalid_payload', UV_BOUNDS_NEGATIVE, {
      reason: 'negative',
      ...details
    });
  }
  if (x1 > resolution.width || x2 > resolution.width || y1 > resolution.height || y2 > resolution.height) {
    return fail(
      'invalid_payload',
      UV_BOUNDS_OUT_OF_BOUNDS(resolution.width, resolution.height),
      { reason: 'out_of_bounds', ...details }
    );
  }
  if (x2 < x1 || y2 < y1) {
    return fail('invalid_payload', UV_BOUNDS_ORDER, {
      reason: 'order',
      ...details
    });
  }
  return null;
};
