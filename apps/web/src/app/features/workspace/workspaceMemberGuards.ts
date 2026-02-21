import type { WorkspaceMemberRecord } from '../../../lib/dashboardModel';
import type { WorkspaceRoleOption } from './workspaceOptionMappers';

export const BOOTSTRAP_ADMIN_ACCOUNT_ID = 'admin';

export const toWorkspaceAdminRoleIds = (roles: readonly WorkspaceRoleOption[]): Set<string> =>
  new Set(roles.filter((role) => role.builtin === 'workspace_admin').map((role) => role.roleId));

export const hasWorkspaceAdminRole = (roleIds: readonly string[], workspaceAdminRoleIds: ReadonlySet<string>): boolean =>
  roleIds.some((roleId) => workspaceAdminRoleIds.has(roleId));

export const countWorkspaceAdminsExcluding = (
  members: readonly WorkspaceMemberRecord[],
  workspaceAdminRoleIds: ReadonlySet<string>,
  excludedAccountId: string
): number =>
  members.reduce((count, member) => {
    if (member.accountId === excludedAccountId) {
      return count;
    }
    return count + (hasWorkspaceAdminRole(member.roleIds, workspaceAdminRoleIds) ? 1 : 0);
  }, 0);

export const isLastWorkspaceAdminMember = (
  member: WorkspaceMemberRecord,
  members: readonly WorkspaceMemberRecord[],
  workspaceAdminRoleIds: ReadonlySet<string>
): boolean =>
  hasWorkspaceAdminRole(member.roleIds, workspaceAdminRoleIds) &&
  countWorkspaceAdminsExcluding(members, workspaceAdminRoleIds, member.accountId) <= 0;

export const isBootstrapAdminMember = (accountId: string): boolean => accountId === BOOTSTRAP_ADMIN_ACCOUNT_ID;
