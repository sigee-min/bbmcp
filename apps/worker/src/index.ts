import { createEngineBackend } from '@ashfox/backend-engine';
import { ConsoleLogger, type LogLevel } from '@ashfox/runtime/logging';
import { resolveWorkerRuntimeConfig } from './config';
import { runHeartbeat } from './heartbeat';
import { processOneNativeJob } from './nativeJobProcessor';

const config = resolveWorkerRuntimeConfig();
const logLevel: LogLevel = config.logLevel;
const logger = new ConsoleLogger('ashfox-worker', () => logLevel);

const backend = createEngineBackend({
  version: '0.0.0-scaffold',
  details: { queue: 'in-memory-placeholder' }
});

logger.info('ashfox worker started', { heartbeatMs: config.heartbeatMs });
void runHeartbeat(backend, logger);
const timer = setInterval(() => {
  void runHeartbeat(backend, logger);
}, config.heartbeatMs);
const jobTimer = setInterval(() => {
  void processOneNativeJob({
    workerId: config.workerId,
    logger,
    enabled: config.enableNativePipeline
  });
}, config.pollMs);

const shutdown = () => {
  clearInterval(timer);
  clearInterval(jobTimer);
  logger.info('ashfox worker shutdown');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
