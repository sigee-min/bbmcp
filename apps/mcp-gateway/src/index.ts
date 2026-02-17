import { createBlockbenchBackend } from '@ashfox/backend-blockbench';
import { BackendRegistry, type BackendKind } from '@ashfox/backend-core';
import { createEngineBackend } from '@ashfox/backend-engine';
import { ConsoleLogger, type LogLevel } from '@ashfox/runtime/logging';
import { InMemoryMetricsRegistry } from '@ashfox/runtime/observability';
import { startServer, type ServerConfig } from '@ashfox/runtime/server';
import { GatewayDispatcher } from './dispatcher';
import { closeGatewayPersistence, createGatewayPersistence } from './persistence';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8787;
const DEFAULT_PATH = '/mcp';
const DEFAULT_BACKEND: BackendKind = 'engine';
const GATEWAY_VERSION = '0.0.2';

const toPort = (raw: string | undefined): number => {
  const numeric = Number(raw ?? DEFAULT_PORT);
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 65535) {
    return DEFAULT_PORT;
  }
  return Math.floor(numeric);
};

const resolveBackendKind = (raw: string | undefined): BackendKind => {
  if (raw === 'blockbench' || raw === 'engine') return raw;
  return DEFAULT_BACKEND;
};

const resolveBooleanFlag = (raw: string | undefined, fallback: boolean): boolean => {
  const normalized = String(raw ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return true;
};

const toLoggableError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }
  return { error: String(error) };
};

const logLevel: LogLevel = (process.env.ASHFOX_GATEWAY_LOG_LEVEL as LogLevel) ?? 'info';
const logger = new ConsoleLogger('ashfox-gateway', () => logLevel);

const main = async (): Promise<void> => {
  const metrics = new InMemoryMetricsRegistry();
  const persistence = createGatewayPersistence(process.env, {
    failFast: resolveBooleanFlag(process.env.ASHFOX_PERSISTENCE_FAIL_FAST, true)
  });
  metrics.setPersistenceReady('database', persistence.health.database.ready);
  metrics.setPersistenceReady('storage', persistence.health.storage.ready);

  const registry = new BackendRegistry();
  registry.register(
    createEngineBackend({
      version: GATEWAY_VERSION,
      details: { mode: 'standalone' },
      persistence
    })
  );
  registry.register(
    createBlockbenchBackend({
      version: GATEWAY_VERSION,
      details: { mode: 'requires_plugin_bridge' }
    })
  );

  const dispatcher = new GatewayDispatcher({
    registry,
    defaultBackend: resolveBackendKind(process.env.ASHFOX_GATEWAY_BACKEND)
  });

  const config: ServerConfig = {
    host: process.env.ASHFOX_HOST ?? DEFAULT_HOST,
    port: toPort(process.env.ASHFOX_PORT),
    path: process.env.ASHFOX_PATH ?? DEFAULT_PATH
  };

  const stop = startServer(config, dispatcher, logger, { metrics });
  if (!stop) {
    await closeGatewayPersistence(persistence);
    throw new Error(
      `ashfox gateway failed to start (host=${config.host}, port=${config.port}, path=${config.path}).`
    );
  }

  logger.info('ashfox gateway started', {
    host: config.host,
    port: config.port,
    path: config.path,
    backend: resolveBackendKind(process.env.ASHFOX_GATEWAY_BACKEND),
    persistence: persistence.health
  });

  let shuttingDown = false;
  const shutdown = async (signal: 'SIGINT' | 'SIGTERM') => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('ashfox gateway shutdown', { signal });
    let exitCode = 0;
    try {
      await closeGatewayPersistence(persistence);
    } catch (error) {
      exitCode = 1;
      logger.error('ashfox gateway persistence shutdown failed', toLoggableError(error));
    }
    stop();
    process.exit(exitCode);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
};

void main().catch((error) => {
  logger.error('ashfox gateway startup failed', toLoggableError(error));
  process.exit(1);
});
