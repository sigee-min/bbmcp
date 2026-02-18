import { createHash } from 'node:crypto';
import type { Dispatcher, ToolName, ToolPayloadMap, ToolResultMap, ToolResponse } from '@ashfox/contracts/types/internal';
import {
  BackendRegistry,
  type BackendSessionRef,
  type BackendKind,
  type BackendPort,
  ProjectLockManager,
  backendToolError,
  isMutatingTool
} from '@ashfox/backend-core';

const PROJECT_ID_PREFIX = 'prj';
const DEFAULT_PROJECT_ID = `${PROJECT_ID_PREFIX}_default`;
const DEFAULT_TENANT_ID = 'default-tenant';
const DEFAULT_ACTOR_ID = 'gateway';

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

export interface GatewayDispatcherOptions {
  registry: BackendRegistry;
  lockManager?: ProjectLockManager;
  defaultBackend: BackendKind;
}

export class GatewayDispatcher implements Dispatcher {
  private readonly registry: BackendRegistry;
  private readonly lockManager: ProjectLockManager;
  private readonly defaultBackend: BackendKind;

  constructor(options: GatewayDispatcherOptions) {
    this.registry = options.registry;
    this.lockManager = options.lockManager ?? new ProjectLockManager();
    this.defaultBackend = options.defaultBackend;
  }

  async handle<TName extends ToolName>(
    name: TName,
    payload: ToolPayloadMap[TName]
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
    const session: BackendSessionRef = {
      tenantId: DEFAULT_TENANT_ID,
      actorId: DEFAULT_ACTOR_ID,
      projectId
    };
    const context = { session };
    const run = () => backend.handleTool(name, payload, context);
    if (!isMutatingTool(name)) {
      return run();
    }
    return this.lockManager.run(projectId, run);
  }

  private resolveBackend(payload: unknown): { kind: BackendKind; backend: BackendPort } | null {
    const requested = readBackendKindFromPayload(payload) ?? this.defaultBackend;
    const backend = this.registry.resolve(requested);
    if (!backend) return null;
    return { kind: requested, backend };
  }
}
