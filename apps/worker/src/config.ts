import type { LogLevel } from '@ashfox/runtime/logging';

const DEFAULT_HEARTBEAT_MS = 5000;
const DEFAULT_POLL_MS = 1200;

const toPositiveInt = (raw: string | undefined, fallback: number): number => {
  const value = Number(raw ?? fallback);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
};

export type WorkerRuntimeConfig = {
  logLevel: LogLevel;
  heartbeatMs: number;
  pollMs: number;
  enableNativePipeline: boolean;
  workerId: string;
};

export type NativePipelineQueueBackend = 'memory' | 'persistence';

export const resolveWorkerRuntimeConfig = (env: NodeJS.ProcessEnv): WorkerRuntimeConfig => ({
  logLevel: (env.ASHFOX_WORKER_LOG_LEVEL as LogLevel) ?? 'info',
  heartbeatMs: toPositiveInt(env.ASHFOX_WORKER_HEARTBEAT_MS, DEFAULT_HEARTBEAT_MS),
  pollMs: toPositiveInt(env.ASHFOX_WORKER_POLL_MS, DEFAULT_POLL_MS),
  enableNativePipeline: String(env.ASHFOX_WORKER_NATIVE_PIPELINE ?? '1') === '1',
  workerId: env.ASHFOX_WORKER_ID?.trim() || `worker-${process.pid}`
});

export const resolveNativePipelineQueueBackend = (env: NodeJS.ProcessEnv): NativePipelineQueueBackend =>
  String(env.ASHFOX_NATIVE_PIPELINE_BACKEND ?? 'persistence').trim().toLowerCase() === 'memory'
    ? 'memory'
    : 'persistence';
