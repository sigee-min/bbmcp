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

const DEFAULT_PROJECT_ID = 'default-project';
const DEFAULT_TENANT_ID = 'default-tenant';
const DEFAULT_ACTOR_ID = 'mcp-gateway';
const ENGINE_NATIVE_PROD_BLOCKED_TOOLS = new Set<ToolName>([
  'render_preview',
  'reload_plugins',
  'export_trace_log',
  'paint_faces'
]);

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
};

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const readProjectIdFromPayload = (payload: unknown): string => {
  const data = asRecord(payload);
  if (!data) return DEFAULT_PROJECT_ID;
  return (
    asNonEmptyString(data.projectId) ??
    asNonEmptyString(data.project_id) ??
    asNonEmptyString(data.projectName) ??
    asNonEmptyString(data.project) ??
    asNonEmptyString(data.name) ??
    DEFAULT_PROJECT_ID
  );
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
  nativeProdGuard?: boolean;
}

export class GatewayDispatcher implements Dispatcher {
  private readonly registry: BackendRegistry;
  private readonly lockManager: ProjectLockManager;
  private readonly defaultBackend: BackendKind;
  private readonly nativeProdGuard: boolean;

  constructor(options: GatewayDispatcherOptions) {
    this.registry = options.registry;
    this.lockManager = options.lockManager ?? new ProjectLockManager();
    this.defaultBackend = options.defaultBackend;
    this.nativeProdGuard = options.nativeProdGuard !== false;
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
    if (this.nativeProdGuard && selection.kind === 'engine' && ENGINE_NATIVE_PROD_BLOCKED_TOOLS.has(name)) {
      return backendToolError(
        'invalid_state',
        `Tool '${name}' is disabled in native production profile.`,
        'Use supported native workflows (for example export/get_project_state), or disable guard explicitly for non-prod usage.',
        { backend: selection.kind, tool: name, nativeProdGuard: true }
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
