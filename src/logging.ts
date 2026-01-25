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
const MAX_LOG_VALUE_STRING_LENGTH = 512;

export const safeStringify = (value: unknown, maxLength: number = MAX_LOG_META_LENGTH): string => {
  const seen = new WeakSet<object>();
  try {
    const json = JSON.stringify(value, (_key, v) => {
      if (v instanceof Error) {
        return {
          name: v.name,
          message: v.message,
          stack: v.stack
        };
      }
      if (typeof v === 'string') {
        if (v.length <= MAX_LOG_VALUE_STRING_LENGTH) return v;
        return `${v.slice(0, MAX_LOG_VALUE_STRING_LENGTH)}...[truncated]`;
      }
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      return v;
    });
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
