import {
  evaluateWorkspaceFolderPermission,
  hasSystemRole,
  SYSTEM_ROLES,
  type SystemRole,
  type WorkspaceAclRuleRecord,
  type WorkspaceMemberRecord,
  type WorkspacePermission,
  type WorkspaceRecord,
  type WorkspaceRepository,
  type WorkspaceRoleStorageRecord
} from '@ashfox/backend-core';

const DEFAULT_POLICY_CACHE_TTL_MS = 1_500;

export type GatewaySystemRole = SystemRole;

export interface WorkspacePolicyActor {
  accountId: string;
  systemRoles: readonly GatewaySystemRole[];
}

export type WorkspaceAccessPermission = WorkspacePermission | 'workspace.member';

export interface WorkspaceCapabilities {
  canManageWorkspaceSettings: boolean;
}

export type AuthorizeWorkspaceAccessResult =
  | {
      ok: true;
      workspace: WorkspaceRecord;
    }
  | {
      ok: false;
      reason: 'workspace_not_found' | 'forbidden_workspace';
      workspaceId: string;
      accountId: string;
      permission: WorkspaceAccessPermission;
    };

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

export interface AuthorizeProjectReadInput {
  workspaceId: string;
  folderId: string | null;
  folderPathFromRoot: readonly (string | null)[];
  projectId: string;
  tool: string;
  actor: WorkspacePolicyActor;
}

export type AuthorizeProjectReadResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'workspace_not_found' | 'forbidden_workspace_project_read' | 'forbidden_workspace_folder_read';
      workspaceId: string;
      projectId: string;
      accountId: string;
      folderId: string | null;
      tool: string;
    };

type WorkspacePolicySnapshot = {
  workspace: WorkspaceRecord | null;
  roles: WorkspaceRoleStorageRecord[];
  members: WorkspaceMemberRecord[];
  aclRules: WorkspaceAclRuleRecord[];
  workspaceAdminRoleIds: string[];
};

type WorkspacePolicyCacheEntry = {
  expiresAt: number;
  snapshot: WorkspacePolicySnapshot;
};

const buildWorkspaceAdminRoleIds = (roles: readonly WorkspaceRoleStorageRecord[]): string[] =>
  roles.filter((role) => role.builtin === 'workspace_admin').map((role) => role.roleId);

const resolveMember = (
  members: readonly WorkspaceMemberRecord[],
  accountId: string
): WorkspaceMemberRecord | null => members.find((entry) => entry.accountId === accountId) ?? null;

const toAclRules = (rules: readonly WorkspaceAclRuleRecord[]): WorkspaceAclRuleRecord[] =>
  rules.map((rule) => ({
    ...rule,
    scope: rule.scope ?? 'folder',
    locked: Boolean(rule.locked)
  }));

const toRoleAssignments = (member: WorkspaceMemberRecord): Array<{ accountId: string; roleIds: string[] }> => [
  {
    accountId: member.accountId,
    roleIds: member.roleIds
  }
];

const isWorkspaceAdmin = (
  member: WorkspaceMemberRecord,
  workspaceAdminRoleIds: readonly string[]
): boolean => member.roleIds.some((roleId) => workspaceAdminRoleIds.includes(roleId));

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
    return SYSTEM_ROLES.some((role) => hasSystemRole(actor.systemRoles, role));
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
    const member = resolveMember(snapshot.members, accountId);
    if (!snapshot.workspace || !member) {
      return new Set<WorkspacePermission>();
    }
    const roleAssignments = toRoleAssignments(member);
    const folderPermission = evaluateWorkspaceFolderPermission(
      {
        workspaceId,
        accountId,
        roleAssignments,
        workspaceAdminRoleIds: snapshot.workspaceAdminRoleIds,
        aclRules: snapshot.aclRules
      },
      [null]
    );
    const permissions = new Set<WorkspacePermission>();
    if (isWorkspaceAdmin(member, snapshot.workspaceAdminRoleIds)) {
      permissions.add('workspace.manage');
    }
    if (folderPermission.read) {
      permissions.add('folder.read');
    }
    if (folderPermission.write) {
      permissions.add('folder.write');
    }
    return permissions;
  }

  async authorizeWorkspaceAccess(
    workspaceId: string,
    actor: WorkspacePolicyActor,
    permission: WorkspaceAccessPermission = 'workspace.member'
  ): Promise<AuthorizeWorkspaceAccessResult> {
    const snapshot = await this.readSnapshot(workspaceId);
    if (!snapshot.workspace) {
      return {
        ok: false,
        reason: 'workspace_not_found',
        workspaceId,
        accountId: actor.accountId,
        permission
      };
    }

    if (this.isSystemManager(actor)) {
      return {
        ok: true,
        workspace: snapshot.workspace
      };
    }

    const member = resolveMember(snapshot.members, actor.accountId);
    if (!member) {
      return {
        ok: false,
        reason: 'forbidden_workspace',
        workspaceId,
        accountId: actor.accountId,
        permission
      };
    }

    if (permission === 'workspace.member') {
      return {
        ok: true,
        workspace: snapshot.workspace
      };
    }

    if (permission === 'workspace.manage') {
      if (isWorkspaceAdmin(member, snapshot.workspaceAdminRoleIds)) {
        return {
          ok: true,
          workspace: snapshot.workspace
        };
      }
      return {
        ok: false,
        reason: 'forbidden_workspace',
        workspaceId,
        accountId: actor.accountId,
        permission
      };
    }

    const folderPermission = evaluateWorkspaceFolderPermission(
      {
        workspaceId,
        accountId: actor.accountId,
        roleAssignments: toRoleAssignments(member),
        workspaceAdminRoleIds: snapshot.workspaceAdminRoleIds,
        aclRules: snapshot.aclRules
      },
      [null]
    );
    const allowed = permission === 'folder.write' ? folderPermission.write : folderPermission.read;
    if (allowed) {
      return {
        ok: true,
        workspace: snapshot.workspace
      };
    }
    return {
      ok: false,
      reason: 'forbidden_workspace',
      workspaceId,
      accountId: actor.accountId,
      permission
    };
  }

  async resolveWorkspaceCapabilities(workspace: WorkspaceRecord, actor: WorkspacePolicyActor): Promise<WorkspaceCapabilities> {
    if (this.isSystemManager(actor)) {
      return {
        canManageWorkspaceSettings: true
      };
    }
    const permissions = await this.resolveWorkspaceRolePermissions(workspace.workspaceId, actor.accountId);
    const canManage = permissions.has('workspace.manage');
    return {
      canManageWorkspaceSettings: canManage
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
    if (!member) {
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

    if (isWorkspaceAdmin(member, snapshot.workspaceAdminRoleIds)) {
      return { ok: true };
    }

    const folderPermission = evaluateWorkspaceFolderPermission(
      {
        workspaceId: input.workspaceId,
        accountId: input.actor.accountId,
        roleAssignments: toRoleAssignments(member),
        workspaceAdminRoleIds: snapshot.workspaceAdminRoleIds,
        aclRules: snapshot.aclRules
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

  async authorizeProjectRead(input: AuthorizeProjectReadInput): Promise<AuthorizeProjectReadResult> {
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
    if (!member) {
      return {
        ok: false,
        reason: 'forbidden_workspace_project_read',
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        accountId: input.actor.accountId,
        folderId: input.folderId,
        tool: input.tool
      };
    }

    if (isWorkspaceAdmin(member, snapshot.workspaceAdminRoleIds)) {
      return { ok: true };
    }

    const folderPermission = evaluateWorkspaceFolderPermission(
      {
        workspaceId: input.workspaceId,
        accountId: input.actor.accountId,
        roleAssignments: toRoleAssignments(member),
        workspaceAdminRoleIds: snapshot.workspaceAdminRoleIds,
        aclRules: snapshot.aclRules
      },
      input.folderPathFromRoot
    );
    if (!folderPermission.read) {
      return {
        ok: false,
        reason: 'forbidden_workspace_folder_read',
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
        members: [],
        aclRules: [],
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
      members,
      aclRules: toAclRules(folderAcl),
      workspaceAdminRoleIds: buildWorkspaceAdminRoleIds(roles)
    };
    this.cache.set(workspaceId, {
      snapshot,
      expiresAt: now + this.cacheTtlMs
    });
    return snapshot;
  }
}
