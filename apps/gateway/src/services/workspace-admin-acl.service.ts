import type { WorkspaceFolderAclRecord, WorkspaceRecord, WorkspaceRoleStorageRecord } from '@ashfox/backend-core';
import type { ResponsePlan } from '@ashfox/runtime/transport/mcp/types';
import type { FastifyRequest } from 'fastify';
import type { DeleteWorkspaceAclRuleDto } from '../dto/delete-workspace-acl-rule.dto';
import type { UpsertWorkspaceAclRuleDto } from '../dto/upsert-workspace-acl-rule.dto';
import { jsonPlan, workspaceNotFoundPlan, type GatewayActorContext } from '../gatewayDashboardHelpers';

const ROOT_FOLDER_KEY = '__root__';

type WorkspaceAclTemplateRecord = WorkspaceFolderAclRecord;

interface WorkspaceAclServiceDependencies {
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
  getWorkspace: (workspaceId: string) => Promise<WorkspaceRecord | null>;
  listWorkspaceRoles: (workspaceId: string) => Promise<WorkspaceRoleStorageRecord[]>;
  listAclRulePayloads: (workspaceId: string) => Promise<WorkspaceFolderAclRecord[]>;
  upsertWorkspaceFolderAcl: (record: WorkspaceFolderAclRecord) => Promise<void>;
  removeWorkspaceFolderAcl: (workspaceId: string, folderId: string | null, roleId: string) => Promise<void>;
  invalidateWorkspace: (workspaceId: string) => void;
  toWorkspacePayload: (workspace: WorkspaceRecord, actor: GatewayActorContext) => Promise<Record<string, unknown>>;
}

const normalizeRoleIds = (roleIds: readonly string[]): string[] => {
  const deduped = new Set<string>();
  for (const roleId of roleIds) {
    const normalizedRoleId = String(roleId ?? '').trim();
    if (normalizedRoleId.length > 0) {
      deduped.add(normalizedRoleId);
    }
  }
  return Array.from(deduped);
};

const normalizeFolderId = (folderId: unknown): string | null => {
  if (typeof folderId !== 'string') {
    return null;
  }
  const normalized = folderId.trim();
  return normalized.length > 0 ? normalized : null;
};

const toTemplateKey = (rule: {
  folderId: string | null;
  read: WorkspaceFolderAclRecord['read'];
  write: WorkspaceFolderAclRecord['write'];
  locked?: boolean;
}): string => {
  const folderKey = rule.folderId ?? ROOT_FOLDER_KEY;
  const lockedKey = rule.locked === true ? '1' : '0';
  return [folderKey, rule.read, rule.write, lockedKey].join('::');
};

const toTemplateRuleId = (rule: {
  folderId: string | null;
  read: WorkspaceFolderAclRecord['read'];
  write: WorkspaceFolderAclRecord['write'];
  locked?: boolean;
}): string => `acl_${Buffer.from(toTemplateKey(rule), 'utf8').toString('base64url')}`;

const groupAclTemplates = (rules: readonly WorkspaceFolderAclRecord[]): WorkspaceAclTemplateRecord[] => {
  const grouped = new Map<
    string,
    WorkspaceAclTemplateRecord & {
      _roles: Set<string>;
    }
  >();

  for (const rule of rules) {
    if ((rule.scope ?? 'folder') !== 'folder') {
      continue;
    }
    const folderId = normalizeFolderId(rule.folderId);
    const roleIds = normalizeRoleIds(rule.roleIds ?? []);
    if (roleIds.length === 0) {
      continue;
    }

    const key = toTemplateKey({
      folderId,
      read: rule.read,
      write: rule.write,
      locked: rule.locked
    });

    const existing = grouped.get(key);
    if (existing) {
      for (const roleId of roleIds) {
        existing._roles.add(roleId);
      }
      if (rule.updatedAt > existing.updatedAt) {
        existing.updatedAt = rule.updatedAt;
      }
      existing.locked = existing.locked || rule.locked === true;
      continue;
    }

    grouped.set(key, {
      workspaceId: rule.workspaceId,
      ruleId: toTemplateRuleId({
        folderId,
        read: rule.read,
        write: rule.write,
        locked: rule.locked
      }),
      scope: 'folder' as const,
      folderId,
      roleIds,
      _roles: new Set(roleIds),
      read: rule.read,
      write: rule.write,
      locked: rule.locked === true,
      updatedAt: rule.updatedAt
    });
  }

  return Array.from(grouped.values())
    .map((entry) => ({
      workspaceId: entry.workspaceId,
      ruleId: entry.ruleId,
      scope: 'folder' as const,
      folderId: entry.folderId,
      roleIds: Array.from(entry._roles).sort(),
      read: entry.read,
      write: entry.write,
      locked: entry.locked,
      updatedAt: entry.updatedAt
    }))
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId));
};

export const listWorkspaceAclRules = async (
  dependencies: WorkspaceAclServiceDependencies,
  request: FastifyRequest,
  workspaceId: string
): Promise<ResponsePlan> => {
  const actor = dependencies.resolveActor(request);
  return listWorkspaceAclRulesByActor(dependencies, actor, workspaceId);
};

export const listWorkspaceAclRulesByActor = async (
  dependencies: WorkspaceAclServiceDependencies,
  actor: GatewayActorContext,
  workspaceId: string
): Promise<ResponsePlan> => {
  const workspace = await dependencies.getWorkspace(workspaceId);
  if (!workspace) {
    return workspaceNotFoundPlan(workspaceId);
  }
  const [aclRules, payload] = await Promise.all([
    dependencies.listAclRulePayloads(workspaceId),
    dependencies.toWorkspacePayload(workspace, actor)
  ]);
  return jsonPlan(200, {
    ok: true,
    workspace: payload,
    aclRules: groupAclTemplates(aclRules)
  });
};

export const upsertWorkspaceAclRule = async (
  dependencies: WorkspaceAclServiceDependencies,
  request: FastifyRequest,
  workspaceId: string,
  body: UpsertWorkspaceAclRuleDto
): Promise<ResponsePlan> => {
  const actor = dependencies.resolveActor(request);
  return upsertWorkspaceAclRuleByActor(dependencies, actor, workspaceId, body);
};

export const upsertWorkspaceAclRuleByActor = async (
  dependencies: WorkspaceAclServiceDependencies,
  actor: GatewayActorContext,
  workspaceId: string,
  body: UpsertWorkspaceAclRuleDto
): Promise<ResponsePlan> => {
  const authorization = await dependencies.authorizeWorkspaceMutation(workspaceId, actor, 'workspace.manage');
  if ('kind' in authorization) {
    return authorization;
  }

  const normalizedFolderId = normalizeFolderId(body.folderId);
  const normalizedRoleIds = normalizeRoleIds(body.roleIds);
  if (normalizedRoleIds.length === 0) {
    return jsonPlan(400, {
      ok: false,
      code: 'invalid_payload',
      message: 'roleIds is required.'
    });
  }

  const roles = await dependencies.listWorkspaceRoles(workspaceId);
  const roleMap = new Map(roles.map((role) => [role.roleId, role]));
  for (const roleId of normalizedRoleIds) {
    if (!roleMap.has(roleId)) {
      return jsonPlan(404, {
        ok: false,
        code: 'workspace_role_not_found',
        message: 'ACL 규칙 대상 역할을 찾을 수 없습니다.'
      });
    }
  }

  const existingTemplates = groupAclTemplates(await dependencies.listAclRulePayloads(workspaceId));
  const requestedRuleId = typeof body.ruleId === 'string' ? body.ruleId.trim() : '';
  if (requestedRuleId) {
    const targetTemplate = existingTemplates.find((entry) => entry.ruleId === requestedRuleId);
    if (!targetTemplate) {
      return jsonPlan(404, {
        ok: false,
        code: 'workspace_acl_rule_not_found',
        message: 'ACL 규칙을 찾을 수 없습니다.'
      });
    }
    if (targetTemplate.locked) {
      return jsonPlan(400, {
        ok: false,
        code: 'workspace_acl_admin_rule_immutable',
        message: '워크스페이스 어드민 고정 ACL 규칙은 수정할 수 없습니다.'
      });
    }
    await Promise.all(
      targetTemplate.roleIds.map((roleId) =>
        dependencies.removeWorkspaceFolderAcl(workspaceId, targetTemplate.folderId, roleId)
      )
    );
  }

  const now = new Date().toISOString();
  const locked = normalizedRoleIds.some((roleId) => roleMap.get(roleId)?.builtin === 'workspace_admin');
  const templateRuleId = toTemplateRuleId({
    folderId: normalizedFolderId,
    read: body.read,
    write: body.write,
    locked
  });

  await Promise.all(
    normalizedRoleIds.map((roleId) =>
      dependencies.upsertWorkspaceFolderAcl({
        workspaceId,
        ruleId: templateRuleId,
        scope: 'folder',
        folderId: normalizedFolderId,
        roleIds: [roleId],
        read: body.read,
        write: body.write,
        locked,
        updatedAt: now
      })
    )
  );

  dependencies.invalidateWorkspace(workspaceId);
  return jsonPlan(200, {
    ok: true,
    aclRules: groupAclTemplates(await dependencies.listAclRulePayloads(workspaceId))
  });
};

export const deleteWorkspaceAclRule = async (
  dependencies: WorkspaceAclServiceDependencies,
  request: FastifyRequest,
  workspaceId: string,
  body: DeleteWorkspaceAclRuleDto
): Promise<ResponsePlan> => {
  const actor = dependencies.resolveActor(request);
  return deleteWorkspaceAclRuleByActor(dependencies, actor, workspaceId, body);
};

export const deleteWorkspaceAclRuleByActor = async (
  dependencies: WorkspaceAclServiceDependencies,
  actor: GatewayActorContext,
  workspaceId: string,
  body: DeleteWorkspaceAclRuleDto
): Promise<ResponsePlan> => {
  const authorization = await dependencies.authorizeWorkspaceMutation(workspaceId, actor, 'workspace.manage');
  if ('kind' in authorization) {
    return authorization;
  }

  const normalizedRuleId = body.ruleId.trim();
  if (!normalizedRuleId) {
    return jsonPlan(400, {
      ok: false,
      code: 'invalid_payload',
      message: 'ruleId is required.'
    });
  }

  const existingTemplates = groupAclTemplates(await dependencies.listAclRulePayloads(workspaceId));
  const targetTemplate = existingTemplates.find((entry) => entry.ruleId === normalizedRuleId);
  if (!targetTemplate) {
    return jsonPlan(404, {
      ok: false,
      code: 'workspace_acl_rule_not_found',
      message: 'ACL 규칙을 찾을 수 없습니다.'
    });
  }

  if (targetTemplate.locked) {
    return jsonPlan(400, {
      ok: false,
      code: 'workspace_acl_admin_rule_immutable',
      message: '워크스페이스 어드민 고정 ACL 규칙은 삭제할 수 없습니다.'
    });
  }

  await Promise.all(
    targetTemplate.roleIds.map((roleId) => dependencies.removeWorkspaceFolderAcl(workspaceId, targetTemplate.folderId, roleId))
  );

  dependencies.invalidateWorkspace(workspaceId);
  return jsonPlan(200, {
    ok: true,
    aclRules: groupAclTemplates(await dependencies.listAclRulePayloads(workspaceId))
  });
};
