export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogLevelProvider = LogLevel | (() => LogLevel);

export interface Logger {
  log(level: LogLevel, message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const MAX_LOG_META_LENGTH = 4000;
const MAX_LOG_DEPTH = 6;
const MAX_LOG_OBJECT_KEYS = 40;
const MAX_LOG_ARRAY_ITEMS = 40;
const MAX_LOG_VALUE_STRING_LENGTH = 512;

const isSensitiveKey = (key: string): boolean => {
  const k = key.toLowerCase();
  return (
    k === 'authorization' ||
    k === 'cookie' ||
    k === 'set-cookie' ||
    k.includes('token') ||
    k.includes('secret') ||
    k.includes('password') ||
    k.includes('apikey') ||
    k.includes('api_key') ||
    k === 'datauri' ||
    k === 'base64'
  );
};

const looksLikeJwt = (value: string): boolean => {
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  // base64url-ish
  return parts.every((p) => p.length > 0 && /^[A-Za-z0-9_-]+$/.test(p));
};

const summarizeDataUri = (value: string): string => {
  const raw = String(value ?? '');
  if (!raw.startsWith('data:')) return '[dataUri]';
  const comma = raw.indexOf(',');
  const header = comma >= 0 ? raw.slice(0, comma) : raw;
  const payloadLen = comma >= 0 ? raw.length - comma - 1 : 0;
  // header like: data:image/png;base64
  return `${header},[${payloadLen} chars]`;
};

const truncateString = (value: string): string => {
  if (value.length <= MAX_LOG_VALUE_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_LOG_VALUE_STRING_LENGTH)}...[truncated]`;
};

const looksLikeBase64 = (value: string): boolean => {
  if (value.length < 128) return false;
  if (value.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/=]+$/.test(value);
};

const sanitizeForLogging = (
  key: string,
  value: unknown,
  depth: number,
  seen: WeakSet<object>
): unknown => {
  const normalizedKey = key || '(root)';
  if (normalizedKey.toLowerCase() === 'data' && typeof value === 'string') {
    if (value.startsWith('data:')) return summarizeDataUri(value);
    if (looksLikeBase64(value)) return `[base64:${value.length} chars]`;
    return truncateString(value);
  }
  if (isSensitiveKey(key)) {
    if (typeof value === 'string' && value.startsWith('data:')) return summarizeDataUri(value);
    if (typeof value === 'string' && looksLikeJwt(value)) return '[redacted:jwt]';
    if (typeof value === 'string') return `[redacted:${normalizedKey}]`;
    if (value && typeof value === 'object') return `[redacted:${normalizedKey}]`;
    return `[redacted:${normalizedKey}]`;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  if (typeof value === 'string') {
    if (value.startsWith('data:')) return summarizeDataUri(value);
    if (looksLikeJwt(value)) return '[redacted:jwt]';
    return truncateString(value);
  }

  if (typeof value !== 'object' || value === null) return value;

  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (depth >= MAX_LOG_DEPTH) return '[MaxDepth]';

  if (Array.isArray(value)) {
    const out: unknown[] = [];
    const limit = Math.min(value.length, MAX_LOG_ARRAY_ITEMS);
    for (let i = 0; i < limit; i++) {
      out.push(sanitizeForLogging(String(i), value[i], depth + 1, seen));
    }
    if (value.length > limit) out.push(`[+${value.length - limit} more]`);
    return out;
  }

  // Plain object-ish
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  const limit = Math.min(keys.length, MAX_LOG_OBJECT_KEYS);
  const out: Record<string, unknown> = {};
  for (let i = 0; i < limit; i++) {
    const k = keys[i];
    out[k] = sanitizeForLogging(k, obj[k], depth + 1, seen);
  }
  if (keys.length > limit) out._truncatedKeys = keys.length - limit;
  return out;
};

export const safeStringify = (value: unknown, maxLength: number = MAX_LOG_META_LENGTH): string => {
  const seen = new WeakSet<object>();
  try {
    const sanitized = sanitizeForLogging('', value, 0, seen);
    const json = JSON.stringify(sanitized);
    if (json.length <= maxLength) return json;
    return `${json.slice(0, maxLength)}...[truncated]`;
  } catch (err) {
    const fallback = err instanceof Error ? err.message : String(err);
    return `[unserializable meta: ${fallback}]`;
  }
};

export const safeFormatMeta = (meta?: Record<string, unknown>): string | null => {
  if (!meta) return null;
  return safeStringify(meta);
};

export const errorMessage = (err: unknown, fallback?: string): string => {
  if (err instanceof Error) return err.message;
  if (fallback !== undefined) return fallback;
  return String(err);
};

export class ConsoleLogger implements Logger {
  private readonly prefix: string;
  private readonly minLevel: LogLevelProvider;

  constructor(prefix: string, minLevel: LogLevelProvider = 'info') {
    this.prefix = prefix;
    this.minLevel = minLevel;
  }

  log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;
    const formatted = safeFormatMeta(meta);
    const payload = formatted ? `${message} ${formatted}` : message;
    // eslint-disable-next-line no-console
    console.log(`[${this.prefix}] [${level}] ${payload}`);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log('error', message, meta);
  }

  private shouldLog(level: LogLevel): boolean {
    const order: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const minLevel = typeof this.minLevel === 'function' ? this.minLevel() : this.minLevel;
    return order.indexOf(level) >= order.indexOf(minLevel);
  }
}


