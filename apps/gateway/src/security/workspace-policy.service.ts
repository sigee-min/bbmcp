import {
  evaluateWorkspaceFolderPermission,
  type WorkspaceFolderAclRecord,
  type WorkspaceMemberRecord,
  type WorkspacePermission,
  type WorkspaceRecord,
  type WorkspaceRepository,
  type WorkspaceRoleStorageRecord
} from '@ashfox/backend-core';

const DEFAULT_POLICY_CACHE_TTL_MS = 1_500;

export type GatewaySystemRole = 'system_admin' | 'cs_admin';

export interface WorkspacePolicyActor {
  accountId: string;
  systemRoles: readonly GatewaySystemRole[];
}

export interface WorkspaceCapabilities {
  canManageWorkspace: boolean;
  canManageMembers: boolean;
  canManageRoles: boolean;
  canManageFolderAcl: boolean;
}

export interface AuthorizeProjectWriteInput {
  workspaceId: string;
  folderId: string | null;
  folderPathFromRoot: readonly (string | null)[];
  projectId: string;
  tool: string;
  actor: WorkspacePolicyActor;
}

export type AuthorizeProjectWriteResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'workspace_not_found' | 'forbidden_workspace_project_write' | 'forbidden_workspace_folder_write';
      workspaceId: string;
      projectId: string;
      accountId: string;
      folderId: string | null;
      tool: string;
    };

type WorkspacePolicySnapshot = {
  workspace: WorkspaceRecord | null;
  roles: WorkspaceRoleStorageRecord[];
  roleMap: Map<string, WorkspaceRoleStorageRecord>;
  members: WorkspaceMemberRecord[];
  folderAcl: WorkspaceFolderAclRecord[];
  workspaceAdminRoleIds: string[];
};

type WorkspacePolicyCacheEntry = {
  expiresAt: number;
  snapshot: WorkspacePolicySnapshot;
};

const buildRoleMap = (roles: readonly WorkspaceRoleStorageRecord[]): Map<string, WorkspaceRoleStorageRecord> => {
  const roleMap = new Map<string, WorkspaceRoleStorageRecord>();
  for (const role of roles) {
    roleMap.set(role.roleId, role);
  }
  return roleMap;
};

const buildWorkspaceAdminRoleIds = (roles: readonly WorkspaceRoleStorageRecord[]): string[] =>
  roles.filter((role) => role.builtin === 'workspace_admin').map((role) => role.roleId);

const toPermissionSet = (
  member: WorkspaceMemberRecord | null,
  roleMap: ReadonlyMap<string, WorkspaceRoleStorageRecord>
): Set<WorkspacePermission> => {
  if (!member) {
    return new Set<WorkspacePermission>();
  }
  const permissions = new Set<WorkspacePermission>();
  for (const roleId of member.roleIds) {
    const role = roleMap.get(roleId);
    if (!role) {
      continue;
    }
    for (const permission of role.permissions) {
      permissions.add(permission);
    }
  }
  return permissions;
};

const resolveMember = (
  members: readonly WorkspaceMemberRecord[],
  accountId: string
): WorkspaceMemberRecord | null => members.find((entry) => entry.accountId === accountId) ?? null;

export class WorkspacePolicyService {
  private readonly cache = new Map<string, WorkspacePolicyCacheEntry>();
  private readonly cacheTtlMs: number;

  constructor(
    private readonly workspaceRepository: WorkspaceRepository,
    options?: {
      cacheTtlMs?: number;
    }
  ) {
    const ttl = options?.cacheTtlMs;
    this.cacheTtlMs = typeof ttl === 'number' && Number.isFinite(ttl) ? Math.max(0, Math.trunc(ttl)) : DEFAULT_POLICY_CACHE_TTL_MS;
  }

  isSystemManager(actor: WorkspacePolicyActor): boolean {
    return actor.systemRoles.includes('system_admin') || actor.systemRoles.includes('cs_admin');
  }

  invalidateWorkspace(workspaceId: string): void {
    this.cache.delete(workspaceId);
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  async getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null> {
    const snapshot = await this.readSnapshot(workspaceId);
    return snapshot.workspace;
  }

  async resolveWorkspaceRolePermissions(workspaceId: string, accountId: string): Promise<Set<WorkspacePermission>> {
    const snapshot = await this.readSnapshot(workspaceId);
    return toPermissionSet(resolveMember(snapshot.members, accountId), snapshot.roleMap);
  }

  async resolveWorkspaceCapabilities(workspace: WorkspaceRecord, actor: WorkspacePolicyActor): Promise<WorkspaceCapabilities> {
    if (workspace.mode === 'all_open') {
      return {
        canManageWorkspace: false,
        canManageMembers: false,
        canManageRoles: false,
        canManageFolderAcl: false
      };
    }
    if (this.isSystemManager(actor)) {
      return {
        canManageWorkspace: true,
        canManageMembers: true,
        canManageRoles: true,
        canManageFolderAcl: true
      };
    }
    const permissions = await this.resolveWorkspaceRolePermissions(workspace.workspaceId, actor.accountId);
    return {
      canManageWorkspace: permissions.has('workspace.settings.manage'),
      canManageMembers: permissions.has('workspace.members.manage'),
      canManageRoles: permissions.has('workspace.roles.manage'),
      canManageFolderAcl: permissions.has('workspace.roles.manage') || permissions.has('workspace.members.manage')
    };
  }

  async authorizeProjectWrite(input: AuthorizeProjectWriteInput): Promise<AuthorizeProjectWriteResult> {
    if (this.isSystemManager(input.actor)) {
      return { ok: true };
    }

    const snapshot = await this.readSnapshot(input.workspaceId);
    if (!snapshot.workspace) {
      return {
        ok: false,
        reason: 'workspace_not_found',
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        accountId: input.actor.accountId,
        folderId: input.folderId,
        tool: input.tool
      };
    }

    const member = resolveMember(snapshot.members, input.actor.accountId);
    const permissions = toPermissionSet(member, snapshot.roleMap);
    const memberRoleIds = member?.roleIds ?? [];
    const isWorkspaceAdmin = memberRoleIds.some((roleId) => snapshot.workspaceAdminRoleIds.includes(roleId));
    if (isWorkspaceAdmin) {
      return { ok: true };
    }

    if (snapshot.workspace.mode === 'rbac' && !permissions.has('project.write')) {
      return {
        ok: false,
        reason: 'forbidden_workspace_project_write',
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        accountId: input.actor.accountId,
        folderId: input.folderId,
        tool: input.tool
      };
    }

    const folderPermission = evaluateWorkspaceFolderPermission(
      {
        workspaceId: input.workspaceId,
        mode: snapshot.workspace.mode,
        accountId: input.actor.accountId,
        roleAssignments: member
          ? [
              {
                accountId: member.accountId,
                roleIds: member.roleIds
              }
            ]
          : [],
        roleCatalog: snapshot.roles.map((role) => ({
          roleId: role.roleId,
          name: role.roleId,
          builtin: role.builtin,
          permissions: role.permissions
        })),
        workspaceAdminRoleIds: snapshot.workspaceAdminRoleIds,
        folderAclRules: snapshot.folderAcl.map((rule) => ({
          workspaceId: rule.workspaceId,
          folderId: rule.folderId,
          roleId: rule.roleId,
          read: rule.read,
          write: rule.write
        }))
      },
      input.folderPathFromRoot
    );
    if (!folderPermission.write) {
      return {
        ok: false,
        reason: 'forbidden_workspace_folder_write',
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        accountId: input.actor.accountId,
        folderId: input.folderId,
        tool: input.tool
      };
    }
    return { ok: true };
  }

  private async readSnapshot(workspaceId: string): Promise<WorkspacePolicySnapshot> {
    const now = Date.now();
    const cached = this.cache.get(workspaceId);
    if (cached && cached.expiresAt > now) {
      return cached.snapshot;
    }

    const workspace = await this.workspaceRepository.getWorkspace(workspaceId);
    if (!workspace) {
      const emptySnapshot: WorkspacePolicySnapshot = {
        workspace: null,
        roles: [],
        roleMap: new Map(),
        members: [],
        folderAcl: [],
        workspaceAdminRoleIds: []
      };
      this.cache.set(workspaceId, {
        snapshot: emptySnapshot,
        expiresAt: now + this.cacheTtlMs
      });
      return emptySnapshot;
    }

    const [roles, members, folderAcl] = await Promise.all([
      this.workspaceRepository.listWorkspaceRoles(workspaceId),
      this.workspaceRepository.listWorkspaceMembers(workspaceId),
      this.workspaceRepository.listWorkspaceFolderAcl(workspaceId)
    ]);
    const snapshot: WorkspacePolicySnapshot = {
      workspace,
      roles,
      roleMap: buildRoleMap(roles),
      members,
      folderAcl,
      workspaceAdminRoleIds: buildWorkspaceAdminRoleIds(roles)
    };
    this.cache.set(workspaceId, {
      snapshot,
      expiresAt: now + this.cacheTtlMs
    });
    return snapshot;
  }
}

