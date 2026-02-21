import type { AccountCandidateQuery, WorkspaceRecord, WorkspaceRoleStorageRecord } from '@ashfox/backend-core';
import type { ResponsePlan } from '@ashfox/runtime/transport/mcp/types';
import type { FastifyRequest } from 'fastify';
import type { UpsertWorkspaceMemberDto } from '../dto/upsert-workspace-member.dto';
import type { WorkspaceMemberCandidatesQueryDto } from '../dto/workspace-member-candidates-query.dto';
import { jsonPlan, workspaceNotFoundPlan, type GatewayActorContext } from '../gatewayDashboardHelpers';
import { evaluateWorkspaceMemberDeleteGuard, evaluateWorkspaceMemberUpsertGuard } from './workspace-admin-member-guards';

const DEFAULT_WORKSPACE_USER_ROLE_ID = 'role_user';

type WorkspaceMemberCandidateView = {
  accountId: string;
  displayName: string;
  email: string;
  localLoginId: string | null;
  githubLogin: string | null;
  systemRoles: Array<'system_admin' | 'cs_admin'>;
};

const toSystemRoles = (roles: readonly string[]): Array<'system_admin' | 'cs_admin'> =>
  roles.filter((role): role is 'system_admin' | 'cs_admin' => role === 'system_admin' || role === 'cs_admin');

const normalizeRoleIds = (roleIds: readonly string[]): string[] => {
  const deduped = new Set<string>();
  for (const roleId of roleIds) {
    const normalized = String(roleId ?? '').trim();
    if (!normalized) {
      continue;
    }
    deduped.add(normalized);
  }
  return Array.from(deduped.values());
};

interface WorkspaceRoleContext {
  roles: WorkspaceRoleStorageRecord[];
  roleMap: Map<string, WorkspaceRoleStorageRecord>;
}

interface WorkspaceMemberServiceDependencies {
  resolveActor: (request: FastifyRequest) => GatewayActorContext;
  authorizeWorkspaceMutation: (
    workspaceId: string,
    actor: GatewayActorContext,
    permission: 'workspace.manage'
  ) => Promise<
    | {
        workspace: WorkspaceRecord;
      }
    | ResponsePlan
  >;
  resolveWorkspaceRoleContext: (workspaceId: string) => Promise<WorkspaceRoleContext>;
  listWorkspaceMembers: (workspaceId: string) => Promise<
    Array<{
      workspaceId: string;
      accountId: string;
      roleIds: string[];
      joinedAt: string;
    }>
  >;
  upsertWorkspaceMember: (record: {
    workspaceId: string;
    accountId: string;
    roleIds: string[];
    joinedAt: string;
  }) => Promise<void>;
  removeWorkspaceMember: (workspaceId: string, accountId: string) => Promise<void>;
  listAccounts: (input?: AccountCandidateQuery) => Promise<
    Array<{
      accountId: string;
      displayName: string;
      email: string;
      localLoginId?: string | null;
      githubLogin?: string | null;
      systemRoles: string[];
    }>
  >;
  getWorkspace: (workspaceId: string) => Promise<WorkspaceRecord | null>;
  invalidateWorkspace: (workspaceId: string) => void;
  toWorkspacePayload: (workspace: WorkspaceRecord, actor: GatewayActorContext) => Promise<Record<string, unknown>>;
}

export const listWorkspaceMembers = async (
  dependencies: WorkspaceMemberServiceDependencies,
  request: FastifyRequest,
  workspaceId: string
): Promise<ResponsePlan> => {
  const actor = dependencies.resolveActor(request);
  const workspace = await dependencies.getWorkspace(workspaceId);
  if (!workspace) {
    return workspaceNotFoundPlan(workspaceId);
  }
  const [members, payload] = await Promise.all([
    dependencies.listWorkspaceMembers(workspaceId),
    dependencies.toWorkspacePayload(workspace, actor)
  ]);
  return jsonPlan(200, {
    ok: true,
    workspace: payload,
    members
  });
};

export const listWorkspaceMemberCandidates = async (
  dependencies: WorkspaceMemberServiceDependencies,
  request: FastifyRequest,
  workspaceId: string,
  query: WorkspaceMemberCandidatesQueryDto
): Promise<ResponsePlan> => {
  const actor = dependencies.resolveActor(request);
  const authorization = await dependencies.authorizeWorkspaceMutation(workspaceId, actor, 'workspace.manage');
  if ('kind' in authorization) {
    return authorization;
  }

  const members = await dependencies.listWorkspaceMembers(workspaceId);
  const memberAccountIds = members.map((member) => member.accountId);
  const candidateQuery: AccountCandidateQuery = {
    query: typeof query.query === 'string' ? query.query : undefined,
    ...(typeof query.limit === 'number' ? { limit: query.limit } : {}),
    excludeAccountIds: memberAccountIds
  };
  const candidateAccounts = await dependencies.listAccounts(candidateQuery);
  const candidates: WorkspaceMemberCandidateView[] = candidateAccounts.map((account) => ({
    accountId: account.accountId,
    displayName: account.displayName,
    email: account.email,
    localLoginId: account.localLoginId ?? null,
    githubLogin: account.githubLogin ?? null,
    systemRoles: toSystemRoles(account.systemRoles)
  }));

  return jsonPlan(200, {
    ok: true,
    workspace: await dependencies.toWorkspacePayload(authorization.workspace, actor),
    candidates
  });
};

export const upsertWorkspaceMember = async (
  dependencies: WorkspaceMemberServiceDependencies,
  request: FastifyRequest,
  workspaceId: string,
  body: UpsertWorkspaceMemberDto
): Promise<ResponsePlan> => {
  const actor = dependencies.resolveActor(request);
  const authorization = await dependencies.authorizeWorkspaceMutation(workspaceId, actor, 'workspace.manage');
  if ('kind' in authorization) {
    return authorization;
  }

  const normalizedAccountId = body.accountId.trim();
  if (!normalizedAccountId) {
    return jsonPlan(400, {
      ok: false,
      code: 'invalid_payload',
      message: 'accountId is required.'
    });
  }

  const { roles, roleMap } = await dependencies.resolveWorkspaceRoleContext(workspaceId);
  const validRoleIds = new Set(roleMap.keys());
  const roleIds = normalizeRoleIds(body.roleIds).filter((roleId) => validRoleIds.has(roleId));
  const defaultMemberRoleId = authorization.workspace.defaultMemberRoleId;
  const enforcedDefaultRoleId = validRoleIds.has(defaultMemberRoleId)
    ? defaultMemberRoleId
    : validRoleIds.has(DEFAULT_WORKSPACE_USER_ROLE_ID)
    ? DEFAULT_WORKSPACE_USER_ROLE_ID
    : null;

  if (enforcedDefaultRoleId) {
    roleIds.push(enforcedDefaultRoleId);
  }

  const normalizedRoleIds = normalizeRoleIds(roleIds);
  if (normalizedRoleIds.length === 0) {
    return jsonPlan(400, {
      ok: false,
      code: 'workspace_member_roles_invalid',
      message: '적어도 하나 이상의 유효한 역할이 필요합니다.'
    });
  }

  const members = await dependencies.listWorkspaceMembers(workspaceId);
  const upsertGuard = evaluateWorkspaceMemberUpsertGuard({
    members,
    roles,
    targetAccountId: normalizedAccountId,
    nextRoleIds: normalizedRoleIds
  });
  if (!upsertGuard.ok) {
    return jsonPlan(400, {
      ok: false,
      code: upsertGuard.code,
      message: upsertGuard.message
    });
  }
  const existingMember = members.find((member) => member.accountId === normalizedAccountId);
  const now = new Date().toISOString();
  await dependencies.upsertWorkspaceMember({
    workspaceId,
    accountId: normalizedAccountId,
    roleIds: normalizedRoleIds,
    joinedAt: existingMember?.joinedAt ?? now
  });
  dependencies.invalidateWorkspace(workspaceId);
  return jsonPlan(200, {
    ok: true,
    members: await dependencies.listWorkspaceMembers(workspaceId)
  });
};

export const deleteWorkspaceMember = async (
  dependencies: WorkspaceMemberServiceDependencies,
  request: FastifyRequest,
  workspaceId: string,
  accountId: string
): Promise<ResponsePlan> => {
  const actor = dependencies.resolveActor(request);
  const authorization = await dependencies.authorizeWorkspaceMutation(workspaceId, actor, 'workspace.manage');
  if ('kind' in authorization) {
    return authorization;
  }
  const { roles } = await dependencies.resolveWorkspaceRoleContext(workspaceId);
  const members = await dependencies.listWorkspaceMembers(workspaceId);
  const removeGuard = evaluateWorkspaceMemberDeleteGuard({
    members,
    roles,
    actorAccountId: actor.accountId,
    targetAccountId: accountId
  });
  if (!removeGuard.ok) {
    return jsonPlan(400, {
      ok: false,
      code: removeGuard.code,
      message: removeGuard.message
    });
  }

  await dependencies.removeWorkspaceMember(workspaceId, accountId.trim());
  dependencies.invalidateWorkspace(workspaceId);
  return jsonPlan(200, {
    ok: true,
    members: await dependencies.listWorkspaceMembers(workspaceId)
  });
};
