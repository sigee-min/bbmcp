import { createEngineBackend } from '@ashfox/backend-engine';
import { ConsoleLogger, type LogLevel } from '@ashfox/runtime/logging';
import { closeGatewayPersistence, createGatewayPersistence } from '@ashfox/mcp-gateway/persistence';
import { resolveWorkerRuntimeConfig } from './config';
import { runHeartbeat } from './heartbeat';
import { processOneNativeJob } from './nativeJobProcessor';

const WORKER_VERSION = '0.0.2';

const config = resolveWorkerRuntimeConfig();
const logLevel: LogLevel = config.logLevel;
const logger = new ConsoleLogger('ashfox-worker', () => logLevel);
const queueBackend = String(process.env.ASHFOX_NATIVE_PIPELINE_BACKEND ?? 'persistence').trim().toLowerCase() === 'memory'
  ? 'memory'
  : 'persistence';
const persistence = createGatewayPersistence(process.env, { failFast: false });

const backend = createEngineBackend({
  version: WORKER_VERSION,
  details: { queue: queueBackend },
  persistence
});

const runHeartbeatSafely = async (): Promise<void> => {
  try {
    await runHeartbeat(backend, logger);
  } catch (error) {
    logger.error('ashfox worker heartbeat failed', {
      message: error instanceof Error ? error.message : String(error)
    });
  }
};

const processNativeJobSafely = async (): Promise<void> => {
  try {
    await processOneNativeJob({
      workerId: config.workerId,
      logger,
      enabled: config.enableNativePipeline,
      backend
    });
  } catch (error) {
    logger.error('ashfox worker job loop failed', {
      message: error instanceof Error ? error.message : String(error)
    });
  }
};

logger.info('ashfox worker started', { heartbeatMs: config.heartbeatMs });
void runHeartbeatSafely();
const timer = setInterval(() => {
  void runHeartbeatSafely();
}, config.heartbeatMs);
const jobTimer = setInterval(() => {
  void processNativeJobSafely();
}, config.pollMs);

let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(timer);
  clearInterval(jobTimer);
  void closeGatewayPersistence(persistence)
    .catch((error) => {
      logger.error('ashfox worker persistence shutdown failed', {
        message: error instanceof Error ? error.message : String(error)
      });
    })
    .finally(() => {
      logger.info('ashfox worker shutdown');
      process.exit(0);
    });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
