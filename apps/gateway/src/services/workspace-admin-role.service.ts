import type { WorkspaceRecord, WorkspaceRoleStorageRecord } from '@ashfox/backend-core';
import type { ResponsePlan } from '@ashfox/runtime/transport/mcp/types';
import type { FastifyRequest } from 'fastify';
import type { UpsertWorkspaceRoleDto } from '../dto/upsert-workspace-role.dto';
import type { SetWorkspaceDefaultMemberRoleDto } from '../dto/set-workspace-default-member-role.dto';
import { jsonPlan, workspaceNotFoundPlan, type GatewayActorContext } from '../gatewayDashboardHelpers';

interface WorkspaceRoleContext {
  workspace: WorkspaceRecord | null;
  roles: WorkspaceRoleStorageRecord[];
  roleMap: Map<string, WorkspaceRoleStorageRecord>;
}

interface WorkspaceRoleServiceDependencies {
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
  isAdminRole: (role: Pick<WorkspaceRoleStorageRecord, 'builtin'>) => boolean;
  listRolePayloads: (workspaceId: string) => Promise<WorkspaceRoleStorageRecord[]>;
  normalizeRoleName: (builtin: WorkspaceRoleStorageRecord['builtin'], name: string) => string;
  generateWorkspaceRoleId: (workspaceId: string, roleName: string, existingRoleIds: Set<string>, now: string) => string;
  getWorkspace: (workspaceId: string) => Promise<WorkspaceRecord | null>;
  upsertWorkspace: (workspace: WorkspaceRecord) => Promise<void>;
  upsertWorkspaceRole: (role: WorkspaceRoleStorageRecord) => Promise<void>;
  removeWorkspaceRole: (workspaceId: string, roleId: string) => Promise<void>;
  invalidateWorkspace: (workspaceId: string) => void;
  toWorkspacePayload: (workspace: WorkspaceRecord, actor: GatewayActorContext) => Promise<Record<string, unknown>>;
}

const toRoleNameKey = (name: string): string => name.trim().toLowerCase();

export const listWorkspaceRoles = async (
  dependencies: WorkspaceRoleServiceDependencies,
  request: FastifyRequest,
  workspaceId: string
): Promise<ResponsePlan> => {
  const actor = dependencies.resolveActor(request);
  const workspace = await dependencies.getWorkspace(workspaceId);
  if (!workspace) {
    return workspaceNotFoundPlan(workspaceId);
  }
  const [roles, payload] = await Promise.all([
    dependencies.listRolePayloads(workspaceId),
    dependencies.toWorkspacePayload(workspace, actor)
  ]);
  return jsonPlan(200, {
    ok: true,
    workspace: payload,
    roles
  });
};

export const upsertWorkspaceRole = async (
  dependencies: WorkspaceRoleServiceDependencies,
  request: FastifyRequest,
  workspaceId: string,
  body: UpsertWorkspaceRoleDto
): Promise<ResponsePlan> => {
  const actor = dependencies.resolveActor(request);
  const authorization = await dependencies.authorizeWorkspaceMutation(workspaceId, actor, 'workspace.manage');
  if ('kind' in authorization) {
    return authorization;
  }

  const requestedRoleId = typeof body.roleId === 'string' ? body.roleId.trim() : '';

  const { roles, roleMap } = await dependencies.resolveWorkspaceRoleContext(workspaceId);
  const existingRole = requestedRoleId ? roleMap.get(requestedRoleId) ?? null : null;
  if (requestedRoleId && !existingRole) {
    return jsonPlan(404, {
      ok: false,
      code: 'workspace_role_not_found',
      message: '수정할 역할을 찾을 수 없습니다.'
    });
  }
  if (existingRole && dependencies.isAdminRole(existingRole)) {
    return jsonPlan(400, {
      ok: false,
      code: 'workspace_role_admin_immutable',
      message: '어드민 역할은 수정할 수 없습니다.'
    });
  }

  const normalizedRoleName = dependencies.normalizeRoleName(existingRole?.builtin ?? null, body.name);
  const normalizedRoleNameKey = toRoleNameKey(normalizedRoleName);
  const conflictingRole = roles.find((role) => {
    if (role.roleId === existingRole?.roleId) {
      return false;
    }
    return toRoleNameKey(dependencies.normalizeRoleName(role.builtin, role.name)) === normalizedRoleNameKey;
  });
  if (conflictingRole) {
    return jsonPlan(409, {
      ok: false,
      code: 'workspace_role_name_conflict',
      message: '같은 이름의 역할이 이미 존재합니다.'
    });
  }

  const now = new Date().toISOString();
  const roleId =
    existingRole?.roleId ??
    dependencies.generateWorkspaceRoleId(
      workspaceId,
      normalizedRoleName,
      new Set(roleMap.keys()),
      now
    );
  await dependencies.upsertWorkspaceRole({
    workspaceId,
    roleId,
    name: normalizedRoleName,
    builtin: existingRole?.builtin ?? null,
    createdAt: existingRole?.createdAt ?? now,
    updatedAt: now
  });
  dependencies.invalidateWorkspace(workspaceId);
  return jsonPlan(200, {
    ok: true,
    roles: await dependencies.listRolePayloads(workspaceId)
  });
};

export const deleteWorkspaceRole = async (
  dependencies: WorkspaceRoleServiceDependencies,
  request: FastifyRequest,
  workspaceId: string,
  roleId: string
): Promise<ResponsePlan> => {
  const actor = dependencies.resolveActor(request);
  const authorization = await dependencies.authorizeWorkspaceMutation(workspaceId, actor, 'workspace.manage');
  if ('kind' in authorization) {
    return authorization;
  }

  const normalizedRoleId = roleId.trim();
  if (!normalizedRoleId) {
    return jsonPlan(400, {
      ok: false,
      code: 'invalid_payload',
      message: 'roleId is required.'
    });
  }

  const { roleMap } = await dependencies.resolveWorkspaceRoleContext(workspaceId);
  const targetRole = roleMap.get(normalizedRoleId);
  if (!targetRole) {
    return jsonPlan(404, {
      ok: false,
      code: 'workspace_role_not_found',
      message: '삭제할 역할을 찾을 수 없습니다.'
    });
  }
  if (dependencies.isAdminRole(targetRole)) {
    return jsonPlan(400, {
      ok: false,
      code: 'workspace_role_admin_immutable',
      message: '어드민 역할은 삭제할 수 없습니다.'
    });
  }
  if (normalizedRoleId === authorization.workspace.defaultMemberRoleId) {
    return jsonPlan(400, {
      ok: false,
      code: 'workspace_role_default_member_guard',
      message: '가입자 기본 권한 역할은 다른 역할로 변경하기 전까지 삭제할 수 없습니다.'
    });
  }

  await dependencies.removeWorkspaceRole(workspaceId, normalizedRoleId);
  dependencies.invalidateWorkspace(workspaceId);
  return jsonPlan(200, {
    ok: true,
    roles: await dependencies.listRolePayloads(workspaceId)
  });
};

export const setWorkspaceDefaultMemberRole = async (
  dependencies: WorkspaceRoleServiceDependencies,
  request: FastifyRequest,
  workspaceId: string,
  body: SetWorkspaceDefaultMemberRoleDto
): Promise<ResponsePlan> => {
  const actor = dependencies.resolveActor(request);
  const authorization = await dependencies.authorizeWorkspaceMutation(workspaceId, actor, 'workspace.manage');
  if ('kind' in authorization) {
    return authorization;
  }

  const roleId = body.roleId.trim();
  if (!roleId) {
    return jsonPlan(400, {
      ok: false,
      code: 'invalid_payload',
      message: 'roleId is required.'
    });
  }

  const { roles } = await dependencies.resolveWorkspaceRoleContext(workspaceId);
  const targetRole = roles.find((role) => role.roleId === roleId);
  if (!targetRole) {
    return jsonPlan(404, {
      ok: false,
      code: 'workspace_role_not_found',
      message: '기본 권한으로 지정할 역할을 찾을 수 없습니다.'
    });
  }
  if (dependencies.isAdminRole(targetRole)) {
    return jsonPlan(400, {
      ok: false,
      code: 'workspace_default_member_admin_forbidden',
      message: '어드민 역할은 가입자 기본 권한으로 지정할 수 없습니다.'
    });
  }

  if (authorization.workspace.defaultMemberRoleId !== roleId) {
    const now = new Date().toISOString();
    await dependencies.upsertWorkspace({
      ...authorization.workspace,
      defaultMemberRoleId: roleId,
      updatedAt: now
    });
    dependencies.invalidateWorkspace(workspaceId);
  }

  const nextWorkspace = await dependencies.getWorkspace(workspaceId);
  if (!nextWorkspace) {
    return workspaceNotFoundPlan(workspaceId);
  }

  return jsonPlan(200, {
    ok: true,
    workspace: await dependencies.toWorkspacePayload(nextWorkspace, actor),
    roles: await dependencies.listRolePayloads(workspaceId)
  });
};
