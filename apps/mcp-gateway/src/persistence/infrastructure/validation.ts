export const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const quoteSqlIdentifier = (value: string, field: 'schema' | 'table'): string => {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`${field} must match ${IDENTIFIER_PATTERN.source}.`);
  }
  return `"${value}"`;
};

export const normalizeBlobBucket = (value: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new Error('bucket must be a non-empty string.');
  if (normalized.includes('/')) throw new Error('bucket must not include "/".');
  return normalized;
};

export const normalizeBlobKey = (value: string): string => {
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) throw new Error('key must be a non-empty string.');
  return normalized;
};

export const normalizeBlobPrefix = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return normalized ? normalized : undefined;
};

export const appwriteTimeoutError = (
  timeoutMs: number,
  method: string,
  pathValue: string
): Error => new Error(`Appwrite request timed out after ${timeoutMs}ms (${method} ${pathValue}).`);
