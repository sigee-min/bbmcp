import { Inject, Injectable } from '@nestjs/common';
import type { PersistencePorts } from '@ashfox/backend-core';
import type {
  NativeAcquireProjectLockInput,
  NativeCreateFolderInput,
  NativeCreateProjectInput,
  NativeJob,
  NativeJobSubmitInput,
  NativeMoveFolderInput,
  NativeMoveProjectInput,
  NativeProjectLock,
  NativeProjectEvent,
  NativeProjectFolder,
  NativeProjectSnapshot,
  NativeReleaseProjectLockInput,
  NativeRenewProjectLockInput,
  NativeProjectTreeSnapshot
} from '@ashfox/native-pipeline/types';
import { ConsoleLogger, errorMessage, type Logger } from '@ashfox/runtime/logging';
import { InMemoryMetricsRegistry } from '@ashfox/runtime/observability';
import { McpRouter } from '@ashfox/runtime/transport/mcp/router';
import { GatewayConfigService } from './gateway-config.service';
import { GatewayPersistenceService } from './gateway-persistence.service';
import {
  GATEWAY_DASHBOARD_STORE,
  GATEWAY_LOGGER,
  GATEWAY_MCP_ROUTER,
  GATEWAY_METRICS_REGISTRY,
  GATEWAY_PERSISTENCE_PORTS
} from './tokens';
import type { GatewayRuntimeConfig } from './types';

export interface DashboardStorePort {
  listProjects(query?: string): Promise<NativeProjectSnapshot[]>;
  getProjectTree(query?: string): Promise<NativeProjectTreeSnapshot>;
  getProject(projectId: string): Promise<NativeProjectSnapshot | null>;
  createFolder(input: NativeCreateFolderInput): Promise<NativeProjectFolder>;
  renameFolder(folderId: string, nextName: string): Promise<NativeProjectFolder | null>;
  moveFolder(input: NativeMoveFolderInput): Promise<NativeProjectFolder | null>;
  deleteFolder(folderId: string): Promise<boolean>;
  createProject(input: NativeCreateProjectInput): Promise<NativeProjectSnapshot>;
  renameProject(projectId: string, nextName: string): Promise<NativeProjectSnapshot | null>;
  moveProject(input: NativeMoveProjectInput): Promise<NativeProjectSnapshot | null>;
  deleteProject(projectId: string): Promise<boolean>;
  getProjectLock(projectId: string): Promise<NativeProjectLock | null>;
  acquireProjectLock(input: NativeAcquireProjectLockInput): Promise<NativeProjectLock>;
  renewProjectLock(input: NativeRenewProjectLockInput): Promise<NativeProjectLock | null>;
  releaseProjectLock(input: NativeReleaseProjectLockInput): Promise<boolean>;
  releaseProjectLocksByOwner(ownerAgentId: string, ownerSessionId?: string | null): Promise<number>;
  listProjectJobs(projectId: string): Promise<NativeJob[]>;
  submitJob(input: NativeJobSubmitInput): Promise<NativeJob>;
  getProjectEventsSince(projectId: string, lastSeq: number): Promise<NativeProjectEvent[]>;
}

@Injectable()
export class GatewayRuntimeService {
  readonly config: GatewayRuntimeConfig;

  private shuttingDown = false;

  constructor(
    private readonly persistenceService: GatewayPersistenceService,
    configService: GatewayConfigService,
    @Inject(GATEWAY_LOGGER) readonly logger: ConsoleLogger,
    @Inject(GATEWAY_PERSISTENCE_PORTS) readonly persistence: PersistencePorts,
    @Inject(GATEWAY_DASHBOARD_STORE) readonly dashboardStore: DashboardStorePort,
    @Inject(GATEWAY_METRICS_REGISTRY) readonly metrics: InMemoryMetricsRegistry,
    @Inject(GATEWAY_MCP_ROUTER) readonly router: McpRouter
  ) {
    this.config = configService.runtime;
  }

  async shutdown(log: Logger = this.logger): Promise<void> {
    if (this.shuttingDown) {
      return;
    }
    this.shuttingDown = true;
    try {
      await this.persistenceService.shutdown();
    } catch (error) {
      log.error('ashfox gateway persistence shutdown failed', {
        message: errorMessage(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  withTraceLog(traceId: string): Logger {
    return {
      log: (level, message, meta) => this.logger.log(level, message, { ...(meta ?? {}), traceId }),
      debug: (message, meta) => this.logger.debug(message, { ...(meta ?? {}), traceId }),
      info: (message, meta) => this.logger.info(message, { ...(meta ?? {}), traceId }),
      warn: (message, meta) => this.logger.warn(message, { ...(meta ?? {}), traceId }),
      error: (message, meta) => this.logger.error(message, { ...(meta ?? {}), traceId })
    };
  }
}
