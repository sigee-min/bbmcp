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
  type WorkspaceRepository,
  ProjectLockManager,
  backendToolError,
  isMutatingTool
} from '@ashfox/backend-core';
import type {
  NativeAcquireProjectLockInput,
  NativeProjectSnapshot,
  NativeProjectTreeNode
} from '@ashfox/native-pipeline/types';
import type { Logger } from '@ashfox/runtime/logging';
import { WorkspacePolicyService, type GatewaySystemRole } from '../security/workspace-policy.service';

const PROJECT_ID_PREFIX = 'prj';
const DEFAULT_PROJECT_ID = `${PROJECT_ID_PREFIX}_default`;
const DEFAULT_WORKSPACE_ID = 'ws_default';
const DEFAULT_TENANT_ID = 'default-tenant';
const DEFAULT_ACTOR_ID = 'gateway';
const DEFAULT_ACCOUNT_ID = 'anonymous';
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

const readWorkspaceIdFromPayload = (payload: unknown): string | undefined => {
  const data = asRecord(payload);
  if (!data) return undefined;
  return (
    asNonEmptyString(data.workspaceId) ??
    asNonEmptyString(data.workspace_id) ??
    asNonEmptyString(data.workspace) ??
    undefined
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

const toGatewaySystemRoles = (roles: readonly string[] | undefined): GatewaySystemRole[] => {
  if (!Array.isArray(roles)) {
    return [];
  }
  const deduped = new Set<GatewaySystemRole>();
  for (const role of roles) {
    if (role === 'system_admin' || role === 'cs_admin') {
      deduped.add(role);
    }
  }
  return [...deduped];
};

type GatewayActorIdentity = {
  actorId: string;
  sessionId: string | null;
  accountId: string;
  systemRoles: GatewaySystemRole[];
  workspaceId?: string;
};

const resolveActorIdentity = (context?: DispatcherExecutionContext): GatewayActorIdentity => {
  const sessionId = asNonEmptyString(context?.mcpSessionId);
  const accountId = asNonEmptyString(context?.mcpAccountId) ?? DEFAULT_ACCOUNT_ID;
  const workspaceId = asNonEmptyString(context?.mcpWorkspaceId) ?? undefined;
  const systemRoles = toGatewaySystemRoles(context?.mcpSystemRoles);
  if (!sessionId) {
    return {
      actorId: DEFAULT_ACTOR_ID,
      sessionId: null,
      accountId,
      systemRoles,
      workspaceId
    };
  }
  return {
    actorId: `mcp:${sessionId}`,
    sessionId,
    accountId,
    systemRoles,
    workspaceId
  };
};

const normalizeWorkspaceId = (workspaceId?: string): string => {
  if (typeof workspaceId !== 'string') {
    return DEFAULT_WORKSPACE_ID;
  }
  const trimmed = workspaceId.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_WORKSPACE_ID;
};

const collectFolderParents = (nodes: readonly NativeProjectTreeNode[], parentMap: Map<string, string | null>): void => {
  for (const node of nodes) {
    if (node.kind !== 'folder') {
      continue;
    }
    parentMap.set(node.folderId, node.parentFolderId);
    collectFolderParents(node.children, parentMap);
  }
};

const toFolderPathFromRoot = (treeNodes: readonly NativeProjectTreeNode[], folderId: string | null): readonly (string | null)[] => {
  if (!folderId) {
    return [null];
  }
  const parentMap = new Map<string, string | null>();
  collectFolderParents(treeNodes, parentMap);
  if (!parentMap.has(folderId)) {
    return [null];
  }
  const chain: string[] = [];
  let currentId: string | null = folderId;
  let guard = 0;
  while (currentId) {
    chain.unshift(currentId);
    currentId = parentMap.get(currentId) ?? null;
    guard += 1;
    if (guard > 64) {
      break;
    }
  }
  return [null, ...chain];
};

type GatewayDispatcherProjectScope = {
  workspaceId: string;
  folderId: string | null;
};

export interface GatewayDispatcherOptions {
  registry: BackendRegistry;
  lockManager?: ProjectLockManager;
  lockStore?: GatewayDispatcherLockStore;
  workspaceRepository?: WorkspaceRepository;
  workspacePolicy?: WorkspacePolicyService;
  metrics?: GatewayDispatcherLockMetrics;
  logger?: Logger;
  lockTtlMs?: number;
  defaultBackend: BackendKind;
}

export interface GatewayDispatcherLockStore {
  acquireProjectLock(input: NativeAcquireProjectLockInput): Promise<unknown>;
  getProject?(projectId: string, workspaceId?: string): Promise<NativeProjectSnapshot | null>;
  getProjectTree?(query?: string, workspaceId?: string): Promise<{ roots: NativeProjectTreeNode[] }>;
}

export interface GatewayDispatcherLockMetrics {
  recordProjectLockEvent(event: string, outcome: string): void;
}

export class GatewayDispatcher implements Dispatcher {
  private readonly registry: BackendRegistry;
  private readonly lockManager: ProjectLockManager;
  private readonly lockStore?: GatewayDispatcherLockStore;
  private readonly workspaceRepository?: WorkspaceRepository;
  private readonly workspacePolicy?: WorkspacePolicyService;
  private readonly metrics?: GatewayDispatcherLockMetrics;
  private readonly logger?: Logger;
  private readonly lockTtlMs: number;
  private readonly defaultBackend: BackendKind;

  constructor(options: GatewayDispatcherOptions) {
    this.registry = options.registry;
    this.lockManager = options.lockManager ?? new ProjectLockManager();
    this.lockStore = options.lockStore;
    this.workspaceRepository = options.workspaceRepository;
    this.workspacePolicy = options.workspacePolicy ?? (options.workspaceRepository ? new WorkspacePolicyService(options.workspaceRepository) : undefined);
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
    const workspaceHint = normalizeWorkspaceId(readWorkspaceIdFromPayload(payload) ?? context?.mcpWorkspaceId);
    const actor = resolveActorIdentity(context);
    const projectScope = await this.resolveProjectScope(projectId, workspaceHint, actor);
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

    const authorizationError = await this.authorizeProjectWrite(name, actor, projectId, projectScope);
    if (authorizationError) {
      return authorizationError as ToolResponse<ToolResultMap[TName]>;
    }

    const lockKey = `${projectScope.workspaceId}:${projectId}`;
    return this.lockManager.run(lockKey, async () => {
      if (!this.lockStore) {
        return run();
      }

      try {
        const lockResult = (await this.lockStore.acquireProjectLock({
          workspaceId: projectScope.workspaceId,
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

      return run();
    });
  }

  private async resolveProjectScope(
    projectId: string,
    workspaceHint: string,
    actor: GatewayActorIdentity
  ): Promise<GatewayDispatcherProjectScope> {
    if (!this.lockStore?.getProject) {
      return {
        workspaceId: workspaceHint,
        folderId: null
      };
    }

    const withinHint = await this.lockStore.getProject(projectId, workspaceHint);
    if (withinHint) {
      return {
        workspaceId: normalizeWorkspaceId(withinHint.workspaceId ?? workspaceHint),
        folderId: withinHint.parentFolderId ?? null
      };
    }

    if (!this.workspaceRepository) {
      return {
        workspaceId: workspaceHint,
        folderId: null
      };
    }

    const relatedWorkspaces = await this.workspaceRepository.listWorkspaces(actor.accountId);
    for (const workspace of relatedWorkspaces) {
      if (!workspace?.workspaceId || workspace.workspaceId === workspaceHint) {
        continue;
      }
      const found = await this.lockStore.getProject(projectId, workspace.workspaceId);
      if (!found) {
        continue;
      }
      return {
        workspaceId: normalizeWorkspaceId(found.workspaceId ?? workspace.workspaceId),
        folderId: found.parentFolderId ?? null
      };
    }

    return {
      workspaceId: workspaceHint,
      folderId: null
    };
  }

  private async authorizeProjectWrite<TName extends ToolName>(
    name: TName,
    actor: GatewayActorIdentity,
    projectId: string,
    scope: GatewayDispatcherProjectScope
  ): Promise<ToolResponse<ToolResultMap[TName]> | null> {
    if (!this.workspacePolicy) {
      return null;
    }
    const folderPath = await this.resolveFolderPath(scope.workspaceId, scope.folderId);
    const authorization = await this.workspacePolicy.authorizeProjectWrite({
      workspaceId: scope.workspaceId,
      folderId: scope.folderId,
      folderPathFromRoot: folderPath,
      projectId,
      tool: name,
      actor: {
        accountId: actor.accountId,
        systemRoles: actor.systemRoles
      }
    });
    if (authorization.ok) {
      return null;
    }
    if (authorization.reason === 'workspace_not_found') {
      return backendToolError(
        'invalid_state',
        `Workspace not found: ${scope.workspaceId}`,
        'Check workspace selection and retry.',
        {
          reason: authorization.reason,
          workspaceId: authorization.workspaceId,
          projectId: authorization.projectId,
          tool: authorization.tool
        }
      ) as ToolResponse<ToolResultMap[TName]>;
    }
    if (authorization.reason === 'forbidden_workspace_project_write') {
      return backendToolError(
        'invalid_state',
        `Workspace write permission denied for project ${projectId}.`,
        'Request project.write permission from a workspace admin.',
        {
          reason: authorization.reason,
          workspaceId: authorization.workspaceId,
          projectId: authorization.projectId,
          accountId: authorization.accountId,
          tool: authorization.tool
        }
      ) as ToolResponse<ToolResultMap[TName]>;
    }
    return backendToolError(
      'invalid_state',
      `Folder write permission denied for project ${projectId}.`,
      'Request folder.write permission for this folder from a workspace admin.',
      {
        reason: authorization.reason,
        workspaceId: authorization.workspaceId,
        projectId: authorization.projectId,
        folderId: authorization.folderId,
        accountId: authorization.accountId,
        tool: authorization.tool
      }
    ) as ToolResponse<ToolResultMap[TName]>;
  }

  private async resolveFolderPath(workspaceId: string, folderId: string | null): Promise<readonly (string | null)[]> {
    if (!folderId || !this.lockStore?.getProjectTree) {
      return [null];
    }
    const tree = await this.lockStore.getProjectTree(undefined, workspaceId);
    return toFolderPathFromRoot(tree.roots, folderId);
  }

  private resolveBackend(payload: unknown): { kind: BackendKind; backend: BackendPort } | null {
    const requested = readBackendKindFromPayload(payload) ?? this.defaultBackend;
    const backend = this.registry.resolve(requested);
    if (!backend) return null;
    return { kind: requested, backend };
  }
}
