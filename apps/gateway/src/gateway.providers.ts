import type { Provider } from '@nestjs/common';
import { createBlockbenchBackend } from '@ashfox/backend-blockbench';
import { BackendRegistry, type PersistenceHealth, type PersistencePorts } from '@ashfox/backend-core';
import { createEngineBackend } from '@ashfox/backend-engine';
import type { Dispatcher } from '@ashfox/contracts/types/internal';
import { PersistentNativePipelineStore } from '@ashfox/native-pipeline/persistent';
import { PLUGIN_ID, PLUGIN_VERSION } from '@ashfox/runtime/config';
import { ConsoleLogger } from '@ashfox/runtime/logging';
import { InMemoryMetricsRegistry } from '@ashfox/runtime/observability';
import { SERVER_TOOL_INSTRUCTIONS } from '@ashfox/runtime/shared/tooling/toolInstructions';
import { LocalToolExecutor } from '@ashfox/runtime/transport/mcp/executor';
import { McpRouter } from '@ashfox/runtime/transport/mcp/router';
import { GATEWAY_VERSION } from './constants';
import { GatewayDispatcher } from './core/gateway-dispatcher';
import { GatewayConfigService } from './services/gateway-config.service';
import { WorkspacePolicyService } from './security/workspace-policy.service';
import {
  GATEWAY_BACKEND_REGISTRY,
  GATEWAY_DASHBOARD_STORE,
  GATEWAY_DISPATCHER,
  GATEWAY_LOGGER,
  GATEWAY_MCP_ROUTER,
  GATEWAY_METRICS_REGISTRY,
  GATEWAY_PERSISTENCE_HEALTH,
  GATEWAY_PERSISTENCE_PORTS
} from './tokens';

export const gatewayInfrastructureProviders: Provider[] = [
  {
    provide: GATEWAY_LOGGER,
    inject: [GatewayConfigService],
    useFactory: (config: GatewayConfigService): ConsoleLogger =>
      new ConsoleLogger('gateway', () => config.logLevel)
  },
  {
    provide: GATEWAY_METRICS_REGISTRY,
    inject: [GATEWAY_PERSISTENCE_HEALTH],
    useFactory: (health: PersistenceHealth): InMemoryMetricsRegistry => {
      const metrics = new InMemoryMetricsRegistry();
      metrics.setPersistenceReady('database', health.database.ready);
      metrics.setPersistenceReady('storage', health.storage.ready);
      return metrics;
    }
  },
  {
    provide: GATEWAY_DASHBOARD_STORE,
    inject: [GATEWAY_PERSISTENCE_PORTS],
    useFactory: (ports: PersistencePorts): PersistentNativePipelineStore =>
      new PersistentNativePipelineStore(ports.projectRepository)
  },
  {
    provide: WorkspacePolicyService,
    inject: [GATEWAY_PERSISTENCE_PORTS],
    useFactory: (persistence: PersistencePorts): WorkspacePolicyService =>
      new WorkspacePolicyService(persistence.workspaceRepository)
  },
  {
    provide: GATEWAY_BACKEND_REGISTRY,
    inject: [GATEWAY_PERSISTENCE_PORTS],
    useFactory: (persistence: PersistencePorts): BackendRegistry => {
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
      return registry;
    }
  },
  {
    provide: GATEWAY_DISPATCHER,
    inject: [
      GATEWAY_BACKEND_REGISTRY,
      GatewayConfigService,
      GATEWAY_DASHBOARD_STORE,
      GATEWAY_PERSISTENCE_PORTS,
      WorkspacePolicyService,
      GATEWAY_METRICS_REGISTRY,
      GATEWAY_LOGGER
    ],
    useFactory: (
      registry: BackendRegistry,
      config: GatewayConfigService,
      dashboardStore: PersistentNativePipelineStore,
      persistence: PersistencePorts,
      workspacePolicy: WorkspacePolicyService,
      metrics: InMemoryMetricsRegistry,
      logger: ConsoleLogger
    ): Dispatcher =>
      new GatewayDispatcher({
        registry,
        defaultBackend: config.runtime.backend,
        lockStore: dashboardStore,
        workspaceRepository: persistence.workspaceRepository,
        workspacePolicy,
        metrics,
        logger
      })
  },
  {
    provide: GATEWAY_MCP_ROUTER,
    inject: [GatewayConfigService, GATEWAY_DISPATCHER, GATEWAY_LOGGER, GATEWAY_METRICS_REGISTRY],
    useFactory: (
      config: GatewayConfigService,
      dispatcher: Dispatcher,
      logger: ConsoleLogger,
      metrics: InMemoryMetricsRegistry
    ): McpRouter => {
      const executor = new LocalToolExecutor(dispatcher);
      return new McpRouter(
        {
          path: config.runtime.path,
          serverInfo: { name: PLUGIN_ID, version: PLUGIN_VERSION },
          instructions: SERVER_TOOL_INSTRUCTIONS
        },
        executor,
        logger,
        undefined,
        undefined,
        metrics
      );
    }
  }
];
