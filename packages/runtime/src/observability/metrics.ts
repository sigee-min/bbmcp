export const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

export type MetricsSnapshot = {
  readonly mcpRequestsTotal: ReadonlyMap<string, ReadonlyMap<string, number>>;
  readonly toolCallsTotal: ReadonlyMap<string, ReadonlyMap<string, number>>;
  readonly toolDurationSeconds: ReadonlyMap<string, HistogramSnapshot>;
  readonly projectLockEventsTotal: ReadonlyMap<string, ReadonlyMap<string, number>>;
  readonly persistenceReady: ReadonlyMap<string, number>;
};

export type HistogramSnapshot = {
  readonly buckets: readonly number[];
  readonly counts: readonly number[]; // Non-cumulative, last bucket is +Inf.
  readonly sum: number;
  readonly count: number;
};

export interface MetricsRegistry {
  recordMcpRequest(method: string, status: number): void;
  recordToolCall(tool: string, ok: boolean, durationSeconds: number): void;
  recordProjectLockEvent(event: string, outcome: string): void;
  setPersistenceReady(component: string, ready: boolean): void;
  toPrometheusText(): string;
  snapshot(): MetricsSnapshot;
}

const TOOL_DURATION_BUCKETS_SECONDS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10
] as const;

const escapeLabelValue = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"');

const formatLabels = (labels: Record<string, string>): string => {
  const keys = Object.keys(labels);
  if (keys.length === 0) return '';
  return `{${keys.map((key) => `${key}="${escapeLabelValue(labels[key] ?? '')}"`).join(',')}}`;
};

const formatNumber = (value: number): string => {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return '+Inf';
  if (value === -Infinity) return '-Inf';
  return String(value);
};

class Histogram {
  private readonly buckets: readonly number[];
  private readonly counts: number[];
  private sum = 0;
  private count = 0;

  constructor(buckets: readonly number[]) {
    this.buckets = [...buckets];
    this.counts = new Array(this.buckets.length + 1).fill(0);
  }

  observe(value: number): void {
    if (!Number.isFinite(value)) return;
    const normalized = value < 0 ? 0 : value;
    this.sum += normalized;
    this.count += 1;
    const bucketIndex = this.findBucket(normalized);
    this.counts[bucketIndex] = (this.counts[bucketIndex] ?? 0) + 1;
  }

  snapshot(): HistogramSnapshot {
    return {
      buckets: [...this.buckets],
      counts: [...this.counts],
      sum: this.sum,
      count: this.count
    };
  }

  private findBucket(value: number): number {
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= (this.buckets[i] ?? Infinity)) return i;
    }
    return this.buckets.length;
  }
}

const ensureUpperMethod = (method: string): string => String(method || 'GET').toUpperCase();

const ensureToolLabel = (tool: string): string => String(tool || 'unknown');

export class InMemoryMetricsRegistry implements MetricsRegistry {
  private readonly mcpRequestsTotal = new Map<string, Map<string, number>>();
  private readonly toolCallsTotal = new Map<string, Map<string, number>>();
  private readonly toolDurations = new Map<string, Histogram>();
  private readonly projectLockEventsTotal = new Map<string, Map<string, number>>();
  private readonly persistenceReady = new Map<string, number>();

  recordMcpRequest(method: string, status: number): void {
    const normalizedMethod = ensureUpperMethod(method);
    const normalizedStatus = String(Math.trunc(Number.isFinite(status) ? status : 0));
    const byStatus = this.mcpRequestsTotal.get(normalizedMethod) ?? new Map<string, number>();
    byStatus.set(normalizedStatus, (byStatus.get(normalizedStatus) ?? 0) + 1);
    this.mcpRequestsTotal.set(normalizedMethod, byStatus);
  }

  recordToolCall(tool: string, ok: boolean, durationSeconds: number): void {
    const normalizedTool = ensureToolLabel(tool);
    const okLabel = ok ? 'true' : 'false';
    const byOk = this.toolCallsTotal.get(normalizedTool) ?? new Map<string, number>();
    byOk.set(okLabel, (byOk.get(okLabel) ?? 0) + 1);
    this.toolCallsTotal.set(normalizedTool, byOk);

    const histogram = this.toolDurations.get(normalizedTool) ?? new Histogram(TOOL_DURATION_BUCKETS_SECONDS);
    histogram.observe(durationSeconds);
    this.toolDurations.set(normalizedTool, histogram);
  }

  recordProjectLockEvent(event: string, outcome: string): void {
    const normalizedEvent = String(event || 'unknown');
    const normalizedOutcome = String(outcome || 'unknown');
    const byOutcome = this.projectLockEventsTotal.get(normalizedEvent) ?? new Map<string, number>();
    byOutcome.set(normalizedOutcome, (byOutcome.get(normalizedOutcome) ?? 0) + 1);
    this.projectLockEventsTotal.set(normalizedEvent, byOutcome);
  }

  setPersistenceReady(component: string, ready: boolean): void {
    const label = String(component || 'unknown');
    this.persistenceReady.set(label, ready ? 1 : 0);
  }

  toPrometheusText(): string {
    const lines: string[] = [];

    lines.push('# HELP ashfox_mcp_requests_total Total MCP HTTP requests.');
    lines.push('# TYPE ashfox_mcp_requests_total counter');
    for (const method of [...this.mcpRequestsTotal.keys()].sort((a, b) => a.localeCompare(b))) {
      const byStatus = this.mcpRequestsTotal.get(method);
      if (!byStatus) continue;
      for (const status of [...byStatus.keys()].sort((a, b) => a.localeCompare(b))) {
        const value = byStatus.get(status);
        if (!value) continue;
        lines.push(`ashfox_mcp_requests_total${formatLabels({ status, method })} ${value}`);
      }
    }
    lines.push('');

    lines.push('# HELP ashfox_project_lock_events_total Total project lock lifecycle events.');
    lines.push('# TYPE ashfox_project_lock_events_total counter');
    for (const event of [...this.projectLockEventsTotal.keys()].sort((a, b) => a.localeCompare(b))) {
      const byOutcome = this.projectLockEventsTotal.get(event);
      if (!byOutcome) continue;
      for (const outcome of [...byOutcome.keys()].sort((a, b) => a.localeCompare(b))) {
        const value = byOutcome.get(outcome);
        if (!value) continue;
        lines.push(`ashfox_project_lock_events_total${formatLabels({ event, outcome })} ${value}`);
      }
    }
    lines.push('');

    lines.push('# HELP ashfox_tool_calls_total Total tool calls.');
    lines.push('# TYPE ashfox_tool_calls_total counter');
    for (const tool of [...this.toolCallsTotal.keys()].sort((a, b) => a.localeCompare(b))) {
      const byOk = this.toolCallsTotal.get(tool);
      if (!byOk) continue;
      for (const okLabel of [...byOk.keys()].sort((a, b) => a.localeCompare(b))) {
        const value = byOk.get(okLabel);
        if (!value) continue;
        lines.push(`ashfox_tool_calls_total${formatLabels({ tool, ok: okLabel })} ${value}`);
      }
    }
    lines.push('');

    lines.push('# HELP ashfox_tool_duration_seconds Tool call duration in seconds.');
    lines.push('# TYPE ashfox_tool_duration_seconds histogram');
    for (const tool of [...this.toolDurations.keys()].sort((a, b) => a.localeCompare(b))) {
      const histogram = this.toolDurations.get(tool);
      if (!histogram) continue;
      const snapshot = histogram.snapshot();
      let cumulative = 0;
      for (let i = 0; i < snapshot.buckets.length; i++) {
        cumulative += snapshot.counts[i] ?? 0;
        lines.push(
          `ashfox_tool_duration_seconds_bucket${formatLabels({ tool, le: String(snapshot.buckets[i]) })} ${cumulative}`
        );
      }
      cumulative += snapshot.counts[snapshot.counts.length - 1] ?? 0;
      lines.push(`ashfox_tool_duration_seconds_bucket${formatLabels({ tool, le: '+Inf' })} ${cumulative}`);
      lines.push(`ashfox_tool_duration_seconds_sum${formatLabels({ tool })} ${formatNumber(snapshot.sum)}`);
      lines.push(`ashfox_tool_duration_seconds_count${formatLabels({ tool })} ${snapshot.count}`);
    }
    lines.push('');

    lines.push('# HELP ashfox_persistence_ready Persistence provider readiness (1=ready, 0=not ready).');
    lines.push('# TYPE ashfox_persistence_ready gauge');
    for (const component of [...this.persistenceReady.keys()].sort((a, b) => a.localeCompare(b))) {
      const value = this.persistenceReady.get(component);
      if (value === undefined) continue;
      lines.push(`ashfox_persistence_ready${formatLabels({ component })} ${value}`);
    }

    return `${lines.join('\n')}\n`;
  }

  snapshot(): MetricsSnapshot {
    const cloneNested = (source: Map<string, Map<string, number>>) => {
      const out = new Map<string, ReadonlyMap<string, number>>();
      for (const [key, nested] of source.entries()) {
        out.set(key, new Map(nested));
      }
      return out;
    };
    const cloneHistogram = (source: Map<string, Histogram>) => {
      const out = new Map<string, HistogramSnapshot>();
      for (const [tool, histogram] of source.entries()) {
        out.set(tool, histogram.snapshot());
      }
      return out;
    };
    return {
      mcpRequestsTotal: cloneNested(this.mcpRequestsTotal),
      toolCallsTotal: cloneNested(this.toolCallsTotal),
      toolDurationSeconds: cloneHistogram(this.toolDurations),
      projectLockEventsTotal: cloneNested(this.projectLockEventsTotal),
      persistenceReady: new Map(this.persistenceReady)
    };
  }
}
