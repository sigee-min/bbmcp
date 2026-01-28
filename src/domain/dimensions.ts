export type DimensionAxis = 'width' | 'height';
export type DimensionCheckReason = 'non_positive' | 'non_integer' | 'exceeds_max';

export type DimensionCheckResult =
  | { ok: true }
  | { ok: false; reason: DimensionCheckReason; axis?: DimensionAxis; maxSize?: number };

export type DimensionErrorMapper<T> = {
  nonPositive: (axis: DimensionAxis) => T;
  nonInteger?: (axis: DimensionAxis) => T;
  exceedsMax: (maxSize: number) => T;
};

export const checkDimensions = (
  width: number,
  height: number,
  options?: { requireInteger?: boolean; maxSize?: number }
): DimensionCheckResult => {
  if (!isFinitePositive(width)) {
    return { ok: false, reason: 'non_positive', axis: 'width' };
  }
  if (!isFinitePositive(height)) {
    return { ok: false, reason: 'non_positive', axis: 'height' };
  }
  const requireInteger = options?.requireInteger !== false;
  if (requireInteger) {
    if (!Number.isInteger(width)) {
      return { ok: false, reason: 'non_integer', axis: 'width' };
    }
    if (!Number.isInteger(height)) {
      return { ok: false, reason: 'non_integer', axis: 'height' };
    }
  }
  const maxSize = options?.maxSize;
  if (typeof maxSize === 'number' && Number.isFinite(maxSize)) {
    if (width > maxSize || height > maxSize) {
      return { ok: false, reason: 'exceeds_max', maxSize };
    }
  }
  return { ok: true };
};

export const mapDimensionError = <T>(check: DimensionCheckResult, mapper: DimensionErrorMapper<T>): T | null => {
  if (check.ok) return null;
  const axis = check.axis ?? 'width';
  if (check.reason === 'non_positive') {
    return mapper.nonPositive(axis);
  }
  if (check.reason === 'non_integer') {
    const handler = mapper.nonInteger ?? mapper.nonPositive;
    return handler(axis);
  }
  return mapper.exceedsMax(check.maxSize ?? 0);
};

export const formatDimensionAxis = (axis?: DimensionAxis): string => {
  if (!axis) return 'width/height';
  return axis === 'height' ? 'height' : 'width';
};

const isFinitePositive = (value: number): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
