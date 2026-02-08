import type { DomainResult } from '../result';
import type { UvPaintRect } from './paintTypes';

export type UvPaintRectMessages = {
  rectInvalid: (label: string) => string;
  paddingExceedsRect: (label: string) => string;
  rectOutsideBounds: (label: string) => string;
};

export const normalizeUvPaintRects = (
  rects: UvPaintRect[],
  padding: number,
  width: number,
  height: number,
  label: string,
  messages: UvPaintRectMessages
): DomainResult<UvPaintRect[]> => {
  const safePadding = Number.isFinite(padding) ? Math.max(0, padding) : 0;
  const normalized: UvPaintRect[] = [];
  for (const rect of rects) {
    const x1 = Math.min(rect.x1, rect.x2) + safePadding;
    const y1 = Math.min(rect.y1, rect.y2) + safePadding;
    const x2 = Math.max(rect.x1, rect.x2) - safePadding;
    const y2 = Math.max(rect.y1, rect.y2) - safePadding;
    if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) {
      return err('invalid_payload', messages.rectInvalid(label), { reason: 'rect_invalid' });
    }
    if (x2 <= x1 || y2 <= y1) {
      return err('invalid_payload', messages.paddingExceedsRect(label), { reason: 'padding_exceeds_rect' });
    }
    if (x1 < 0 || y1 < 0 || x2 > width || y2 > height) {
      return err('invalid_payload', messages.rectOutsideBounds(label), {
        reason: 'rect_outside_bounds',
        rect: { x1, y1, x2, y2 },
        bounds: { width, height }
      });
    }
    normalized.push({ x1, y1, x2, y2 });
  }
  return { ok: true, data: normalized };
};

const err = (
  code: 'invalid_payload',
  message: string,
  details?: Record<string, unknown>
): DomainResult<never> => ({
  ok: false,
  error: { code, message, details }
});




