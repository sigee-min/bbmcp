import type { ToolName, ToolPayloadMap, ToolResultMap, ToolResponse } from '@ashfox/contracts/types/internal';

export type BackendKind = 'blockbench' | 'engine';

export type BackendAvailability = 'ready' | 'degraded' | 'offline';

export type SystemRole = 'system_admin' | 'cs_admin';

export type WorkspaceMode = 'all_open' | 'rbac';

export type WorkspaceBuiltinRole = 'workspace_admin' | 'user';

export type WorkspacePermission =
  | 'workspace.read'
  | 'workspace.settings.manage'
  | 'workspace.members.manage'
  | 'workspace.roles.manage'
  | 'folder.read'
  | 'folder.write'
  | 'project.read'
  | 'project.write';

export type WorkspaceAclEffect = 'allow' | 'deny' | 'inherit';

export interface WorkspaceRoleRecord {
  roleId: string;
  name: string;
  builtin: WorkspaceBuiltinRole | null;
  permissions: WorkspacePermission[];
}

export interface WorkspaceMemberRoleAssignment {
  accountId: string;
  roleIds: string[];
}

export interface WorkspaceFolderAclRule {
  workspaceId: string;
  folderId: string | null;
  roleId: string;
  read: WorkspaceAclEffect;
  write: WorkspaceAclEffect;
}

export interface WorkspacePermissionContext {
  workspaceId: string;
  mode: WorkspaceMode;
  accountId: string;
  systemRoles?: readonly SystemRole[];
  workspaceAdminRoleIds?: readonly string[];
  roleAssignments?: readonly WorkspaceMemberRoleAssignment[];
  roleCatalog?: readonly WorkspaceRoleRecord[];
  folderAclRules?: readonly WorkspaceFolderAclRule[];
}

export interface WorkspaceFolderPermissionResult {
  read: boolean;
  write: boolean;
}

const hasSystemOverride = (systemRoles: readonly SystemRole[] | undefined): boolean =>
  Array.isArray(systemRoles) && systemRoles.includes('system_admin');

const toRoleIdSetForAccount = (
  roleAssignments: readonly WorkspaceMemberRoleAssignment[] | undefined,
  accountId: string
): Set<string> => {
  const roleIds = new Set<string>();
  if (!Array.isArray(roleAssignments)) {
    return roleIds;
  }
  for (const assignment of roleAssignments) {
    if (!assignment || assignment.accountId !== accountId || !Array.isArray(assignment.roleIds)) {
      continue;
    }
    for (const roleId of assignment.roleIds) {
      if (typeof roleId === 'string' && roleId.trim().length > 0) {
        roleIds.add(roleId);
      }
    }
  }
  return roleIds;
};

const resolveAclValue = (
  rules: readonly WorkspaceFolderAclRule[],
  roleIds: ReadonlySet<string>,
  folderId: string | null,
  field: 'read' | 'write'
): WorkspaceAclEffect => {
  let hasAllow = false;
  for (const rule of rules) {
    if (!roleIds.has(rule.roleId) || rule.folderId !== folderId) {
      continue;
    }
    const value = rule[field];
    if (value === 'deny') {
      return 'deny';
    }
    if (value === 'allow') {
      hasAllow = true;
    }
  }
  return hasAllow ? 'allow' : 'inherit';
};

export const evaluateWorkspaceFolderPermission = (
  context: WorkspacePermissionContext,
  folderPathFromRoot: readonly (string | null)[] = [null]
): WorkspaceFolderPermissionResult => {
  if (context.mode === 'all_open') {
    return { read: true, write: true };
  }
  if (hasSystemOverride(context.systemRoles)) {
    return { read: true, write: true };
  }

  const memberRoleIds = toRoleIdSetForAccount(context.roleAssignments, context.accountId);
  for (const adminRoleId of context.workspaceAdminRoleIds ?? []) {
    if (memberRoleIds.has(adminRoleId)) {
      return { read: true, write: true };
    }
  }

  const rules = Array.isArray(context.folderAclRules) ? context.folderAclRules : [];
  const resolvedPath = folderPathFromRoot.length > 0 ? folderPathFromRoot : [null];

  let readValue: WorkspaceAclEffect = 'inherit';
  let writeValue: WorkspaceAclEffect = 'inherit';
  for (const folderId of resolvedPath) {
    const nextRead = resolveAclValue(rules, memberRoleIds, folderId, 'read');
    const nextWrite = resolveAclValue(rules, memberRoleIds, folderId, 'write');
    if (nextRead !== 'inherit') {
      readValue = nextRead;
    }
    if (nextWrite !== 'inherit') {
      writeValue = nextWrite;
    }
  }

  const read = readValue === 'allow';
  const write = writeValue === 'allow' && read;
  return { read, write };
};

export interface BackendSessionRef {
  tenantId: string;
  projectId: string;
  actorId: string;
  revision?: string;
}

export interface BackendHealth {
  kind: BackendKind;
  availability: BackendAvailability;
  version: string;
  details?: Record<string, unknown>;
}

export interface BackendToolContext {
  session: BackendSessionRef;
  traceId?: string;
}

export interface BackendPort {
  readonly kind: BackendKind;
  getHealth(): Promise<BackendHealth>;
  handleTool<TName extends ToolName>(
    name: TName,
    payload: ToolPayloadMap[TName],
    context: BackendToolContext
  ): Promise<ToolResponse<ToolResultMap[TName]>>;
}
