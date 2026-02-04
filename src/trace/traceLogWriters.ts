import type { ResourceStore } from '../ports/resources';
import type { TraceLogWriter } from '../ports/traceLog';
import type { ToolError } from '../types';
import { buildTraceLogReport } from './traceLogReport';

const DEFAULT_URI = 'bbmcp://logs/trace.ndjson';
const DEFAULT_REPORT_URI = 'bbmcp://logs/trace-report.json';

export class ResourceTraceLogWriter implements TraceLogWriter {
  private readonly store: ResourceStore;
  private readonly uri: string;
  private readonly name: string;
  private readonly description: string;
  private readonly includeReport: boolean;
  private readonly reportUri: string;

  constructor(
    store: ResourceStore,
    options?: { uri?: string; name?: string; description?: string; includeReport?: boolean; reportUri?: string }
  ) {
    this.store = store;
    this.uri = options?.uri ?? DEFAULT_URI;
    this.name = options?.name ?? 'bbmcp trace log';
    this.description = options?.description ?? 'Trace log (ndjson) generated from tool calls.';
    this.includeReport = options?.includeReport !== false;
    this.reportUri = options?.reportUri ?? DEFAULT_REPORT_URI;
  }

  write(text: string): ToolError | null {
    this.store.put({
      uri: this.uri,
      name: this.name,
      description: this.description,
      mimeType: 'application/x-ndjson',
      text
    });
    if (this.includeReport) {
      const report = buildTraceLogReport(text);
      this.store.put({
        uri: this.reportUri,
        name: 'bbmcp trace report',
        description: 'Aggregated trace log summary (auto-generated).',
        mimeType: 'application/json',
        text: JSON.stringify(report, null, 2)
      });
    }
    return null;
  }
}

export class InMemoryTraceLogWriter implements TraceLogWriter {
  private text = '';

  write(text: string): ToolError | null {
    this.text = text;
    return null;
  }

  getText(): string {
    return this.text;
  }
}




