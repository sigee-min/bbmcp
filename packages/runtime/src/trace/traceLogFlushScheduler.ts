import type { Logger } from '../logging';
import type { TraceLogWriter } from '../ports/traceLog';
import type { TraceLogStore } from './traceLogStore';

export type TraceLogFlushPolicy = {
  enabled?: boolean;
  flushEvery?: number;
  flushIntervalMs?: number;
};

export class TraceLogFlushScheduler {
  private store: TraceLogStore;
  private writer: TraceLogWriter | null;
  private enabled: boolean;
  private flushEvery: number | null;
  private flushIntervalMs: number | null;
  private clock: () => number;
  private logger?: Logger;
  private pending = 0;
  private lastFlushAt = 0;
  private lastErrorKey: string | null = null;

  constructor(options: {
    store: TraceLogStore;
    writer: TraceLogWriter | null;
    policy?: TraceLogFlushPolicy;
    clock?: () => number;
    logger?: Logger;
  }) {
    this.store = options.store;
    this.writer = options.writer;
    this.clock = options.clock ?? (() => Date.now());
    this.logger = options.logger;
    const policy = options.policy ?? {};
    this.enabled = policy.enabled !== false;
    this.flushEvery = normalizeFlushEvery(policy.flushEvery);
    this.flushIntervalMs = normalizeFlushInterval(policy.flushIntervalMs);
  }

  recorded(): void {
    if (!this.enabled || !this.writer) return;
    this.pending += 1;
    const now = this.clock();
    if (this.shouldFlush(now)) {
      this.flush(now, 'auto');
    }
  }

  flushNow(force = false): void {
    if (!this.writer) return;
    if (!this.enabled && !force) return;
    if (this.pending === 0 && !force) return;
    const now = this.clock();
    this.flush(now, force ? 'forced' : 'manual');
  }

  update(options: {
    store?: TraceLogStore;
    writer?: TraceLogWriter | null;
    policy?: TraceLogFlushPolicy;
    logger?: Logger;
  }): void {
    if (options.store) this.store = options.store;
    if (options.writer !== undefined) this.writer = options.writer;
    if (options.logger) this.logger = options.logger;
    if (options.policy) {
      this.enabled = options.policy.enabled !== false;
      if (options.policy.flushEvery !== undefined) {
        this.flushEvery = normalizeFlushEvery(options.policy.flushEvery);
      }
      if (options.policy.flushIntervalMs !== undefined) {
        this.flushIntervalMs = normalizeFlushInterval(options.policy.flushIntervalMs);
      }
    }
  }

  private shouldFlush(now: number): boolean {
    if (this.flushEvery !== null && this.pending >= this.flushEvery) return true;
    if (this.flushIntervalMs !== null && now - this.lastFlushAt >= this.flushIntervalMs) return true;
    return false;
  }

  private flush(now: number, reason: 'auto' | 'manual' | 'forced'): void {
    if (!this.writer) return;
    const error = this.store.flush(this.writer);
    if (error) {
      const key = `${error.code}:${error.message ?? 'unknown'}`;
      if (key !== this.lastErrorKey && this.logger) {
        this.logger.warn('trace log flush failed', {
          reason,
          code: error.code,
          message: error.message ?? 'unknown error'
        });
      }
      this.lastErrorKey = key;
    } else {
      this.lastErrorKey = null;
    }
    this.pending = 0;
    this.lastFlushAt = now;
  }
}

const normalizeFlushEvery = (value?: number): number | null => {
  if (value === undefined) return 1;
  if (!Number.isFinite(value)) return 1;
  const normalized = Math.trunc(value);
  if (normalized <= 0) return null;
  return normalized;
};

const normalizeFlushInterval = (value?: number): number | null => {
  if (value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  const normalized = Math.trunc(value);
  if (normalized <= 0) return null;
  return normalized;
};




