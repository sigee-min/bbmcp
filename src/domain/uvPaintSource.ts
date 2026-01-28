import type { Limits } from '../types';
import { checkDimensions, formatDimensionAxis, mapDimensionError } from './dimensions';
import { fail, ok, type DomainResult } from './result';
import {
  UV_PAINT_SOURCE_AXIS_INTEGER,
  UV_PAINT_SOURCE_AXIS_POSITIVE,
  UV_PAINT_SOURCE_EXCEEDS_MAX
} from '../shared/messages';

export type UvPaintSourceSize = { width: number; height: number };

export type UvPaintSourceOptions = {
  requireInteger?: boolean;
};

export const validateUvPaintSourceSize = (
  width: number,
  height: number,
  limits: Limits,
  label: string,
  options?: UvPaintSourceOptions
): DomainResult<UvPaintSourceSize> => {
  const sizeCheck = checkDimensions(width, height, {
    requireInteger: options?.requireInteger,
    maxSize: limits.maxTextureSize
  });
  if (!sizeCheck.ok) {
    const message = mapDimensionError(sizeCheck, {
      nonPositive: (axis) => UV_PAINT_SOURCE_AXIS_POSITIVE(formatDimensionAxis(axis), label),
      nonInteger: (axis) => UV_PAINT_SOURCE_AXIS_INTEGER(formatDimensionAxis(axis), label),
      exceedsMax: (maxSize) => UV_PAINT_SOURCE_EXCEEDS_MAX(maxSize || limits.maxTextureSize, label)
    });
    return fail('invalid_payload', message ?? UV_PAINT_SOURCE_EXCEEDS_MAX(limits.maxTextureSize, label), {
      reason: sizeCheck.reason,
      axis: sizeCheck.axis,
      width,
      height,
      maxSize: limits.maxTextureSize
    });
  }
  return ok({ width, height });
};
