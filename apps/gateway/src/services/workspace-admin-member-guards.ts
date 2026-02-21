import type { WorkspaceMemberRecord, WorkspaceRoleStorageRecord } from '@ashfox/backend-core';

const DEFAULT_BOOTSTRAP_ADMIN_ACCOUNT_ID = 'admin';

export type WorkspaceMemberGuardCode =
  | 'workspace_member_self_remove_forbidden'
  | 'workspace_member_minimum_guard'
  | 'workspace_member_bootstrap_admin_immutable'
  | 'workspace_member_last_admin_guard';

export type WorkspaceMemberGuardResult =
  | { ok: true }
  | {
      ok: false;
      code: WorkspaceMemberGuardCode;
      message: string;
    };

type MemberRoleProjection = Pick<WorkspaceMemberRecord, 'accountId' | 'roleIds'>;
type RoleProjection = Pick<WorkspaceRoleStorageRecord, 'roleId' | 'builtin'>;

interface GuardContext {
  members: readonly MemberRoleProjection[];
  roles: readonly RoleProjection[];
  bootstrapAdminAccountId?: string;
}

interface UpsertGuardContext extends GuardContext {
  targetAccountId: string;
  nextRoleIds: readonly string[];
}

interface DeleteGuardContext extends GuardContext {
  actorAccountId: string;
  targetAccountId: string;
}

const normalizeId = (value: unknown): string => String(value ?? '').trim();

const normalizeRoleIds = (roleIds: readonly string[]): string[] => {
  const deduped = new Set<string>();
  for (const roleId of roleIds) {
    const normalizedRoleId = normalizeId(roleId);
    if (normalizedRoleId) {
      deduped.add(normalizedRoleId);
    }
  }
  return [...deduped];
};

const toWorkspaceAdminRoleIdSet = (roles: readonly RoleProjection[]): Set<string> =>
  new Set(
    roles
      .filter((role) => role.builtin === 'workspace_admin')
      .map((role) => normalizeId(role.roleId))
      .filter(Boolean)
  );

const hasWorkspaceAdminRole = (roleIds: readonly string[], workspaceAdminRoleIds: ReadonlySet<string>): boolean =>
  roleIds.some((roleId) => workspaceAdminRoleIds.has(roleId));

const areRoleSetsEqual = (left: readonly string[], right: readonly string[]): boolean => {
  const leftSet = new Set(normalizeRoleIds(left));
  const rightSet = new Set(normalizeRoleIds(right));
  if (leftSet.size !== rightSet.size) {
    return false;
  }
  for (const roleId of leftSet) {
    if (!rightSet.has(roleId)) {
      return false;
    }
  }
  return true;
};

const resolveBootstrapAdminAccountId = (value: string | undefined): string =>
  normalizeId(value) || DEFAULT_BOOTSTRAP_ADMIN_ACCOUNT_ID;

export const evaluateWorkspaceMemberUpsertGuard = ({
  members,
  roles,
  targetAccountId,
  nextRoleIds,
  bootstrapAdminAccountId
}: UpsertGuardContext): WorkspaceMemberGuardResult => {
  const normalizedTargetAccountId = normalizeId(targetAccountId);
  const normalizedNextRoleIds = normalizeRoleIds(nextRoleIds);
  const existingMember = members.find((member) => normalizeId(member.accountId) === normalizedTargetAccountId) ?? null;
  const normalizedBootstrapAdminAccountId = resolveBootstrapAdminAccountId(bootstrapAdminAccountId);

  if (
    normalizedTargetAccountId === normalizedBootstrapAdminAccountId &&
    existingMember &&
    !areRoleSetsEqual(existingMember.roleIds, normalizedNextRoleIds)
  ) {
    return {
      ok: false,
      code: 'workspace_member_bootstrap_admin_immutable',
      message: '초기 admin 계정의 역할은 수정할 수 없습니다.'
    };
  }

  const workspaceAdminRoleIds = toWorkspaceAdminRoleIdSet(roles);
  if (workspaceAdminRoleIds.size === 0) {
    return { ok: true };
  }

  const nextAdminCount = members.reduce((count, member) => {
    const normalizedAccountId = normalizeId(member.accountId);
    const roleIds = normalizedAccountId === normalizedTargetAccountId ? normalizedNextRoleIds : normalizeRoleIds(member.roleIds);
    return count + (hasWorkspaceAdminRole(roleIds, workspaceAdminRoleIds) ? 1 : 0);
  }, existingMember ? 0 : hasWorkspaceAdminRole(normalizedNextRoleIds, workspaceAdminRoleIds) ? 1 : 0);

  if (nextAdminCount <= 0) {
    return {
      ok: false,
      code: 'workspace_member_last_admin_guard',
      message: '워크스페이스에는 최소 1명 이상의 어드민이 필요합니다.'
    };
  }

  return { ok: true };
};

export const evaluateWorkspaceMemberDeleteGuard = ({
  members,
  roles,
  actorAccountId,
  targetAccountId
}: DeleteGuardContext): WorkspaceMemberGuardResult => {
  const normalizedActorAccountId = normalizeId(actorAccountId);
  const normalizedTargetAccountId = normalizeId(targetAccountId);
  const targetMember = members.find((member) => normalizeId(member.accountId) === normalizedTargetAccountId) ?? null;

  if (normalizedTargetAccountId && normalizedTargetAccountId === normalizedActorAccountId) {
    return {
      ok: false,
      code: 'workspace_member_self_remove_forbidden',
      message: '본인 계정은 워크스페이스 멤버에서 제거할 수 없습니다.'
    };
  }

  if (targetMember && members.length - 1 <= 1) {
    return {
      ok: false,
      code: 'workspace_member_minimum_guard',
      message: '멤버 제거 후 남은 인원이 1명 이하가 되면 삭제할 수 없습니다.'
    };
  }

  if (!targetMember) {
    return { ok: true };
  }

  const workspaceAdminRoleIds = toWorkspaceAdminRoleIdSet(roles);
  if (workspaceAdminRoleIds.size === 0) {
    return { ok: true };
  }
  if (!hasWorkspaceAdminRole(normalizeRoleIds(targetMember.roleIds), workspaceAdminRoleIds)) {
    return { ok: true };
  }

  const remainingAdminCount = members.reduce((count, member) => {
    const normalizedAccountId = normalizeId(member.accountId);
    if (normalizedAccountId === normalizedTargetAccountId) {
      return count;
    }
    const roleIds = normalizeRoleIds(member.roleIds);
    return count + (hasWorkspaceAdminRole(roleIds, workspaceAdminRoleIds) ? 1 : 0);
  }, 0);

  if (remainingAdminCount <= 0) {
    return {
      ok: false,
      code: 'workspace_member_last_admin_guard',
      message: '워크스페이스에는 최소 1명 이상의 어드민이 필요합니다.'
    };
  }

  return { ok: true };
};
