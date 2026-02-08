export const normalizeHost = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const normalizePort = (value: unknown): number | null => {
  if (value === undefined || value === null) return null;
  const parsed = parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 1 || parsed > 65535) return null;
  return parsed;
};

export const normalizePath = (value: unknown, fallback = '/mcp'): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withSlash.length > 1 && withSlash.endsWith('/') ? withSlash.slice(0, -1) : withSlash;
};
