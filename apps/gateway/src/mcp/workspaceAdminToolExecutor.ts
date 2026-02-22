import {
  normalizeSystemRoles,
  type WorkspaceAclEffect
} from '@ashfox/backend-core';
import type {
  DispatcherExecutionContext,
  ToolErrorCode,
  ToolResponse
} from '@ashfox/contracts/types/internal';
import { err } from '@ashfox/runtime/shared/tooling/toolResponse';
import type { ToolExecutor } from '@ashfox/runtime/transport/mcp/executor';
import type { ResponsePlan } from '@ashfox/runtime/transport/mcp/types';
import type { DeleteWorkspaceAclRuleDto } from '../dto/delete-workspace-acl-rule.dto';
import type { SetWorkspaceDefaultMemberRoleDto } from '../dto/set-workspace-default-member-role.dto';
import type { UpsertWorkspaceAclRuleDto } from '../dto/upsert-workspace-acl-rule.dto';
import type { UpsertWorkspaceMemberDto } from '../dto/upsert-workspace-member.dto';
import type { UpsertWorkspaceRoleDto } from '../dto/upsert-workspace-role.dto';
import type { GatewayActorContext } from '../gatewayDashboardHelpers';
import { WorkspaceAdminService } from '../services/workspace-admin.service';

type WorkspaceAdminToolName =
  | 'workspace_get_metrics'
  | 'workspace_list_members'
  | 'workspace_upsert_member'
  | 'workspace_delete_member'
  | 'workspace_list_roles'
  | 'workspace_upsert_role'
  | 'workspace_delete_role'
  | 'workspace_set_default_member_role'
  | 'workspace_list_acl_rules'
  | 'workspace_upsert_acl_rule'
  | 'workspace_delete_acl_rule';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const asOptionalString = (value: unknown): string | undefined => {
  const normalized = asNonEmptyString(value);
  return normalized ?? undefined;
};

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => asNonEmptyString(entry))
        .filter((entry): entry is string => typeof entry === 'string')
    )
  );
};

const toToolErrorCode = (status: number): ToolErrorCode => {
  if (status >= 400 && status < 500) {
    return status === 400 ? 'invalid_payload' : 'invalid_state';
  }
  if (status >= 500) {
    return 'io_error';
  }
  return 'unknown';
};

const readResponseBody = (plan: ResponsePlan): Record<string, unknown> => {
  if (plan.kind !== 'json') {
    return {};
  }
  try {
    const parsed = JSON.parse(plan.body) as unknown;
    return asRecord(parsed);
  } catch {
    return {};
  }
};

const toToolResponse = (plan: ResponsePlan): ToolResponse<unknown> => {
  if (plan.kind !== 'json') {
    return err('invalid_state', 'Workspace admin MCP tool returned a non-JSON response plan.', {
      reason: 'invalid_workspace_admin_response_plan_kind',
      kind: plan.kind
    });
  }

  const payload = readResponseBody(plan);
  const payloadError = asRecord(payload.error);
  const payloadCode =
    asNonEmptyString(payload.code) ??
    asNonEmptyString(payloadError.code) ??
    'workspace_admin_tool_error';
  const payloadMessage =
    asNonEmptyString(payload.message) ??
    asNonEmptyString(payloadError.message) ??
    'Workspace admin MCP tool request failed.';

  if (plan.status >= 200 && plan.status < 300 && payload.ok !== false) {
    return {
      ok: true,
      data: payload
    };
  }

  return err(toToolErrorCode(plan.status), payloadMessage, {
    reason: payloadCode,
    status: plan.status
  });
};

const toWorkspaceActor = (context?: DispatcherExecutionContext): GatewayActorContext | null => {
  const accountId = asNonEmptyString(context?.mcpAccountId);
  if (!accountId) {
    return null;
  }
  return {
    accountId,
    systemRoles: normalizeSystemRoles(context?.mcpSystemRoles)
  };
};

const readWorkspaceId = (context?: DispatcherExecutionContext): string | null =>
  asNonEmptyString(context?.mcpWorkspaceId);

const toUpsertMemberBody = (args: Record<string, unknown>): UpsertWorkspaceMemberDto => ({
  accountId: asNonEmptyString(args.accountId) ?? '',
  roleIds: asStringArray(args.roleIds)
});

const toUpsertRoleBody = (args: Record<string, unknown>): UpsertWorkspaceRoleDto => ({
  ...(asOptionalString(args.roleId) ? { roleId: asOptionalString(args.roleId) } : {}),
  name: asNonEmptyString(args.name) ?? ''
});

const toSetDefaultMemberRoleBody = (
  args: Record<string, unknown>
): SetWorkspaceDefaultMemberRoleDto => ({
  roleId: asNonEmptyString(args.roleId) ?? ''
});

const toWorkspaceAclEffect = (value: unknown): WorkspaceAclEffect => {
  if (value === 'allow' || value === 'deny' || value === 'inherit') {
    return value;
  }
  return 'inherit';
};

const toUpsertAclRuleBody = (args: Record<string, unknown>): UpsertWorkspaceAclRuleDto => ({
  ...(asOptionalString(args.ruleId) ? { ruleId: asOptionalString(args.ruleId) } : {}),
  ...(asOptionalString(args.folderId) ? { folderId: asOptionalString(args.folderId) } : {}),
  roleIds: asStringArray(args.roleIds),
  read: toWorkspaceAclEffect(args.read),
  write: toWorkspaceAclEffect(args.write)
});

const toDeleteAclRuleBody = (args: Record<string, unknown>): DeleteWorkspaceAclRuleDto => ({
  ruleId: asNonEmptyString(args.ruleId) ?? ''
});

export class WorkspaceAdminToolExecutor implements ToolExecutor {
  constructor(
    private readonly resolveWorkspaceAdmin: () => WorkspaceAdminService | null
  ) {}

  async callTool(
    name: string,
    args: unknown,
    context?: DispatcherExecutionContext
  ): Promise<ToolResponse<unknown>> {
    if (context?.mcpApiKeySpace !== 'workspace') {
      return err('invalid_state', 'Workspace admin MCP tools require a workspace API key.', {
        reason: 'workspace_api_key_required'
      });
    }

    const actor = toWorkspaceActor(context);
    if (!actor) {
      return err('invalid_state', 'MCP account context is required for workspace admin MCP tools.', {
        reason: 'missing_mcp_account_context'
      });
    }

    const workspaceId = readWorkspaceId(context);
    if (!workspaceId) {
      return err('invalid_state', 'MCP workspace context is required for workspace admin MCP tools.', {
        reason: 'missing_mcp_workspace_context'
      });
    }

    const payload = asRecord(args);
    const toolName = name as WorkspaceAdminToolName;
    const workspaceAdmin = this.resolveWorkspaceAdmin();
    if (!workspaceAdmin) {
      return err('invalid_state', 'Workspace admin MCP tool lane is unavailable.', {
        reason: 'workspace_admin_unavailable'
      });
    }

    switch (toolName) {
      case 'workspace_get_metrics': {
        const plan = await workspaceAdmin.getWorkspaceMetricsByActor(actor, workspaceId);
        return toToolResponse(plan);
      }
      case 'workspace_list_members': {
        const plan = await workspaceAdmin.listWorkspaceMembersByActor(actor, workspaceId);
        return toToolResponse(plan);
      }
      case 'workspace_upsert_member': {
        const plan = await workspaceAdmin.upsertWorkspaceMemberByActor(
          actor,
          workspaceId,
          toUpsertMemberBody(payload)
        );
        return toToolResponse(plan);
      }
      case 'workspace_delete_member': {
        const accountId = asNonEmptyString(payload.accountId);
        if (!accountId) {
          return err('invalid_payload', 'accountId is required.', {
            reason: 'account_id_required'
          });
        }
        const plan = await workspaceAdmin.deleteWorkspaceMemberByActor(
          actor,
          workspaceId,
          accountId
        );
        return toToolResponse(plan);
      }
      case 'workspace_list_roles': {
        const plan = await workspaceAdmin.listWorkspaceRolesByActor(actor, workspaceId);
        return toToolResponse(plan);
      }
      case 'workspace_upsert_role': {
        const plan = await workspaceAdmin.upsertWorkspaceRoleByActor(
          actor,
          workspaceId,
          toUpsertRoleBody(payload)
        );
        return toToolResponse(plan);
      }
      case 'workspace_delete_role': {
        const roleId = asNonEmptyString(payload.roleId);
        if (!roleId) {
          return err('invalid_payload', 'roleId is required.', {
            reason: 'role_id_required'
          });
        }
        const plan = await workspaceAdmin.deleteWorkspaceRoleByActor(actor, workspaceId, roleId);
        return toToolResponse(plan);
      }
      case 'workspace_set_default_member_role': {
        const plan = await workspaceAdmin.setWorkspaceDefaultMemberRoleByActor(
          actor,
          workspaceId,
          toSetDefaultMemberRoleBody(payload)
        );
        return toToolResponse(plan);
      }
      case 'workspace_list_acl_rules': {
        const plan = await workspaceAdmin.listWorkspaceAclRulesByActor(actor, workspaceId);
        return toToolResponse(plan);
      }
      case 'workspace_upsert_acl_rule': {
        const plan = await workspaceAdmin.upsertWorkspaceAclRuleByActor(
          actor,
          workspaceId,
          toUpsertAclRuleBody(payload)
        );
        return toToolResponse(plan);
      }
      case 'workspace_delete_acl_rule': {
        const plan = await workspaceAdmin.deleteWorkspaceAclRuleByActor(
          actor,
          workspaceId,
          toDeleteAclRuleBody(payload)
        );
        return toToolResponse(plan);
      }
      default:
        return err('invalid_payload', `Unknown workspace admin MCP tool: ${name}`, {
          reason: 'unknown_workspace_admin_tool',
          tool: name
        });
    }
  }
}
