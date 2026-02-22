import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  isAutoProvisionedWorkspaceId,
  normalizeSystemRoles,
  normalizeWorkspaceRoleName,
  WORKSPACE_ADMIN_ROLE_NAME,
  WORKSPACE_MEMBER_ROLE_NAME,
  type WorkspaceApiKeyRecord,
  type WorkspaceFolderAclRecord,
  type WorkspaceRecord,
  type WorkspaceRoleStorageRecord
} from '@ashfox/backend-core';
import type { NativeProjectTreeNode } from '@ashfox/native-pipeline/types';
import type { ResponsePlan } from '@ashfox/runtime/transport/mcp/types';
import type { FastifyRequest } from 'fastify';
import type { CreateWorkspaceDto } from '../dto/create-workspace.dto';
import type { CreateWorkspaceApiKeyDto } from '../dto/create-workspace-api-key.dto';
import type { DeleteWorkspaceAclRuleDto } from '../dto/delete-workspace-acl-rule.dto';
import type { UpsertWorkspaceAclRuleDto } from '../dto/upsert-workspace-acl-rule.dto';
import type { WorkspaceMemberCandidatesQueryDto } from '../dto/workspace-member-candidates-query.dto';
import type { UpsertWorkspaceMemberDto } from '../dto/upsert-workspace-member.dto';
import type { UpsertWorkspaceRoleDto } from '../dto/upsert-workspace-role.dto';
import type { RevokeWorkspaceApiKeyDto } from '../dto/revoke-workspace-api-key.dto';
import type { SetWorkspaceDefaultMemberRoleDto } from '../dto/set-workspace-default-member-role.dto';
import {
  DEFAULT_TENANT_ID,
  forbiddenPlan,
  jsonPlan,
  resolveActorContext,
  workspaceNotFoundPlan,
  type GatewayActorContext
} from '../gatewayDashboardHelpers';
import { GatewayRuntimeService } from './gateway-runtime.service';
import { WorkspacePolicyService } from '../security/workspace-policy.service';
import {
  deleteWorkspaceRole as deleteWorkspaceRoleCore,
  deleteWorkspaceRoleByActor as deleteWorkspaceRoleByActorCore,
  listWorkspaceRoles as listWorkspaceRolesCore,
  listWorkspaceRolesByActor as listWorkspaceRolesByActorCore,
  setWorkspaceDefaultMemberRole as setWorkspaceDefaultMemberRoleCore,
  setWorkspaceDefaultMemberRoleByActor as setWorkspaceDefaultMemberRoleByActorCore,
  upsertWorkspaceRoleByActor as upsertWorkspaceRoleByActorCore,
  upsertWorkspaceRole as upsertWorkspaceRoleCore
} from './workspace-admin-role.service';
import {
  deleteWorkspaceMember as deleteWorkspaceMemberCore,
  deleteWorkspaceMemberByActor as deleteWorkspaceMemberByActorCore,
  listWorkspaceMemberCandidates as listWorkspaceMemberCandidatesCore,
  listWorkspaceMemberCandidatesByActor as listWorkspaceMemberCandidatesByActorCore,
  listWorkspaceMembers as listWorkspaceMembersCore,
  listWorkspaceMembersByActor as listWorkspaceMembersByActorCore,
  upsertWorkspaceMemberByActor as upsertWorkspaceMemberByActorCore,
  upsertWorkspaceMember as upsertWorkspaceMemberCore
} from './workspace-admin-member.service';
import {
  deleteWorkspaceAclRule as deleteWorkspaceAclRuleCore,
  deleteWorkspaceAclRuleByActor as deleteWorkspaceAclRuleByActorCore,
  listWorkspaceAclRules as listWorkspaceAclRulesCore,
  listWorkspaceAclRulesByActor as listWorkspaceAclRulesByActorCore,
  upsertWorkspaceAclRuleByActor as upsertWorkspaceAclRuleByActorCore,
  upsertWorkspaceAclRule as upsertWorkspaceAclRuleCore
} from './workspace-admin-acl.service';
import {
  createWorkspaceApiKey as createWorkspaceApiKeyCore,
  listWorkspaceApiKeys as listWorkspaceApiKeysCore,
  revokeWorkspaceApiKey as revokeWorkspaceApiKeyCore
} from './workspace-admin-api-key.service';

const DEFAULT_WORKSPACE_ADMIN_ROLE_ID = 'role_workspace_admin';
const DEFAULT_WORKSPACE_USER_ROLE_ID = 'role_user';

type WorkspaceTreeMetrics = {
  folders: number;
  projects: number;
  maxDepth: number;
};

const countWorkspaceTreeMetrics = (nodes: readonly NativeProjectTreeNode[]): WorkspaceTreeMetrics => {
  let folders = 0;
  let projects = 0;
  let maxDepth = 0;

  const visit = (items: readonly NativeProjectTreeNode[]) => {
    for (const node of items) {
      if (node.depth > maxDepth) {
        maxDepth = node.depth;
      }
      if (node.kind === 'folder') {
        folders += 1;
        visit(node.children);
      } else {
        projects += 1;
      }
    }
  };

  visit(nodes);
  return {
    folders,
    projects,
    maxDepth
  };
};

const countActiveWorkspaceApiKeys = (records: readonly WorkspaceApiKeyRecord[]): number =>
  records.reduce((count, record) => count + (record.revokedAt ? 0 : 1), 0);

@Injectable()
export class WorkspaceAdminService {
  constructor(
    private readonly runtime: GatewayRuntimeService,
    private readonly workspacePolicy: WorkspacePolicyService
  ) {}

  private resolveActor(request: FastifyRequest): GatewayActorContext {
    return resolveActorContext(request.headers as Record<string, unknown>);
  }

  private normalizeActor(actor: GatewayActorContext): GatewayActorContext {
    const accountId = String(actor.accountId ?? '').trim() || 'anonymous';
    return {
      accountId,
      systemRoles: normalizeSystemRoles(actor.systemRoles)
    };
  }

  private async generateWorkspaceId(actor: GatewayActorContext, name: string, now: string): Promise<string> {
    const repository = this.runtime.persistence.workspaceRepository;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const digest = createHash('sha256')
        .update(`${actor.accountId}:${name}:${now}:${attempt}:${randomUUID()}`)
        .digest('hex');
      const candidate = `ws_${digest.slice(0, 12)}`;
      const existing = await repository.getWorkspace(candidate);
      if (!existing) {
        return candidate;
      }
    }
    return `ws_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }

  private generateWorkspaceRoleId(workspaceId: string, roleName: string, existingRoleIds: Set<string>, now: string): string {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const digest = createHash('sha256')
        .update(`${workspaceId}:${roleName}:${now}:${attempt}:${randomUUID()}`)
        .digest('hex');
      const candidate = `role_${digest.slice(0, 12)}`;
      if (!existingRoleIds.has(candidate)) {
        return candidate;
      }
    }
    return `role_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }

  private async authorizeWorkspaceMutation(
    workspaceId: string,
    actor: GatewayActorContext,
    permission: 'workspace.manage' | 'workspace.member'
  ): Promise<
    | {
        workspace: WorkspaceRecord;
      }
    | ResponsePlan
  > {
    const authorization = await this.workspacePolicy.authorizeWorkspaceAccess(workspaceId, actor, permission);
    if (!authorization.ok) {
      if (authorization.reason === 'workspace_not_found') {
        return workspaceNotFoundPlan(workspaceId);
      }
      return forbiddenPlan('Workspace permission denied.', 'forbidden_workspace');
    }
    return {
      workspace: authorization.workspace
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
      defaultMemberRoleId: workspace.defaultMemberRoleId,
      createdBy: workspace.createdBy,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      capabilities
    };
  }

  private normalizeRoleName(builtin: WorkspaceRoleStorageRecord['builtin'], name: string): string {
    return normalizeWorkspaceRoleName({
      builtin,
      name
    });
  }

  private toRolePayload(role: WorkspaceRoleStorageRecord): WorkspaceRoleStorageRecord {
    return {
      ...role,
      name: this.normalizeRoleName(role.builtin, role.name)
    };
  }

  private async listRolePayloads(workspaceId: string): Promise<WorkspaceRoleStorageRecord[]> {
    const roles = await this.runtime.persistence.workspaceRepository.listWorkspaceRoles(workspaceId);
    return roles.map((role) => this.toRolePayload(role));
  }

  private async listAclRulePayloads(workspaceId: string): Promise<WorkspaceFolderAclRecord[]> {
    const [aclRules, roles] = await Promise.all([
      this.runtime.persistence.workspaceRepository.listWorkspaceFolderAcl(workspaceId),
      this.runtime.persistence.workspaceRepository.listWorkspaceRoles(workspaceId)
    ]);
    const adminRoleIds = new Set(roles.filter((role) => role.builtin === 'workspace_admin').map((role) => role.roleId));
    return aclRules
      .filter((rule) => (rule.scope ?? 'folder') === 'folder')
      .map((rule) => ({
        ...rule,
        scope: 'folder',
        locked: Boolean(rule.locked) || rule.roleIds.some((roleId) => adminRoleIds.has(roleId))
      }));
  }

  private isAdminRole(role: Pick<WorkspaceRoleStorageRecord, 'builtin'>): boolean {
    return role.builtin === 'workspace_admin';
  }

  private async resolveWorkspaceRoleContext(workspaceId: string): Promise<{
    workspace: WorkspaceRecord | null;
    roles: WorkspaceRoleStorageRecord[];
    roleMap: Map<string, WorkspaceRoleStorageRecord>;
  }> {
    const [workspace, roles] = await Promise.all([
      this.runtime.persistence.workspaceRepository.getWorkspace(workspaceId),
      this.runtime.persistence.workspaceRepository.listWorkspaceRoles(workspaceId)
    ]);
    return {
      workspace,
      roles,
      roleMap: new Map(roles.map((role) => [role.roleId, role]))
    };
  }

  private buildRoleServiceDependencies() {
    return {
      resolveActor: this.resolveActor.bind(this),
      authorizeWorkspaceMutation: this.authorizeWorkspaceMutation.bind(this),
      resolveWorkspaceRoleContext: this.resolveWorkspaceRoleContext.bind(this),
      isAdminRole: this.isAdminRole.bind(this),
      listRolePayloads: this.listRolePayloads.bind(this),
      normalizeRoleName: this.normalizeRoleName.bind(this),
      generateWorkspaceRoleId: this.generateWorkspaceRoleId.bind(this),
      getWorkspace: this.runtime.persistence.workspaceRepository.getWorkspace.bind(this.runtime.persistence.workspaceRepository),
      upsertWorkspace: this.runtime.persistence.workspaceRepository.upsertWorkspace.bind(this.runtime.persistence.workspaceRepository),
      upsertWorkspaceRole: this.runtime.persistence.workspaceRepository.upsertWorkspaceRole.bind(this.runtime.persistence.workspaceRepository),
      removeWorkspaceRole: this.runtime.persistence.workspaceRepository.removeWorkspaceRole.bind(this.runtime.persistence.workspaceRepository),
      invalidateWorkspace: this.workspacePolicy.invalidateWorkspace.bind(this.workspacePolicy),
      toWorkspacePayload: this.toWorkspacePayload.bind(this)
    };
  }

  private buildMemberServiceDependencies() {
    return {
      resolveActor: this.resolveActor.bind(this),
      authorizeWorkspaceMutation: this.authorizeWorkspaceMutation.bind(this),
      resolveWorkspaceRoleContext: this.resolveWorkspaceRoleContext.bind(this),
      listWorkspaceMembers: this.runtime.persistence.workspaceRepository.listWorkspaceMembers.bind(this.runtime.persistence.workspaceRepository),
      upsertWorkspaceMember: this.runtime.persistence.workspaceRepository.upsertWorkspaceMember.bind(this.runtime.persistence.workspaceRepository),
      removeWorkspaceMember: this.runtime.persistence.workspaceRepository.removeWorkspaceMember.bind(this.runtime.persistence.workspaceRepository),
      listAccounts: this.runtime.persistence.workspaceRepository.listAccounts.bind(this.runtime.persistence.workspaceRepository),
      getWorkspace: this.runtime.persistence.workspaceRepository.getWorkspace.bind(this.runtime.persistence.workspaceRepository),
      invalidateWorkspace: this.workspacePolicy.invalidateWorkspace.bind(this.workspacePolicy),
      toWorkspacePayload: this.toWorkspacePayload.bind(this)
    };
  }

  private buildAclServiceDependencies() {
    return {
      resolveActor: this.resolveActor.bind(this),
      authorizeWorkspaceMutation: this.authorizeWorkspaceMutation.bind(this),
      getWorkspace: this.runtime.persistence.workspaceRepository.getWorkspace.bind(this.runtime.persistence.workspaceRepository),
      listWorkspaceRoles: this.runtime.persistence.workspaceRepository.listWorkspaceRoles.bind(this.runtime.persistence.workspaceRepository),
      listAclRulePayloads: this.listAclRulePayloads.bind(this),
      upsertWorkspaceFolderAcl: this.runtime.persistence.workspaceRepository.upsertWorkspaceFolderAcl.bind(
        this.runtime.persistence.workspaceRepository
      ),
      removeWorkspaceFolderAcl: this.runtime.persistence.workspaceRepository.removeWorkspaceFolderAcl.bind(
        this.runtime.persistence.workspaceRepository
      ),
      invalidateWorkspace: this.workspacePolicy.invalidateWorkspace.bind(this.workspacePolicy),
      toWorkspacePayload: this.toWorkspacePayload.bind(this)
    };
  }

  private buildApiKeyServiceDependencies() {
    return {
      resolveActor: this.resolveActor.bind(this),
      authorizeWorkspaceAccess: this.authorizeWorkspaceMutation.bind(this),
      getWorkspace: this.runtime.persistence.workspaceRepository.getWorkspace.bind(this.runtime.persistence.workspaceRepository),
      listWorkspaceApiKeys: this.runtime.persistence.workspaceRepository.listWorkspaceApiKeys.bind(
        this.runtime.persistence.workspaceRepository
      ),
      createWorkspaceApiKey: this.runtime.persistence.workspaceRepository.createWorkspaceApiKey.bind(
        this.runtime.persistence.workspaceRepository
      ),
      revokeWorkspaceApiKey: this.runtime.persistence.workspaceRepository.revokeWorkspaceApiKey.bind(
        this.runtime.persistence.workspaceRepository
      )
    };
  }

  async listWorkspaces(request: FastifyRequest): Promise<ResponsePlan> {
    const actor = this.resolveActor(request);
    const repository = this.runtime.persistence.workspaceRepository;
    const workspaces = this.workspacePolicy.isSystemManager(actor)
      ? await repository.listAllWorkspaces()
      : await repository.listAccountWorkspaces(actor.accountId);
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

    const now = new Date().toISOString();
    const normalizedName = body.name.trim() || 'Workspace';
    const workspaceId = await this.generateWorkspaceId(actor, normalizedName, now);
    if (isAutoProvisionedWorkspaceId(workspaceId)) {
      return forbiddenPlan('Reserved workspace id prefix cannot be used for manual workspace creation.', 'reserved_workspace_id');
    }
    const workspace: WorkspaceRecord = {
      workspaceId,
      tenantId: DEFAULT_TENANT_ID,
      name: normalizedName,
      defaultMemberRoleId: DEFAULT_WORKSPACE_USER_ROLE_ID,
      createdBy: actor.accountId,
      createdAt: now,
      updatedAt: now
    };

    await this.runtime.persistence.workspaceRepository.upsertWorkspace(workspace);
    await this.runtime.persistence.workspaceRepository.upsertWorkspaceRole({
      workspaceId,
      roleId: DEFAULT_WORKSPACE_ADMIN_ROLE_ID,
      name: WORKSPACE_ADMIN_ROLE_NAME,
      builtin: 'workspace_admin',
      createdAt: now,
      updatedAt: now
    });
    await this.runtime.persistence.workspaceRepository.upsertWorkspaceRole({
      workspaceId,
      roleId: DEFAULT_WORKSPACE_USER_ROLE_ID,
      name: WORKSPACE_MEMBER_ROLE_NAME,
      builtin: null,
      createdAt: now,
      updatedAt: now
    });
    await this.runtime.persistence.workspaceRepository.upsertWorkspaceMember({
      workspaceId,
      accountId: actor.accountId,
      roleIds: [DEFAULT_WORKSPACE_ADMIN_ROLE_ID, DEFAULT_WORKSPACE_USER_ROLE_ID],
      joinedAt: now
    });
    await this.runtime.persistence.workspaceRepository.upsertWorkspaceFolderAcl({
      workspaceId,
      ruleId: 'acl_folder_user_write',
      scope: 'folder',
      folderId: null,
      locked: false,
      roleIds: [DEFAULT_WORKSPACE_USER_ROLE_ID],
      read: 'allow',
      write: 'allow',
      updatedAt: now
    });
    this.workspacePolicy.invalidateWorkspace(workspaceId);

    return jsonPlan(201, {
      ok: true,
      workspace: await this.toWorkspacePayload(workspace, actor)
    });
  }

  async deleteWorkspace(request: FastifyRequest, workspaceId: string): Promise<ResponsePlan> {
    const actor = this.resolveActor(request);
    const authorization = await this.authorizeWorkspaceMutation(workspaceId, actor, 'workspace.manage');
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
    const membership = await this.workspacePolicy.authorizeWorkspaceAccess(workspaceId, actor, 'workspace.member');
    if (!membership.ok) {
      if (membership.reason === 'workspace_not_found') {
        return workspaceNotFoundPlan(workspaceId);
      }
      return forbiddenPlan('Workspace permission denied.', 'forbidden_workspace');
    }
    const [roles, members, aclRules, payload] = await Promise.all([
      this.listRolePayloads(workspaceId),
      this.runtime.persistence.workspaceRepository.listWorkspaceMembers(workspaceId),
      this.listAclRulePayloads(workspaceId),
      this.toWorkspacePayload(workspace, actor)
    ]);
    return jsonPlan(200, {
      ok: true,
      workspace: payload,
      roles,
      members,
      aclRules
    });
  }

  async getWorkspaceMetricsByActor(actorInput: GatewayActorContext, workspaceId: string): Promise<ResponsePlan> {
    const actor = this.normalizeActor(actorInput);
    const authorization = await this.authorizeWorkspaceMutation(workspaceId, actor, 'workspace.manage');
    if ('kind' in authorization) {
      return authorization;
    }

    const [roles, members, aclRules, apiKeys, workspacePayload] = await Promise.all([
      this.runtime.persistence.workspaceRepository.listWorkspaceRoles(workspaceId),
      this.runtime.persistence.workspaceRepository.listWorkspaceMembers(workspaceId),
      this.listAclRulePayloads(workspaceId),
      this.runtime.persistence.workspaceRepository.listWorkspaceApiKeys(workspaceId),
      this.toWorkspacePayload(authorization.workspace, actor)
    ]);

    let treeMetrics: WorkspaceTreeMetrics & { available: boolean } = {
      available: false,
      folders: 0,
      projects: 0,
      maxDepth: 0
    };
    try {
      const tree = await this.runtime.dashboardStore.getProjectTree(undefined, workspaceId);
      const counters = countWorkspaceTreeMetrics(tree.roots);
      treeMetrics = {
        available: true,
        ...counters
      };
    } catch (error) {
      this.runtime.logger.warn('failed to read workspace tree metrics', {
        workspaceId,
        message: error instanceof Error ? error.message : String(error)
      });
    }

    return jsonPlan(200, {
      ok: true,
      workspace: workspacePayload,
      metrics: {
        roleCount: roles.length,
        memberCount: members.length,
        aclRuleCount: aclRules.length,
        apiKeyCount: apiKeys.length,
        activeApiKeyCount: countActiveWorkspaceApiKeys(apiKeys),
        tree: treeMetrics
      }
    });
  }

  async listWorkspaceRoles(request: FastifyRequest, workspaceId: string): Promise<ResponsePlan> {
    return listWorkspaceRolesCore(this.buildRoleServiceDependencies(), request, workspaceId);
  }

  async listWorkspaceRolesByActor(actorInput: GatewayActorContext, workspaceId: string): Promise<ResponsePlan> {
    return listWorkspaceRolesByActorCore(
      this.buildRoleServiceDependencies(),
      this.normalizeActor(actorInput),
      workspaceId
    );
  }

  async upsertWorkspaceRole(
    request: FastifyRequest,
    workspaceId: string,
    body: UpsertWorkspaceRoleDto
  ): Promise<ResponsePlan> {
    return upsertWorkspaceRoleCore(this.buildRoleServiceDependencies(), request, workspaceId, body);
  }

  async upsertWorkspaceRoleByActor(
    actorInput: GatewayActorContext,
    workspaceId: string,
    body: UpsertWorkspaceRoleDto
  ): Promise<ResponsePlan> {
    return upsertWorkspaceRoleByActorCore(
      this.buildRoleServiceDependencies(),
      this.normalizeActor(actorInput),
      workspaceId,
      body
    );
  }

  async deleteWorkspaceRole(request: FastifyRequest, workspaceId: string, roleId: string): Promise<ResponsePlan> {
    return deleteWorkspaceRoleCore(this.buildRoleServiceDependencies(), request, workspaceId, roleId);
  }

  async deleteWorkspaceRoleByActor(
    actorInput: GatewayActorContext,
    workspaceId: string,
    roleId: string
  ): Promise<ResponsePlan> {
    return deleteWorkspaceRoleByActorCore(
      this.buildRoleServiceDependencies(),
      this.normalizeActor(actorInput),
      workspaceId,
      roleId
    );
  }

  async setWorkspaceDefaultMemberRole(
    request: FastifyRequest,
    workspaceId: string,
    body: SetWorkspaceDefaultMemberRoleDto
  ): Promise<ResponsePlan> {
    return setWorkspaceDefaultMemberRoleCore(this.buildRoleServiceDependencies(), request, workspaceId, body);
  }

  async setWorkspaceDefaultMemberRoleByActor(
    actorInput: GatewayActorContext,
    workspaceId: string,
    body: SetWorkspaceDefaultMemberRoleDto
  ): Promise<ResponsePlan> {
    return setWorkspaceDefaultMemberRoleByActorCore(
      this.buildRoleServiceDependencies(),
      this.normalizeActor(actorInput),
      workspaceId,
      body
    );
  }

  async listWorkspaceMembers(request: FastifyRequest, workspaceId: string): Promise<ResponsePlan> {
    return listWorkspaceMembersCore(this.buildMemberServiceDependencies(), request, workspaceId);
  }

  async listWorkspaceMembersByActor(actorInput: GatewayActorContext, workspaceId: string): Promise<ResponsePlan> {
    return listWorkspaceMembersByActorCore(
      this.buildMemberServiceDependencies(),
      this.normalizeActor(actorInput),
      workspaceId
    );
  }

  async listWorkspaceMemberCandidates(
    request: FastifyRequest,
    workspaceId: string,
    query: WorkspaceMemberCandidatesQueryDto
  ): Promise<ResponsePlan> {
    return listWorkspaceMemberCandidatesCore(this.buildMemberServiceDependencies(), request, workspaceId, query);
  }

  async listWorkspaceMemberCandidatesByActor(
    actorInput: GatewayActorContext,
    workspaceId: string,
    query: WorkspaceMemberCandidatesQueryDto
  ): Promise<ResponsePlan> {
    return listWorkspaceMemberCandidatesByActorCore(
      this.buildMemberServiceDependencies(),
      this.normalizeActor(actorInput),
      workspaceId,
      query
    );
  }

  async upsertWorkspaceMember(
    request: FastifyRequest,
    workspaceId: string,
    body: UpsertWorkspaceMemberDto
  ): Promise<ResponsePlan> {
    return upsertWorkspaceMemberCore(this.buildMemberServiceDependencies(), request, workspaceId, body);
  }

  async upsertWorkspaceMemberByActor(
    actorInput: GatewayActorContext,
    workspaceId: string,
    body: UpsertWorkspaceMemberDto
  ): Promise<ResponsePlan> {
    return upsertWorkspaceMemberByActorCore(
      this.buildMemberServiceDependencies(),
      this.normalizeActor(actorInput),
      workspaceId,
      body
    );
  }

  async deleteWorkspaceMember(request: FastifyRequest, workspaceId: string, accountId: string): Promise<ResponsePlan> {
    return deleteWorkspaceMemberCore(this.buildMemberServiceDependencies(), request, workspaceId, accountId);
  }

  async deleteWorkspaceMemberByActor(
    actorInput: GatewayActorContext,
    workspaceId: string,
    accountId: string
  ): Promise<ResponsePlan> {
    return deleteWorkspaceMemberByActorCore(
      this.buildMemberServiceDependencies(),
      this.normalizeActor(actorInput),
      workspaceId,
      accountId
    );
  }

  async listWorkspaceAclRules(request: FastifyRequest, workspaceId: string): Promise<ResponsePlan> {
    return listWorkspaceAclRulesCore(this.buildAclServiceDependencies(), request, workspaceId);
  }

  async listWorkspaceAclRulesByActor(actorInput: GatewayActorContext, workspaceId: string): Promise<ResponsePlan> {
    return listWorkspaceAclRulesByActorCore(
      this.buildAclServiceDependencies(),
      this.normalizeActor(actorInput),
      workspaceId
    );
  }

  async upsertWorkspaceAclRule(
    request: FastifyRequest,
    workspaceId: string,
    body: UpsertWorkspaceAclRuleDto
  ): Promise<ResponsePlan> {
    return upsertWorkspaceAclRuleCore(this.buildAclServiceDependencies(), request, workspaceId, body);
  }

  async upsertWorkspaceAclRuleByActor(
    actorInput: GatewayActorContext,
    workspaceId: string,
    body: UpsertWorkspaceAclRuleDto
  ): Promise<ResponsePlan> {
    return upsertWorkspaceAclRuleByActorCore(
      this.buildAclServiceDependencies(),
      this.normalizeActor(actorInput),
      workspaceId,
      body
    );
  }

  async deleteWorkspaceAclRule(
    request: FastifyRequest,
    workspaceId: string,
    body: DeleteWorkspaceAclRuleDto
  ): Promise<ResponsePlan> {
    return deleteWorkspaceAclRuleCore(this.buildAclServiceDependencies(), request, workspaceId, body);
  }

  async deleteWorkspaceAclRuleByActor(
    actorInput: GatewayActorContext,
    workspaceId: string,
    body: DeleteWorkspaceAclRuleDto
  ): Promise<ResponsePlan> {
    return deleteWorkspaceAclRuleByActorCore(
      this.buildAclServiceDependencies(),
      this.normalizeActor(actorInput),
      workspaceId,
      body
    );
  }

  async listWorkspaceApiKeys(request: FastifyRequest, workspaceId: string): Promise<ResponsePlan> {
    return listWorkspaceApiKeysCore(this.buildApiKeyServiceDependencies(), request, workspaceId);
  }

  async createWorkspaceApiKey(
    request: FastifyRequest,
    workspaceId: string,
    body: CreateWorkspaceApiKeyDto
  ): Promise<ResponsePlan> {
    return createWorkspaceApiKeyCore(this.buildApiKeyServiceDependencies(), request, workspaceId, body);
  }

  async revokeWorkspaceApiKey(
    request: FastifyRequest,
    workspaceId: string,
    body: RevokeWorkspaceApiKeyDto
  ): Promise<ResponsePlan> {
    return revokeWorkspaceApiKeyCore(this.buildApiKeyServiceDependencies(), request, workspaceId, body);
  }
}
