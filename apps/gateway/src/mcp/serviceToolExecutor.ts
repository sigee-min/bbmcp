import type { DispatcherExecutionContext, ToolErrorCode, ToolResponse } from '@ashfox/contracts/types/internal';
import { err } from '@ashfox/runtime/shared/tooling/toolResponse';
import type { ToolExecutor } from '@ashfox/runtime/transport/mcp/executor';
import type { ResponsePlan } from '@ashfox/runtime/transport/mcp/types';
import type { ServiceUsersQueryDto } from '../dto/service-users-query.dto';
import type { ServiceWorkspacesQueryDto } from '../dto/service-workspaces-query.dto';
import type { SetServiceAccountRolesDto } from '../dto/set-service-account-roles.dto';
import type { UpsertServiceGithubAuthSettingsDto } from '../dto/upsert-service-github-auth-settings.dto';
import type { UpsertServiceSmtpSettingsDto } from '../dto/upsert-service-smtp-settings.dto';
import {
  ServiceManagementService,
  type ServiceManagementActor
} from '../services/service-management.service';

type ServiceToolName =
  | 'service_list_workspaces'
  | 'service_list_users'
  | 'service_list_user_workspaces'
  | 'service_set_user_roles'
  | 'service_get_config'
  | 'service_update_smtp'
  | 'service_update_github_auth';

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

const asOptionalBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const asOptionalInteger = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.trunc(value);
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

const normalizeServiceRoles = (
  roles: readonly string[] | undefined
): ServiceManagementActor['systemRoles'] => {
  if (!Array.isArray(roles) || roles.length === 0) {
    return [];
  }
  return Array.from(
    new Set(
      roles
        .map((role) => String(role ?? '').trim().toLowerCase())
        .filter((role): role is 'system_admin' | 'cs_admin' => role === 'system_admin' || role === 'cs_admin')
    )
  );
};

const toServiceActor = (context?: DispatcherExecutionContext): ServiceManagementActor | null => {
  const accountId = asNonEmptyString(context?.mcpAccountId);
  if (!accountId) {
    return null;
  }
  return {
    accountId,
    systemRoles: normalizeServiceRoles(context?.mcpSystemRoles)
  };
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

const toToolErrorCode = (status: number): ToolErrorCode => {
  if (status >= 400 && status < 500) {
    return status === 400 ? 'invalid_payload' : 'invalid_state';
  }
  if (status >= 500) {
    return 'io_error';
  }
  return 'unknown';
};

const toToolResponse = (plan: ResponsePlan): ToolResponse<unknown> => {
  if (plan.kind !== 'json') {
    return err('invalid_state', 'Service MCP tool returned a non-JSON response plan.', {
      reason: 'invalid_service_response_plan_kind',
      kind: plan.kind
    });
  }

  const payload = readResponseBody(plan);
  const payloadError = asRecord(payload.error);
  const payloadCode = asNonEmptyString(payload.code) ?? asNonEmptyString(payloadError.code) ?? 'service_tool_error';
  const payloadMessage =
    asNonEmptyString(payload.message) ??
    asNonEmptyString(payloadError.message) ??
    'Service MCP tool request failed.';

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

const toServiceWorkspacesQuery = (args: Record<string, unknown>): ServiceWorkspacesQueryDto => ({
  ...(asOptionalString(args.q) ? { q: asOptionalString(args.q) } : {}),
  ...(asOptionalString(args.field)
    ? { field: asOptionalString(args.field) as ServiceWorkspacesQueryDto['field'] }
    : {}),
  ...(asOptionalString(args.match)
    ? { match: asOptionalString(args.match) as ServiceWorkspacesQueryDto['match'] }
    : {}),
  ...(asOptionalString(args.memberAccountId) ? { memberAccountId: asOptionalString(args.memberAccountId) } : {}),
  ...(asOptionalInteger(args.limit) ? { limit: asOptionalInteger(args.limit) } : {}),
  ...(asOptionalString(args.cursor) ? { cursor: asOptionalString(args.cursor) } : {})
});

const toServiceUsersQuery = (args: Record<string, unknown>): ServiceUsersQueryDto => ({
  ...(asOptionalString(args.q) ? { q: asOptionalString(args.q) } : {}),
  ...(asOptionalString(args.field)
    ? { field: asOptionalString(args.field) as ServiceUsersQueryDto['field'] }
    : {}),
  ...(asOptionalString(args.match)
    ? { match: asOptionalString(args.match) as ServiceUsersQueryDto['match'] }
    : {}),
  ...(asOptionalString(args.workspaceId) ? { workspaceId: asOptionalString(args.workspaceId) } : {}),
  ...(asOptionalInteger(args.limit) ? { limit: asOptionalInteger(args.limit) } : {}),
  ...(asOptionalString(args.cursor) ? { cursor: asOptionalString(args.cursor) } : {})
});

const toServiceRolesBody = (args: Record<string, unknown>): SetServiceAccountRolesDto => ({
  systemRoles: asStringArray(args.systemRoles)
});

const toSmtpBody = (args: Record<string, unknown>): UpsertServiceSmtpSettingsDto => ({
  ...(asOptionalBoolean(args.enabled) !== undefined ? { enabled: asOptionalBoolean(args.enabled) } : {}),
  ...(asOptionalString(args.host) ? { host: asOptionalString(args.host) } : {}),
  ...(asOptionalInteger(args.port) !== undefined ? { port: asOptionalInteger(args.port) } : {}),
  ...(asOptionalBoolean(args.secure) !== undefined ? { secure: asOptionalBoolean(args.secure) } : {}),
  ...(asOptionalString(args.username) ? { username: asOptionalString(args.username) } : {}),
  ...(asOptionalString(args.password) ? { password: asOptionalString(args.password) } : {}),
  ...(asOptionalString(args.fromEmail) ? { fromEmail: asOptionalString(args.fromEmail) } : {}),
  ...(asOptionalString(args.fromName) ? { fromName: asOptionalString(args.fromName) } : {})
});

const toGithubBody = (args: Record<string, unknown>): UpsertServiceGithubAuthSettingsDto => ({
  ...(asOptionalBoolean(args.enabled) !== undefined ? { enabled: asOptionalBoolean(args.enabled) } : {}),
  ...(asOptionalString(args.clientId) ? { clientId: asOptionalString(args.clientId) } : {}),
  ...(asOptionalString(args.clientSecret) ? { clientSecret: asOptionalString(args.clientSecret) } : {}),
  ...(asOptionalString(args.callbackUrl) ? { callbackUrl: asOptionalString(args.callbackUrl) } : {}),
  ...(asOptionalString(args.scopes) ? { scopes: asOptionalString(args.scopes) } : {})
});

export class ServiceToolExecutor implements ToolExecutor {
  constructor(
    private readonly resolveServiceManagement: () => ServiceManagementService | null
  ) {}

  async callTool(
    name: string,
    args: unknown,
    context?: DispatcherExecutionContext
  ): Promise<ToolResponse<unknown>> {
    if (context?.mcpApiKeySpace !== 'service') {
      return err('invalid_state', 'Service MCP tools require a service API key.', {
        reason: 'service_api_key_required'
      });
    }

    const actor = toServiceActor(context);
    if (!actor) {
      return err('invalid_state', 'MCP account context is required for service MCP tools.', {
        reason: 'missing_mcp_account_context'
      });
    }

    const payload = asRecord(args);
    const toolName = name as ServiceToolName;
    const serviceManagement = this.resolveServiceManagement();
    if (!serviceManagement) {
      return err('invalid_state', 'Service MCP tool lane is unavailable.', {
        reason: 'service_management_unavailable'
      });
    }

    switch (toolName) {
      case 'service_list_workspaces': {
        const plan = await serviceManagement.listServiceWorkspacesByActor(
          actor,
          toServiceWorkspacesQuery(payload)
        );
        return toToolResponse(plan);
      }
      case 'service_list_users': {
        const plan = await serviceManagement.listServiceUsersByActor(actor, toServiceUsersQuery(payload));
        return toToolResponse(plan);
      }
      case 'service_list_user_workspaces': {
        const accountId = asNonEmptyString(payload.accountId);
        if (!accountId) {
          return err('invalid_payload', 'accountId is required.', {
            reason: 'account_id_required'
          });
        }
        const plan = await serviceManagement.listServiceUserWorkspacesByActor(actor, accountId);
        return toToolResponse(plan);
      }
      case 'service_set_user_roles': {
        const accountId = asNonEmptyString(payload.accountId);
        if (!accountId) {
          return err('invalid_payload', 'accountId is required.', {
            reason: 'account_id_required'
          });
        }
        const plan = await serviceManagement.setServiceUserRolesByActor(
          actor,
          accountId,
          toServiceRolesBody(payload)
        );
        return toToolResponse(plan);
      }
      case 'service_get_config': {
        const plan = await serviceManagement.getServiceConfigByActor(actor);
        return toToolResponse(plan);
      }
      case 'service_update_smtp': {
        const plan = await serviceManagement.upsertServiceSmtpSettingsByActor(actor, toSmtpBody(payload));
        return toToolResponse(plan);
      }
      case 'service_update_github_auth': {
        const plan = await serviceManagement.upsertServiceGithubAuthSettingsByActor(
          actor,
          toGithubBody(payload)
        );
        return toToolResponse(plan);
      }
      default:
        return err('invalid_payload', `Unknown service MCP tool: ${name}`, {
          reason: 'unknown_service_tool',
          tool: name
        });
    }
  }
}
