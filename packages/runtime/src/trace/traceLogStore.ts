import type { TraceLogRecord } from '@ashfox/contracts/types/traceLog';
import type { TraceLogWriter } from '../ports/traceLog';
import type { ToolError } from '@ashfox/contracts/types/internal';
import { serializeTraceLogRecord } from './traceLogFormat';

export type TraceLogStoreOptions = {
  writer?: TraceLogWriter | null;
  autoFlush?: boolean;
  maxEntries?: number;
  maxBytes?: number;
  minEntries?: number;
};

export class TraceLogStore {
  private readonly lines: string[] = [];
  private startIndex = 0;
  private text = '';
  private writer?: TraceLogWriter | null;
  private autoFlush: boolean;
  private maxEntries: number;
  private maxBytes?: number;
  private minEntries: number;
  private currentSize = 0;

  constructor(options: TraceLogStoreOptions = {}) {
    this.writer = options.writer ?? null;
    this.autoFlush = options.autoFlush !== false;
    this.maxEntries = Number.isFinite(options.maxEntries) ? Math.max(1, Math.trunc(options.maxEntries as number)) : 2000;
    this.maxBytes = normalizeMaxBytes(options.maxBytes);
    this.minEntries = normalizeMinEntries(options.minEntries);
  }

  append(record: TraceLogRecord): { text: string; error?: ToolError } {
    const text = serializeTraceLogRecord(record);
    this.lines.push(text);
    this.text += `${text}\n`;
    this.currentSize += text.length + 1;
    this.trim();
    let error: ToolError | undefined;
    if (this.autoFlush && this.writer) {
      const result = this.writer.write(this.getText());
      if (result) error = result;
    }
    return { text, ...(error ? { error } : {}) };
  }

  flush(writerOverride?: TraceLogWriter | null): ToolError | null {
    const writer = writerOverride ?? this.writer;
    if (!writer) return null;
    return writer.write(this.getText());
  }

  clear(): void {
    this.lines.length = 0;
    this.startIndex = 0;
    this.text = '';
    this.currentSize = 0;
  }

  size(): number {
    return Math.max(0, this.lines.length - this.startIndex);
  }

  update(options: TraceLogStoreOptions): void {
    if (options.writer !== undefined) this.writer = options.writer;
    if (options.autoFlush !== undefined) this.autoFlush = options.autoFlush !== false;
    if (options.maxEntries !== undefined && Number.isFinite(options.maxEntries)) {
      this.maxEntries = Math.max(1, Math.trunc(options.maxEntries));
    }
    if (options.maxBytes !== undefined) {
      this.maxBytes = normalizeMaxBytes(options.maxBytes);
    }
    if (options.minEntries !== undefined) {
      this.minEntries = normalizeMinEntries(options.minEntries);
    }
    this.trim();
  }

  getText(): string {
    if (this.size() === 0) return '';
    return this.text;
  }

  private trim(): void {
    while (this.size() > this.maxEntries) {
      this.dropOldest();
    }
    if (this.maxBytes && this.maxBytes > 0) {
      while (this.currentSize > this.maxBytes && this.size() > this.minEntries) {
        this.dropOldest();
      }
    }
    if (this.size() === 0) {
      this.currentSize = 0;
      this.text = '';
      this.startIndex = 0;
      this.lines.length = 0;
    }
  }

  private dropOldest(): void {
    const removed = this.lines[this.startIndex];
    if (removed === undefined) return;
    this.startIndex += 1;
    if (removed) {
      this.currentSize -= removed.length + 1;
      if (this.currentSize < 0) this.currentSize = 0;
      const dropLength = removed.length + 1;
      if (this.text.length <= dropLength) {
        this.text = '';
      } else {
        this.text = this.text.slice(dropLength);
      }
    }
    if (this.startIndex > 1000 && this.startIndex > this.lines.length / 2) {
      this.lines.splice(0, this.startIndex);
      this.startIndex = 0;
    }
  }
}

const normalizeMaxBytes = (value?: number): number | undefined => {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value)) return undefined;
  const normalized = Math.max(0, Math.trunc(value));
  return normalized > 0 ? normalized : undefined;
};

const normalizeMinEntries = (value?: number): number => {
  if (value === undefined) return 1;
  if (!Number.isFinite(value)) return 1;
  const normalized = Math.max(0, Math.trunc(value));
  return normalized;
};





