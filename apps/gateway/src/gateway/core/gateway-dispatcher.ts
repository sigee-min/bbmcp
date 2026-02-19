import { createHash } from 'node:crypto';
import type {
  Dispatcher,
  DispatcherExecutionContext,
  ToolName,
  ToolPayloadMap,
  ToolResultMap,
  ToolResponse
} from '@ashfox/contracts/types/internal';
import {
  BackendRegistry,
  type BackendSessionRef,
  type BackendKind,
  type BackendPort,
  ProjectLockManager,
  backendToolError,
  isMutatingTool
} from '@ashfox/backend-core';
import type { NativeAcquireProjectLockInput, NativeReleaseProjectLockInput } from '@ashfox/native-pipeline/types';
import type { Logger } from '@ashfox/runtime/logging';

const PROJECT_ID_PREFIX = 'prj';
const DEFAULT_PROJECT_ID = `${PROJECT_ID_PREFIX}_default`;
const DEFAULT_TENANT_ID = 'default-tenant';
const DEFAULT_ACTOR_ID = 'gateway';
const DEFAULT_MCP_LOCK_TTL_MS = 30_000;

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
};

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toHashedProjectId = (name: string): string => {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ');
  const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 12);
  return `${PROJECT_ID_PREFIX}_${digest}`;
};

const readProjectIdFromPayload = (payload: unknown): string => {
  const data = asRecord(payload);
  if (!data) return DEFAULT_PROJECT_ID;
  const explicitProjectId =
    asNonEmptyString(data.projectId) ??
    asNonEmptyString(data.project_id) ??
    asNonEmptyString(data.project);
  if (explicitProjectId) {
    return explicitProjectId;
  }
  const projectName = asNonEmptyString(data.projectName) ?? asNonEmptyString(data.name);
  if (projectName) {
    return toHashedProjectId(projectName);
  }
  return DEFAULT_PROJECT_ID;
};

const readBackendKindFromPayload = (payload: unknown): BackendKind | null => {
  const data = asRecord(payload);
  if (!data) return null;
  const raw = asNonEmptyString(data.backend);
  if (!raw) return null;
  if (raw === 'engine' || raw === 'blockbench') return raw;
  return null;
};

const resolveActorIdentity = (context?: DispatcherExecutionContext): { actorId: string; sessionId: string | null } => {
  const sessionId = asNonEmptyString(context?.mcpSessionId);
  if (!sessionId) {
    return { actorId: DEFAULT_ACTOR_ID, sessionId: null };
  }
  return {
    actorId: `mcp:${sessionId}`,
    sessionId
  };
};

export interface GatewayDispatcherOptions {
  registry: BackendRegistry;
  lockManager?: ProjectLockManager;
  lockStore?: GatewayDispatcherLockStore;
  metrics?: GatewayDispatcherLockMetrics;
  logger?: Logger;
  lockTtlMs?: number;
  defaultBackend: BackendKind;
}

export interface GatewayDispatcherLockStore {
  acquireProjectLock(input: NativeAcquireProjectLockInput): Promise<unknown>;
  releaseProjectLock(input: NativeReleaseProjectLockInput): Promise<boolean>;
}

export interface GatewayDispatcherLockMetrics {
  recordProjectLockEvent(event: string, outcome: string): void;
}

export class GatewayDispatcher implements Dispatcher {
  private readonly registry: BackendRegistry;
  private readonly lockManager: ProjectLockManager;
  private readonly lockStore?: GatewayDispatcherLockStore;
  private readonly metrics?: GatewayDispatcherLockMetrics;
  private readonly logger?: Logger;
  private readonly lockTtlMs: number;
  private readonly defaultBackend: BackendKind;

  constructor(options: GatewayDispatcherOptions) {
    this.registry = options.registry;
    this.lockManager = options.lockManager ?? new ProjectLockManager();
    this.lockStore = options.lockStore;
    this.metrics = options.metrics;
    this.logger = options.logger;
    this.lockTtlMs = typeof options.lockTtlMs === 'number' && Number.isFinite(options.lockTtlMs)
      ? Math.max(5_000, Math.trunc(options.lockTtlMs))
      : DEFAULT_MCP_LOCK_TTL_MS;
    this.defaultBackend = options.defaultBackend;
  }

  async handle<TName extends ToolName>(
    name: TName,
    payload: ToolPayloadMap[TName],
    context?: DispatcherExecutionContext
  ): Promise<ToolResponse<ToolResultMap[TName]>> {
    const selection = this.resolveBackend(payload);
    if (!selection) {
      return backendToolError(
        'invalid_state',
        `Requested backend is unavailable. Registered backends: ${this.registry.listKinds().join(', ') || 'none'}.`,
        'Register the backend and retry.',
        { defaultBackend: this.defaultBackend }
      ) as ToolResponse<ToolResultMap[TName]>;
    }
    const backend = selection.backend;
    const projectId = readProjectIdFromPayload(payload);
    const actor = resolveActorIdentity(context);
    const session: BackendSessionRef = {
      tenantId: DEFAULT_TENANT_ID,
      actorId: actor.actorId,
      projectId
    };
    const toolContext = { session };
    const run = () => backend.handleTool(name, payload, toolContext);
    if (!isMutatingTool(name)) {
      return run();
    }

    if (!this.lockStore) {
      return this.lockManager.run(projectId, run);
    }

    try {
      const lockResult = (await this.lockStore.acquireProjectLock({
        projectId,
        ownerAgentId: actor.actorId,
        ownerSessionId: actor.sessionId,
        ttlMs: this.lockTtlMs
      })) as { token?: unknown } | null;
      this.metrics?.recordProjectLockEvent('acquire', 'success');
      this.logger?.debug('gateway project lock acquired', {
        projectId,
        ownerAgentId: actor.actorId,
        sessionId: actor.sessionId,
        lockTokenPrefix:
          lockResult && typeof lockResult.token === 'string' ? lockResult.token.slice(0, 8) : undefined
      });
    } catch (error) {
      const conflict = error as {
        name?: string;
        ownerAgentId?: unknown;
        ownerSessionId?: unknown;
        expiresAt?: unknown;
      };
      if (conflict?.name === 'NativeProjectLockConflictError') {
        this.metrics?.recordProjectLockEvent('acquire', 'conflict');
        this.logger?.warn('gateway project lock conflict', {
          projectId,
          ownerAgentId: typeof conflict.ownerAgentId === 'string' ? conflict.ownerAgentId : null,
          ownerSessionId: typeof conflict.ownerSessionId === 'string' ? conflict.ownerSessionId : null,
          expiresAt: typeof conflict.expiresAt === 'string' ? conflict.expiresAt : null
        });
        return backendToolError(
          'invalid_state',
          `Project ${projectId} is locked by another agent.`,
          'Wait for the current MCP task to finish and retry.',
          {
            reason: 'project_locked',
            projectId,
            ownerAgentId: typeof conflict.ownerAgentId === 'string' ? conflict.ownerAgentId : null,
            ownerSessionId: typeof conflict.ownerSessionId === 'string' ? conflict.ownerSessionId : null,
            expiresAt: typeof conflict.expiresAt === 'string' ? conflict.expiresAt : null
          }
        ) as ToolResponse<ToolResultMap[TName]>;
      }
      this.metrics?.recordProjectLockEvent('acquire', 'error');
      throw error;
    }

    try {
      return await run();
    } finally {
      try {
        const released = await this.lockStore.releaseProjectLock({
          projectId,
          ownerAgentId: actor.actorId,
          ownerSessionId: actor.sessionId
        });
        this.metrics?.recordProjectLockEvent('release', released ? 'success' : 'skipped');
      } catch (error) {
        this.metrics?.recordProjectLockEvent('release', 'error');
        this.logger?.warn('gateway project lock release failed', {
          projectId,
          ownerAgentId: actor.actorId,
          sessionId: actor.sessionId,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  private resolveBackend(payload: unknown): { kind: BackendKind; backend: BackendPort } | null {
    const requested = readBackendKindFromPayload(payload) ?? this.defaultBackend;
    const backend = this.registry.resolve(requested);
    if (!backend) return null;
    return { kind: requested, backend };
  }
}
