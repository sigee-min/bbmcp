import type { DomainResult } from './result';
import type { UvPaintRect } from './uvPaint';
import {
  UV_PAINT_PADDING_EXCEEDS_RECT,
  UV_PAINT_RECT_INVALID,
  UV_PAINT_RECT_OUTSIDE_BOUNDS
} from '../shared/messages';

export const normalizeUvPaintRects = (
  rects: UvPaintRect[],
  padding: number,
  width: number,
  height: number,
  label: string
): DomainResult<UvPaintRect[]> => {
  const safePadding = Number.isFinite(padding) ? Math.max(0, padding) : 0;
  const normalized: UvPaintRect[] = [];
  for (const rect of rects) {
    const x1 = Math.min(rect.x1, rect.x2) + safePadding;
    const y1 = Math.min(rect.y1, rect.y2) + safePadding;
    const x2 = Math.max(rect.x1, rect.x2) - safePadding;
    const y2 = Math.max(rect.y1, rect.y2) - safePadding;
    if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) {
      return err('invalid_payload', UV_PAINT_RECT_INVALID(label));
    }
    if (x2 <= x1 || y2 <= y1) {
      return err('invalid_payload', UV_PAINT_PADDING_EXCEEDS_RECT(label));
    }
    if (x1 < 0 || y1 < 0 || x2 > width || y2 > height) {
      return err('invalid_payload', UV_PAINT_RECT_OUTSIDE_BOUNDS(label));
    }
    normalized.push({ x1, y1, x2, y2 });
  }
  return { ok: true, data: normalized };
};

const err = (code: 'invalid_payload', message: string): DomainResult<never> => ({
  ok: false,
  error: { code, message }
});
