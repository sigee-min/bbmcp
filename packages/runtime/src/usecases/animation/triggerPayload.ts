import { isRecord } from '../../domain/guards';

export type TriggerPayloadValue = string | string[] | Record<string, unknown>;

export const isValidTriggerPayloadValue = (value: unknown): value is TriggerPayloadValue =>
  typeof value === 'string' ||
  (Array.isArray(value) && value.every((item) => typeof item === 'string')) ||
  (isRecord(value) && isJsonSafe(value));

const isJsonSafe = (value: unknown, seen: Set<object> = new Set()): boolean => {
  if (value === null) return true;
  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'boolean') return true;
  if (valueType === 'number') return Number.isFinite(value);
  if (valueType !== 'object') return false;
  if (seen.has(value as object)) return false;
  seen.add(value as object);
  if (Array.isArray(value)) {
    return value.every((entry) => isJsonSafe(entry, seen));
  }
  const record = value as Record<string, unknown>;
  return Object.keys(record).every((key) => isJsonSafe(record[key], seen));
};
