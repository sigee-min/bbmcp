import type { TraceLogStore } from '../trace/traceLogStore';
import type { TraceLogWriterFactory, TraceLogWriteOptions } from '../ports/traceLog';
import type { ExportTraceLogPayload, ExportTraceLogResult } from '../types/internal';
import { ok, fail, UsecaseResult } from './result';

const DEFAULT_RESOURCE_URI = 'ashfox://logs/trace.ndjson';

export class TraceLogService {
  private readonly store: TraceLogStore;
  private readonly writerFactory?: TraceLogWriterFactory;
  private defaults: TraceLogWriteOptions;
  private readonly resourceUri: string;

  constructor(options: {
    store: TraceLogStore;
    writerFactory?: TraceLogWriterFactory;
    defaults?: TraceLogWriteOptions;
    resourceUri?: string;
  }) {
    this.store = options.store;
    this.writerFactory = options.writerFactory;
    this.defaults = options.defaults ?? {};
    this.resourceUri = options.resourceUri ?? DEFAULT_RESOURCE_URI;
  }

  exportTraceLog(payload: ExportTraceLogPayload): UsecaseResult<ExportTraceLogResult> {
    const text = this.store.getText();
    if (!text || text.trim().length === 0) {
      return fail({
        code: 'invalid_state',
        message: 'Trace log is empty.',
        details: { reason: 'trace_log_empty', resourceUri: this.resourceUri }
      });
    }
    if (!this.writerFactory) {
      return fail({
        code: 'not_implemented',
        message: 'Trace log export is unavailable.',
        details: { reason: 'trace_log_writer_missing' }
      });
    }
    const options = {
      ...this.defaults,
      ...(payload.mode ? { mode: payload.mode } : {}),
      ...(payload.destPath ? { destPath: payload.destPath } : {}),
      ...(payload.fileName ? { fileName: payload.fileName } : {})
    };
    const writer = this.writerFactory.create(options);
    const error = writer.write(text);
    if (error) return fail(error);
    return ok({
      written: true,
      mode: options.mode ?? 'auto',
      ...(options.destPath ? { destPath: options.destPath } : {}),
      ...(options.fileName ? { fileName: options.fileName } : {}),
      bytes: text.length,
      resourceUri: this.resourceUri
    });
  }

  updateDefaults(options: TraceLogWriteOptions): void {
    this.defaults = { ...this.defaults, ...options };
  }

  getResourceUri(): string {
    return this.resourceUri;
  }
}






