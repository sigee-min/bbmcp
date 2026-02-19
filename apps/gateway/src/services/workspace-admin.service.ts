import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { isAutoProvisionedWorkspaceId, type WorkspacePermission, type WorkspaceRecord } from '@ashfox/backend-core';
import type { ResponsePlan } from '@ashfox/runtime/transport/mcp/types';
import type { FastifyRequest } from 'fastify';
import type { CreateWorkspaceDto } from '../dto/create-workspace.dto';
import type { UpdateWorkspaceModeDto } from '../dto/update-workspace-mode.dto';
import type { UpsertWorkspaceFolderAclDto } from '../dto/upsert-workspace-folder-acl.dto';
import type { UpsertWorkspaceMemberDto } from '../dto/upsert-workspace-member.dto';
import type { UpsertWorkspaceRoleDto } from '../dto/upsert-workspace-role.dto';
import {
  DEFAULT_TENANT_ID,
  forbiddenPlan,
  jsonPlan,
  normalizeOptionalFolderId,
  normalizeOptionalWorkspaceId,
  resolveActorContext,
  workspaceNotFoundPlan,
  type GatewayActorContext
} from '../gatewayDashboardHelpers';
import { GatewayRuntimeService } from './gateway-runtime.service';
import { WorkspacePolicyService } from '../security/workspace-policy.service';

const DEFAULT_WORKSPACE_ADMIN_ROLE_ID = 'role_workspace_admin';
const DEFAULT_WORKSPACE_USER_ROLE_ID = 'role_user';

const MANAGE_ALL_PERMISSIONS: WorkspacePermission[] = [
  'workspace.settings.manage',
  'workspace.members.manage',
  'workspace.roles.manage'
];

const VALID_WORKSPACE_PERMISSIONS = new Set<WorkspacePermission>([
  'workspace.read',
  'workspace.settings.manage',
  'workspace.members.manage',
  'workspace.roles.manage',
  'folder.read',
  'folder.write',
  'project.read',
  'project.write'
]);

@Injectable()
export class WorkspaceAdminService {
  constructor(
    private readonly runtime: GatewayRuntimeService,
    private readonly workspacePolicy: WorkspacePolicyService
  ) {}

  private resolveActor(request: FastifyRequest): GatewayActorContext {
    return resolveActorContext(request.headers as Record<string, unknown>);
  }

  private async authorizeWorkspaceMutation(
    workspaceId: string,
    actor: GatewayActorContext,
    permission: WorkspacePermission,
    options: { rejectWhenAllOpen?: boolean } = {}
  ): Promise<
    | {
        workspace: WorkspaceRecord;
        permissions: Set<WorkspacePermission>;
      }
    | ResponsePlan
  > {
    const workspace = await this.workspacePolicy.getWorkspace(workspaceId);
    if (!workspace) {
      return workspaceNotFoundPlan(workspaceId);
    }
    if (options.rejectWhenAllOpen !== false && workspace.mode === 'all_open' && MANAGE_ALL_PERMISSIONS.includes(permission)) {
      return forbiddenPlan(
        'Workspace management mutations are disabled while mode is all_open.',
        'workspace_mode_all_open'
      );
    }
    if (this.workspacePolicy.isSystemManager(actor)) {
      return {
        workspace,
        permissions: new Set<WorkspacePermission>(MANAGE_ALL_PERMISSIONS)
      };
    }
    const permissions = await this.workspacePolicy.resolveWorkspaceRolePermissions(workspaceId, actor.accountId);
    if (!permissions.has(permission)) {
      return forbiddenPlan('Workspace permission denied.', 'forbidden_workspace');
    }
    return {
      workspace,
      permissions
    };
  }

  private async toWorkspacePayload(
    workspace: WorkspaceRecord,
    actor: GatewayActorContext
  ): Promise<Record<string, unknown>> {
    const capabilities = await this.workspacePolicy.resolveWorkspaceCapabilities(workspace, actor);
    return {
      workspaceId: workspace.workspaceId,
      tenantId: workspace.tenantId,
      name: workspace.name,
      mode: workspace.mode,
      createdBy: workspace.createdBy,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      capabilities
    };
  }

  async listWorkspaces(request: FastifyRequest): Promise<ResponsePlan> {
    const actor = this.resolveActor(request);
    const visibleAccountId = this.workspacePolicy.isSystemManager(actor) ? '' : actor.accountId;
    const workspaces = await this.runtime.persistence.workspaceRepository.listWorkspaces(visibleAccountId);
    const payload = await Promise.all(workspaces.map((workspace) => this.toWorkspacePayload(workspace, actor)));
    return jsonPlan(200, {
      ok: true,
      actor: {
        accountId: actor.accountId,
        systemRoles: actor.systemRoles
      },
      workspaces: payload
    });
  }

  async createWorkspace(request: FastifyRequest, body: CreateWorkspaceDto): Promise<ResponsePlan> {
    const actor = this.resolveActor(request);
    if (!this.workspacePolicy.isSystemManager(actor)) {
      return forbiddenPlan('Only system or CS admin can create a workspace.', 'forbidden_workspace_create');
    }

    const workspaceId = normalizeOptionalWorkspaceId(body.workspaceId) ?? `ws_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    if (isAutoProvisionedWorkspaceId(workspaceId)) {
      return forbiddenPlan('Reserved workspace id prefix cannot be used for manual workspace creation.', 'reserved_workspace_id');
    }
    const tenantId = normalizeOptionalWorkspaceId(body.tenantId) ?? DEFAULT_TENANT_ID;
    const now = new Date().toISOString();
    const workspace: WorkspaceRecord = {
      workspaceId,
      tenantId,
      name: body.name.trim() || 'Workspace',
      mode: body.mode ?? 'all_open',
      createdBy: actor.accountId,
      createdAt: now,
      updatedAt: now
    };

    await this.runtime.persistence.workspaceRepository.upsertWorkspace(workspace);
    await this.runtime.persistence.workspaceRepository.upsertWorkspaceRole({
      workspaceId,
      roleId: DEFAULT_WORKSPACE_ADMIN_ROLE_ID,
      name: 'Workspace Admin',
      builtin: 'workspace_admin',
      permissions: [
        'workspace.read',
        'workspace.settings.manage',
        'workspace.members.manage',
        'workspace.roles.manage',
        'folder.read',
        'folder.write',
        'project.read',
        'project.write'
      ],
      createdAt: now,
      updatedAt: now
    });
    await this.runtime.persistence.workspaceRepository.upsertWorkspaceRole({
      workspaceId,
      roleId: DEFAULT_WORKSPACE_USER_ROLE_ID,
      name: 'User',
      builtin: 'user',
      permissions: ['workspace.read', 'folder.read', 'folder.write', 'project.read', 'project.write'],
      createdAt: now,
      updatedAt: now
    });
    await this.runtime.persistence.workspaceRepository.upsertWorkspaceMember({
      workspaceId,
      accountId: actor.accountId,
      roleIds: [DEFAULT_WORKSPACE_ADMIN_ROLE_ID],
      joinedAt: now
    });
    this.workspacePolicy.invalidateWorkspace(workspaceId);

    return jsonPlan(201, {
      ok: true,
      workspace: await this.toWorkspacePayload(workspace, actor)
    });
  }

  async deleteWorkspace(request: FastifyRequest, workspaceId: string): Promise<ResponsePlan> {
    const actor = this.resolveActor(request);
    const authorization = await this.authorizeWorkspaceMutation(workspaceId, actor, 'workspace.settings.manage', {
      rejectWhenAllOpen: false
    });
    if ('kind' in authorization) {
      return authorization;
    }
    if (isAutoProvisionedWorkspaceId(workspaceId) && !this.workspacePolicy.isSystemManager(actor)) {
      return forbiddenPlan(
        '자동 프로비저닝 워크스페이스는 사용자 권한으로 삭제할 수 없습니다.',
        'forbidden_auto_workspace_delete'
      );
    }
    await this.runtime.persistence.workspaceRepository.removeWorkspace(workspaceId);
    this.workspacePolicy.invalidateWorkspace(workspaceId);
    return jsonPlan(200, {
      ok: true,
      workspaceId
    });
  }

  async getWorkspaceSettings(request: FastifyRequest, workspaceId: string): Promise<ResponsePlan> {
    const actor = this.resolveActor(request);
    const workspace = await this.runtime.persistence.workspaceRepository.getWorkspace(workspaceId);
    if (!workspace) {
      return workspaceNotFoundPlan(workspaceId);
    }
    const [roles, members, folderAcl, payload] = await Promise.all([
      this.runtime.persistence.workspaceRepository.listWorkspaceRoles(workspaceId),
      this.runtime.persistence.workspaceRepository.listWorkspaceMembers(workspaceId),
      this.runtime.persistence.workspaceRepository.listWorkspaceFolderAcl(workspaceId),
      this.toWorkspacePayload(workspace, actor)
    ]);
    return jsonPlan(200, {
      ok: true,
      workspace: payload,
      roles,
      members,
      folderAcl
    });
  }

  async updateWorkspaceMode(
    request: FastifyRequest,
    workspaceId: string,
    body: UpdateWorkspaceModeDto
  ): Promise<ResponsePlan> {
    const actor = this.resolveActor(request);
    const authorization = await this.authorizeWorkspaceMutation(workspaceId, actor, 'workspace.settings.manage', {
      rejectWhenAllOpen: false
    });
    if ('kind' in authorization) {
      return authorization;
    }
    const now = new Date().toISOString();
    await this.runtime.persistence.workspaceRepository.upsertWorkspace({
      ...authorization.workspace,
      mode: body.mode,
      updatedAt: now
    });
    this.workspacePolicy.invalidateWorkspace(workspaceId);
    const nextWorkspace = await this.runtime.persistence.workspaceRepository.getWorkspace(workspaceId);
    return jsonPlan(200, {
      ok: true,
      workspace: nextWorkspace ? await this.toWorkspacePayload(nextWorkspace, actor) : null
    });
  }

  async listWorkspaceRoles(request: FastifyRequest, workspaceId: string): Promise<ResponsePlan> {
    const actor = this.resolveActor(request);
    const workspace = await this.runtime.persistence.workspaceRepository.getWorkspace(workspaceId);
    if (!workspace) {
      return workspaceNotFoundPlan(workspaceId);
    }
    const [roles, payload] = await Promise.all([
      this.runtime.persistence.workspaceRepository.listWorkspaceRoles(workspaceId),
      this.toWorkspacePayload(workspace, actor)
    ]);
    return jsonPlan(200, {
      ok: true,
      workspace: payload,
      roles
    });
  }

  async upsertWorkspaceRole(
    request: FastifyRequest,
    workspaceId: string,
    body: UpsertWorkspaceRoleDto
  ): Promise<ResponsePlan> {
    const actor = this.resolveActor(request);
    const authorization = await this.authorizeWorkspaceMutation(workspaceId, actor, 'workspace.roles.manage');
    if ('kind' in authorization) {
      return authorization;
    }
    const now = new Date().toISOString();
    const permissions = body.permissions.filter((permission): permission is WorkspacePermission =>
      VALID_WORKSPACE_PERMISSIONS.has(permission as WorkspacePermission)
    );
    await this.runtime.persistence.workspaceRepository.upsertWorkspaceRole({
      workspaceId,
      roleId: body.roleId.trim(),
      name: body.name.trim(),
      builtin: body.builtin ?? null,
      permissions,
      createdAt: now,
      updatedAt: now
    });
    this.workspacePolicy.invalidateWorkspace(workspaceId);
    return jsonPlan(200, {
      ok: true,
      roles: await this.runtime.persistence.workspaceRepository.listWorkspaceRoles(workspaceId)
    });
  }

  async deleteWorkspaceRole(request: FastifyRequest, workspaceId: string, roleId: string): Promise<ResponsePlan> {
    const actor = this.resolveActor(request);
    const authorization = await this.authorizeWorkspaceMutation(workspaceId, actor, 'workspace.roles.manage');
    if ('kind' in authorization) {
      return authorization;
    }
    await this.runtime.persistence.workspaceRepository.removeWorkspaceRole(workspaceId, roleId);
    this.workspacePolicy.invalidateWorkspace(workspaceId);
    return jsonPlan(200, {
      ok: true,
      roles: await this.runtime.persistence.workspaceRepository.listWorkspaceRoles(workspaceId)
    });
  }

  async listWorkspaceMembers(request: FastifyRequest, workspaceId: string): Promise<ResponsePlan> {
    const actor = this.resolveActor(request);
    const workspace = await this.runtime.persistence.workspaceRepository.getWorkspace(workspaceId);
    if (!workspace) {
      return workspaceNotFoundPlan(workspaceId);
    }
    const [members, payload] = await Promise.all([
      this.runtime.persistence.workspaceRepository.listWorkspaceMembers(workspaceId),
      this.toWorkspacePayload(workspace, actor)
    ]);
    return jsonPlan(200, {
      ok: true,
      workspace: payload,
      members
    });
  }

  async upsertWorkspaceMember(
    request: FastifyRequest,
    workspaceId: string,
    body: UpsertWorkspaceMemberDto
  ): Promise<ResponsePlan> {
    const actor = this.resolveActor(request);
    const authorization = await this.authorizeWorkspaceMutation(workspaceId, actor, 'workspace.members.manage');
    if ('kind' in authorization) {
      return authorization;
    }
    await this.runtime.persistence.workspaceRepository.upsertWorkspaceMember({
      workspaceId,
      accountId: body.accountId.trim(),
      roleIds: body.roleIds,
      joinedAt: new Date().toISOString()
    });
    this.workspacePolicy.invalidateWorkspace(workspaceId);
    return jsonPlan(200, {
      ok: true,
      members: await this.runtime.persistence.workspaceRepository.listWorkspaceMembers(workspaceId)
    });
  }

  async deleteWorkspaceMember(request: FastifyRequest, workspaceId: string, accountId: string): Promise<ResponsePlan> {
    const actor = this.resolveActor(request);
    const authorization = await this.authorizeWorkspaceMutation(workspaceId, actor, 'workspace.members.manage');
    if ('kind' in authorization) {
      return authorization;
    }
    await this.runtime.persistence.workspaceRepository.removeWorkspaceMember(workspaceId, accountId);
    this.workspacePolicy.invalidateWorkspace(workspaceId);
    return jsonPlan(200, {
      ok: true,
      members: await this.runtime.persistence.workspaceRepository.listWorkspaceMembers(workspaceId)
    });
  }

  async listWorkspaceFolderAcl(request: FastifyRequest, workspaceId: string): Promise<ResponsePlan> {
    const actor = this.resolveActor(request);
    const workspace = await this.runtime.persistence.workspaceRepository.getWorkspace(workspaceId);
    if (!workspace) {
      return workspaceNotFoundPlan(workspaceId);
    }
    const [folderAcl, payload] = await Promise.all([
      this.runtime.persistence.workspaceRepository.listWorkspaceFolderAcl(workspaceId),
      this.toWorkspacePayload(workspace, actor)
    ]);
    return jsonPlan(200, {
      ok: true,
      workspace: payload,
      folderAcl
    });
  }

  async upsertWorkspaceFolderAcl(
    request: FastifyRequest,
    workspaceId: string,
    body: UpsertWorkspaceFolderAclDto
  ): Promise<ResponsePlan> {
    const actor = this.resolveActor(request);
    const authorization = await this.authorizeWorkspaceMutation(workspaceId, actor, 'workspace.roles.manage');
    if ('kind' in authorization) {
      return authorization;
    }
    await this.runtime.persistence.workspaceRepository.upsertWorkspaceFolderAcl({
      workspaceId,
      folderId: normalizeOptionalFolderId(body.folderId) ?? null,
      roleId: body.roleId.trim(),
      read: body.read,
      write: body.write,
      updatedAt: new Date().toISOString()
    });
    this.workspacePolicy.invalidateWorkspace(workspaceId);
    return jsonPlan(200, {
      ok: true,
      folderAcl: await this.runtime.persistence.workspaceRepository.listWorkspaceFolderAcl(workspaceId)
    });
  }

  async deleteWorkspaceFolderAcl(
    request: FastifyRequest,
    workspaceId: string,
    roleId: string,
    folderId?: string
  ): Promise<ResponsePlan> {
    const actor = this.resolveActor(request);
    const authorization = await this.authorizeWorkspaceMutation(workspaceId, actor, 'workspace.roles.manage');
    if ('kind' in authorization) {
      return authorization;
    }
    await this.runtime.persistence.workspaceRepository.removeWorkspaceFolderAcl(
      workspaceId,
      normalizeOptionalFolderId(folderId) ?? null,
      roleId
    );
    this.workspacePolicy.invalidateWorkspace(workspaceId);
    return jsonPlan(200, {
      ok: true,
      folderAcl: await this.runtime.persistence.workspaceRepository.listWorkspaceFolderAcl(workspaceId)
    });
  }
}
