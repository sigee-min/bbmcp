export const normalizeHeaders = (headers: Record<string, unknown>): Record<string, string> => {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (value === undefined || value === null) continue;
    const lower = key.toLowerCase();
    if (Array.isArray(value)) {
      normalized[lower] = value.map((item) => String(item)).join(', ');
      continue;
    }
    normalized[lower] = String(value);
  }
  return normalized;
};

export const toBodyString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (value === undefined || value === null) {
    return '';
  }
  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString('utf8');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
};
