import { Logger, LogLevel, LogLevelProvider, safeFormatMeta } from '../logging';

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

export class StderrLogger implements Logger {
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
    const line = `[${this.prefix}] [${level}] ${payload}\n`;
    if (typeof process !== 'undefined' && process.stderr?.write) {
      process.stderr.write(line);
    }
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
    const minLevel = typeof this.minLevel === 'function' ? this.minLevel() : this.minLevel;
    return LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(minLevel);
  }
}
