import { createEngineBackend } from '@ashfox/backend-engine';
import { closeGatewayPersistence, createGatewayPersistence } from '@ashfox/gateway-persistence';
import type { ProjectRepositoryScope } from '@ashfox/backend-core';
import { ConsoleLogger, type LogLevel } from '@ashfox/runtime/logging';
import { resolveNativePipelineQueueBackend, resolveWorkerRuntimeConfig } from './config';
import { runHeartbeat } from './heartbeat';
import { configureWorkerNativePipelineStore, processOneNativeJob } from './nativeJobProcessor';

const WORKER_VERSION = '0.0.2';

const env = process.env;
configureWorkerNativePipelineStore(env);
const config = resolveWorkerRuntimeConfig(env);
const logLevel: LogLevel = config.logLevel;
const logger = new ConsoleLogger('ashfox-worker', () => logLevel);
const queueBackend = resolveNativePipelineQueueBackend(env);
const persistence = createGatewayPersistence(env, { failFast: false });
const NATIVE_PIPELINE_STATE_SCOPE_PREFIX: ProjectRepositoryScope = {
  tenantId: 'native-pipeline',
  projectId: 'pipeline-state:'
};
const NATIVE_PIPELINE_WORKSPACE_SCAN_TTL_MS = 2000;

const toWorkspaceIdHints = (raw: string | undefined): string[] => {
  if (!raw) {
    return [];
  }
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((token) => token.trim())
        .filter((token) => token.length > 0)
    )
  );
};

const extractWorkspaceIdFromStateScope = (projectId: string): string | null => {
  if (!projectId.startsWith(NATIVE_PIPELINE_STATE_SCOPE_PREFIX.projectId)) {
    return null;
  }
  const workspaceId = projectId.slice(NATIVE_PIPELINE_STATE_SCOPE_PREFIX.projectId.length).trim();
  return workspaceId.length > 0 ? workspaceId : null;
};

const createWorkspaceIdsResolver = () => {
  const hintWorkspaceIds = toWorkspaceIdHints(env.ASHFOX_WORKER_WORKSPACE_IDS);
  let cachedWorkspaceIds = [...hintWorkspaceIds];
  let lastLoadedAt = 0;
  return async (): Promise<readonly string[]> => {
    const now = Date.now();
    if (now - lastLoadedAt < NATIVE_PIPELINE_WORKSPACE_SCAN_TTL_MS) {
      return cachedWorkspaceIds;
    }
    const discovered = new Set<string>(hintWorkspaceIds);
    const records = await persistence.projectRepository.listByScopePrefix(NATIVE_PIPELINE_STATE_SCOPE_PREFIX);
    for (const record of records) {
      const workspaceId = extractWorkspaceIdFromStateScope(record.scope.projectId);
      if (workspaceId) {
        discovered.add(workspaceId);
      }
    }
    cachedWorkspaceIds = Array.from(discovered.values()).sort((left, right) => left.localeCompare(right));
    lastLoadedAt = now;
    return cachedWorkspaceIds;
  };
};
const resolveWorkspaceIds = createWorkspaceIdsResolver();

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
      backend,
      workspaceIdsResolver: resolveWorkspaceIds
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
