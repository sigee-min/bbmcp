import type { Limits } from '@ashfox/contracts/types/internal';
import { checkDimensions, formatDimensionAxis, mapDimensionError } from '../dimensions';
import { fail, ok, type DomainResult } from '../result';

export type UvPaintSourceMessages = {
  axisPositive: (axis: string, label: string) => string;
  axisInteger: (axis: string, label: string) => string;
  exceedsMax: (maxSize: number, label: string) => string;
};

export type UvPaintSourceSize = { width: number; height: number };

export type UvPaintSourceOptions = {
  requireInteger?: boolean;
};

export const validateUvPaintSourceSize = (
  width: number,
  height: number,
  limits: Limits,
  label: string,
  options: UvPaintSourceOptions | undefined,
  messages: UvPaintSourceMessages
): DomainResult<UvPaintSourceSize> => {
  const sizeCheck = checkDimensions(width, height, {
    requireInteger: options?.requireInteger,
    maxSize: limits.maxTextureSize
  });
  if (!sizeCheck.ok) {
    const message = mapDimensionError(sizeCheck, {
      nonPositive: (axis) => messages.axisPositive(formatDimensionAxis(axis), label),
      nonInteger: (axis) => messages.axisInteger(formatDimensionAxis(axis), label),
      exceedsMax: (maxSize) => messages.exceedsMax(maxSize || limits.maxTextureSize, label)
    });
    return fail('invalid_payload', message ?? messages.exceedsMax(limits.maxTextureSize, label), {
      reason: sizeCheck.reason,
      axis: sizeCheck.axis,
      width,
      height,
      maxSize: limits.maxTextureSize
    });
  }
  return ok({ width, height });
};




