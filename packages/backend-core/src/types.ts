import type { ToolName, ToolPayloadMap, ToolResultMap, ToolResponse } from '@ashfox/contracts/types/internal';

export type BackendKind = 'blockbench' | 'engine';

export type BackendAvailability = 'ready' | 'degraded' | 'offline';

export type SystemRole = 'system_admin' | 'cs_admin';
export const SYSTEM_ROLES: readonly SystemRole[] = ['system_admin', 'cs_admin'];

export const normalizeSystemRoles = (roles: readonly string[] | undefined): SystemRole[] => {
  const deduped = new Set<SystemRole>();
  for (const role of roles ?? []) {
    if (role === 'system_admin' || role === 'cs_admin') {
      deduped.add(role);
    }
  }
  return [...deduped];
};

export const hasSystemRole = (roles: readonly string[] | undefined, target: SystemRole): boolean =>
  normalizeSystemRoles(roles).includes(target);

export const isSystemManager = (roles: readonly string[] | undefined): boolean =>
  hasSystemRole(roles, 'system_admin') || hasSystemRole(roles, 'cs_admin');

export type WorkspaceBuiltinRole = 'workspace_admin';

export const WORKSPACE_ADMIN_ROLE_NAME = '어드민';
export const WORKSPACE_MEMBER_ROLE_NAME = '유저';

const LEGACY_WORKSPACE_ADMIN_ROLE_TOKENS = new Set(['workspace admin', 'admin', WORKSPACE_ADMIN_ROLE_NAME]);
const LEGACY_WORKSPACE_MEMBER_ROLE_TOKENS = new Set(['user', WORKSPACE_MEMBER_ROLE_NAME]);
const normalizeWorkspaceRoleToken = (value: string): string => value.trim().toLowerCase();

export type WorkspacePermission =
  | 'workspace.manage'
  | 'folder.read'
  | 'folder.write';

export const normalizeWorkspaceRoleName = (input: { builtin: WorkspaceBuiltinRole | null; name: string }): string => {
  if (input.builtin === 'workspace_admin') {
    return WORKSPACE_ADMIN_ROLE_NAME;
  }
  const trimmedName = input.name.trim();
  const token = normalizeWorkspaceRoleToken(trimmedName);
  if (LEGACY_WORKSPACE_ADMIN_ROLE_TOKENS.has(token)) {
    return WORKSPACE_ADMIN_ROLE_NAME;
  }
  if (LEGACY_WORKSPACE_MEMBER_ROLE_TOKENS.has(token)) {
    return WORKSPACE_MEMBER_ROLE_NAME;
  }
  return trimmedName || 'Role';
};

export type WorkspaceAclEffect = 'allow' | 'deny' | 'inherit';
export type WorkspaceAclScope = 'workspace' | 'folder';

export interface WorkspaceMemberRoleAssignment {
  accountId: string;
  roleIds: string[];
}

export interface WorkspaceAclRule {
  workspaceId: string;
  ruleId: string;
  scope?: WorkspaceAclScope;
  folderId: string | null;
  roleIds: string[];
  read: WorkspaceAclEffect;
  write: WorkspaceAclEffect;
  locked?: boolean;
}

export interface WorkspacePermissionContext {
  workspaceId: string;
  accountId: string;
  systemRoles?: readonly SystemRole[];
  workspaceAdminRoleIds?: readonly string[];
  roleAssignments?: readonly WorkspaceMemberRoleAssignment[];
  aclRules?: readonly WorkspaceAclRule[];
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
  rules: readonly WorkspaceAclRule[],
  memberRoleIds: ReadonlySet<string>,
  folderId: string | null,
  field: 'read' | 'write'
): WorkspaceAclEffect => {
  let hasAllow = false;
  let hasDeny = false;
  const hasAnyRoleMatch = (ruleRoleIds: readonly string[] | undefined): boolean => {
    if (!Array.isArray(ruleRoleIds) || ruleRoleIds.length === 0) {
      return false;
    }
    for (const roleId of ruleRoleIds) {
      if (typeof roleId === 'string' && memberRoleIds.has(roleId)) {
        return true;
      }
    }
    return false;
  };
  for (const rule of rules) {
    if (!hasAnyRoleMatch(rule.roleIds) || (rule.scope ?? 'folder') !== 'folder' || rule.folderId !== folderId) {
      continue;
    }
    const value = rule[field];
    if (value === 'allow') {
      hasAllow = true;
      continue;
    }
    if (value === 'deny') {
      hasDeny = true;
    }
  }
  if (hasAllow) {
    return 'allow';
  }
  if (hasDeny) {
    return 'deny';
  }
  return 'inherit';
};

export const evaluateWorkspaceFolderPermission = (
  context: WorkspacePermissionContext,
  folderPathFromRoot: readonly (string | null)[] = [null]
): WorkspaceFolderPermissionResult => {
  if (hasSystemOverride(context.systemRoles)) {
    return { read: true, write: true };
  }

  const memberRoleIds = toRoleIdSetForAccount(context.roleAssignments, context.accountId);
  for (const adminRoleId of context.workspaceAdminRoleIds ?? []) {
    if (memberRoleIds.has(adminRoleId)) {
      return { read: true, write: true };
    }
  }

  const rules = Array.isArray(context.aclRules) ? context.aclRules : [];
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
