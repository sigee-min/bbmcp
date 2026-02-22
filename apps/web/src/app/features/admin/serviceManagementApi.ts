import {
  normalizeSystemRoles,
  type ServiceApiKeyRecord,
  type ServiceManagedAccountRecord,
  type ServiceSearchMeta,
  type ServiceSettingsView,
  type ServiceUserWorkspaceMembershipSummary,
  type ServiceWorkspaceSummary
} from '../../../lib/dashboardModel';
import type { ServiceSearchMatchMode, ServiceUsersSearchField, ServiceWorkspacesSearchField } from '@ashfox/backend-core';
import { requestGatewayApi } from '../../../lib/gatewayApiClient';

type ServiceUsersGuards = {
  minimumSystemAdminCount: number;
  currentSystemAdminCount: number;
};

interface ServiceWorkspacesResponse {
  ok: boolean;
  workspaces: unknown[];
  search?: unknown;
  code?: string;
  message?: string;
}

interface ServiceUsersResponse {
  ok: boolean;
  users: unknown[];
  guards?: ServiceUsersGuards;
  search?: unknown;
  code?: string;
  message?: string;
}

interface ServiceConfigResponse {
  ok: boolean;
  permissions?: {
    canEdit?: boolean;
  };
  settings: ServiceSettingsView;
  code?: string;
  message?: string;
}

interface ServiceSetUserRolesResponse {
  ok: boolean;
  user: ServiceManagedAccountRecord;
  code?: string;
  message?: string;
}

interface ServiceConfigMutationResponse {
  ok: boolean;
  settings: ServiceSettingsView;
  code?: string;
  message?: string;
}

interface ServiceUserWorkspacesResponse {
  ok: boolean;
  account?: unknown;
  workspaces?: unknown[];
  code?: string;
  message?: string;
}

interface ServiceApiKeysResponse {
  ok: boolean;
  apiKeys?: unknown[];
  code?: string;
  message?: string;
}

interface ServiceApiKeyCreateResponse {
  ok: boolean;
  apiKey: ServiceApiKeyRecord;
  secret: string;
  code?: string;
  message?: string;
}

const SERVICE_ERROR_MESSAGES: Record<string, string> = {
  forbidden_service_management: '서비스 관리 접근 권한이 없습니다.',
  forbidden_system_admin_required: '해당 작업은 시스템 어드민 권한이 필요합니다.',
  service_user_not_found: '대상 사용자 계정을 찾을 수 없습니다.',
  service_api_key_not_found: '요청한 서비스 API 키를 찾을 수 없습니다.',
  service_api_key_limit_exceeded: '활성 서비스 API 키는 계정당 최대 10개까지 발급할 수 있습니다.',
  system_admin_last_guard: '시스템 어드민은 최소 1명 이상 존재해야 합니다.',
  invalid_payload: '요청 형식이 올바르지 않습니다.'
};

const DEFAULT_SERVICE_SEARCH_LIMIT = 25;

const normalizeServiceMatchMode = (value: unknown): ServiceSearchMatchMode => {
  if (value === 'exact' || value === 'prefix' || value === 'contains') {
    return value;
  }
  return 'contains';
};

const normalizeUsersField = (value: unknown): ServiceUsersSearchField => {
  if (
    value === 'any' ||
    value === 'accountId' ||
    value === 'displayName' ||
    value === 'email' ||
    value === 'localLoginId' ||
    value === 'githubLogin'
  ) {
    return value;
  }
  return 'any';
};

const normalizeWorkspacesField = (value: unknown): ServiceWorkspacesSearchField => {
  if (value === 'any' || value === 'workspaceId' || value === 'name' || value === 'createdBy' || value === 'memberAccountId') {
    return value;
  }
  return 'any';
};

const toNullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const toSearchLimit = (value: unknown, fallback = DEFAULT_SERVICE_SEARCH_LIMIT): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(value), 1), 100);
};

const toSearchTotal = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
};

const normalizeServiceWorkspace = (value: unknown): ServiceWorkspaceSummary | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const workspaceId = typeof record.workspaceId === 'string' ? record.workspaceId.trim() : '';
  if (!workspaceId) {
    return null;
  }
  const name = typeof record.name === 'string' && record.name.trim().length > 0 ? record.name.trim() : workspaceId;
  const defaultMemberRoleId =
    typeof record.defaultMemberRoleId === 'string' && record.defaultMemberRoleId.trim().length > 0
      ? record.defaultMemberRoleId.trim()
      : 'role_user';
  const createdBy = typeof record.createdBy === 'string' ? record.createdBy.trim() : '';
  const createdAt = typeof record.createdAt === 'string' ? record.createdAt : '';
  const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : '';
  return {
    workspaceId,
    name,
    defaultMemberRoleId,
    createdBy,
    createdAt,
    updatedAt
  };
};

const normalizeServiceUser = (value: unknown): ServiceManagedAccountRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const accountId = typeof record.accountId === 'string' ? record.accountId.trim() : '';
  if (!accountId) {
    return null;
  }
  const displayName = typeof record.displayName === 'string' && record.displayName.trim().length > 0 ? record.displayName : accountId;
  const email = typeof record.email === 'string' ? record.email : '';
  const localLoginId = typeof record.localLoginId === 'string' ? record.localLoginId : null;
  const githubLogin = typeof record.githubLogin === 'string' ? record.githubLogin : null;
  const systemRoles = normalizeSystemRoles(
    Array.isArray(record.systemRoles) ? record.systemRoles.filter((role): role is string => typeof role === 'string') : undefined
  );
  const createdAt = typeof record.createdAt === 'string' ? record.createdAt : '';
  const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : '';
  return {
    accountId,
    displayName,
    email,
    localLoginId,
    githubLogin,
    systemRoles,
    createdAt,
    updatedAt
  };
};

const normalizeServiceMembership = (value: unknown): ServiceUserWorkspaceMembershipSummary | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const accountId = typeof record.accountId === 'string' ? record.accountId.trim() : '';
  const workspaceId = typeof record.workspaceId === 'string' ? record.workspaceId.trim() : '';
  if (!accountId || !workspaceId) {
    return null;
  }
  const roleIds = Array.isArray(record.roleIds)
    ? Array.from(new Set(record.roleIds.filter((role): role is string => typeof role === 'string').map((role) => role.trim()).filter(Boolean)))
    : [];
  const joinedAt = typeof record.joinedAt === 'string' ? record.joinedAt : '';
  return {
    accountId,
    workspaceId,
    roleIds,
    joinedAt
  };
};

const normalizeServiceApiKey = (value: unknown): ServiceApiKeyRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const keyId = typeof record.keyId === 'string' ? record.keyId.trim() : '';
  if (!keyId) {
    return null;
  }
  return {
    keyId,
    name: typeof record.name === 'string' && record.name.trim().length > 0 ? record.name.trim() : 'API key',
    keyPrefix: typeof record.keyPrefix === 'string' ? record.keyPrefix : '',
    createdBy: typeof record.createdBy === 'string' ? record.createdBy : '',
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : '',
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
    lastUsedAt: toNullableString(record.lastUsedAt),
    expiresAt: toNullableString(record.expiresAt),
    revokedAt: toNullableString(record.revokedAt)
  };
};

const toGuardCount = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.trunc(value));
};

const buildServiceQueryString = (params: Record<string, string | number | null | undefined>): string => {
  const query = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(params)) {
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      query.set(key, String(Math.trunc(rawValue)));
      continue;
    }
    if (typeof rawValue !== 'string') {
      continue;
    }
    const normalized = rawValue.trim();
    if (normalized.length > 0) {
      query.set(key, normalized);
    }
  }
  const encoded = query.toString();
  return encoded.length > 0 ? `?${encoded}` : '';
};

export type ServiceUsersSearchMeta = ServiceSearchMeta<ServiceUsersSearchField> & {
  workspaceId: string | null;
};

export type ServiceWorkspacesSearchMeta = ServiceSearchMeta<ServiceWorkspacesSearchField> & {
  memberAccountId: string | null;
};

export interface ServiceUsersSearchQuery {
  q?: string;
  field?: ServiceUsersSearchField;
  match?: ServiceSearchMatchMode;
  workspaceId?: string;
  limit?: number;
  cursor?: string | null;
}

export interface ServiceWorkspacesSearchQuery {
  q?: string;
  field?: ServiceWorkspacesSearchField;
  match?: ServiceSearchMatchMode;
  memberAccountId?: string;
  limit?: number;
  cursor?: string | null;
}

export interface ServiceUserWorkspaceRecord extends ServiceWorkspaceSummary {
  membership: ServiceUserWorkspaceMembershipSummary | null;
}

export interface ServiceUserWorkspaceLookup {
  account: ServiceManagedAccountRecord | null;
  workspaces: ServiceUserWorkspaceRecord[];
}

export interface ServiceUsersSearchResult {
  users: ServiceManagedAccountRecord[];
  guards: ServiceUsersGuards;
  search: ServiceUsersSearchMeta;
}

export interface ServiceWorkspacesSearchResult {
  workspaces: ServiceWorkspaceSummary[];
  search: ServiceWorkspacesSearchMeta;
}

const normalizeUsersSearchMeta = (
  raw: unknown,
  fallbackQuery?: ServiceUsersSearchQuery
): ServiceUsersSearchMeta => {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    q: toNullableString(record.q) ?? toNullableString(fallbackQuery?.q),
    field: normalizeUsersField(record.field ?? fallbackQuery?.field),
    match: normalizeServiceMatchMode(record.match ?? fallbackQuery?.match),
    limit: toSearchLimit(record.limit, toSearchLimit(fallbackQuery?.limit, DEFAULT_SERVICE_SEARCH_LIMIT)),
    cursor: toNullableString(record.cursor) ?? toNullableString(fallbackQuery?.cursor),
    nextCursor: toNullableString(record.nextCursor),
    workspaceId: toNullableString(record.workspaceId) ?? toNullableString(fallbackQuery?.workspaceId),
    total: toSearchTotal(record.total)
  };
};

const normalizeWorkspacesSearchMeta = (
  raw: unknown,
  fallbackQuery?: ServiceWorkspacesSearchQuery
): ServiceWorkspacesSearchMeta => {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    q: toNullableString(record.q) ?? toNullableString(fallbackQuery?.q),
    field: normalizeWorkspacesField(record.field ?? fallbackQuery?.field),
    match: normalizeServiceMatchMode(record.match ?? fallbackQuery?.match),
    limit: toSearchLimit(record.limit, toSearchLimit(fallbackQuery?.limit, DEFAULT_SERVICE_SEARCH_LIMIT)),
    cursor: toNullableString(record.cursor) ?? toNullableString(fallbackQuery?.cursor),
    nextCursor: toNullableString(record.nextCursor),
    memberAccountId: toNullableString(record.memberAccountId) ?? toNullableString(fallbackQuery?.memberAccountId),
    total: toSearchTotal(record.total)
  };
};

export interface ServiceManagementBundle {
  workspaces: ServiceWorkspaceSummary[];
  workspacesSearch: ServiceWorkspacesSearchMeta;
  users: ServiceManagedAccountRecord[];
  usersSearch: ServiceUsersSearchMeta;
  guards: ServiceUsersGuards;
  apiKeys: ServiceApiKeyRecord[];
  settings: ServiceSettingsView;
  canEditConfig: boolean;
}

export interface CreateServiceApiKeyInput {
  name: string;
  expiresAt?: string;
}

export interface UpsertServiceSmtpInput {
  enabled?: boolean;
  host?: string;
  port?: number | null;
  secure?: boolean;
  username?: string;
  password?: string;
  fromEmail?: string;
  fromName?: string;
}

export interface UpsertServiceGithubInput {
  enabled?: boolean;
  clientId?: string;
  clientSecret?: string;
  callbackUrl?: string;
  scopes?: string;
}

export const searchServiceWorkspaces = async (
  query: ServiceWorkspacesSearchQuery | undefined,
  requestHeaders: Record<string, string>
): Promise<ServiceWorkspacesSearchResult> => {
  const queryString = buildServiceQueryString({
    q: query?.q,
    field: query?.field,
    match: query?.match,
    memberAccountId: query?.memberAccountId,
    limit: query?.limit,
    cursor: query?.cursor
  });
  const payload = await requestGatewayApi<ServiceWorkspacesResponse>(
    `/service/workspaces${queryString}`,
    {
      headers: requestHeaders,
      cache: 'no-store'
    },
    {
      codeMessages: SERVICE_ERROR_MESSAGES
    }
  );
  return {
    workspaces: Array.isArray(payload.workspaces)
      ? payload.workspaces
          .map((workspace) => normalizeServiceWorkspace(workspace))
          .filter((workspace): workspace is ServiceWorkspaceSummary => workspace !== null)
      : [],
    search: normalizeWorkspacesSearchMeta(payload.search, query)
  };
};

export const searchServiceUsers = async (
  query: ServiceUsersSearchQuery | undefined,
  requestHeaders: Record<string, string>
): Promise<ServiceUsersSearchResult> => {
  const queryString = buildServiceQueryString({
    q: query?.q,
    field: query?.field,
    match: query?.match,
    workspaceId: query?.workspaceId,
    limit: query?.limit,
    cursor: query?.cursor
  });
  const payload = await requestGatewayApi<ServiceUsersResponse>(
    `/service/users${queryString}`,
    {
      headers: requestHeaders,
      cache: 'no-store'
    },
    {
      codeMessages: SERVICE_ERROR_MESSAGES
    }
  );
  return {
    users: Array.isArray(payload.users)
      ? payload.users.map((user) => normalizeServiceUser(user)).filter((user): user is ServiceManagedAccountRecord => user !== null)
      : [],
    guards: {
      minimumSystemAdminCount: toGuardCount(payload.guards?.minimumSystemAdminCount, 1),
      currentSystemAdminCount: toGuardCount(payload.guards?.currentSystemAdminCount, 0)
    },
    search: normalizeUsersSearchMeta(payload.search, query)
  };
};

export const listServiceUserWorkspaces = async (
  accountId: string,
  requestHeaders: Record<string, string>
): Promise<ServiceUserWorkspaceLookup> => {
  const normalizedAccountId = accountId.trim();
  if (!normalizedAccountId) {
    return {
      account: null,
      workspaces: []
    };
  }
  const payload = await requestGatewayApi<ServiceUserWorkspacesResponse>(
    `/service/users/${encodeURIComponent(normalizedAccountId)}/workspaces`,
    {
      headers: requestHeaders,
      cache: 'no-store'
    },
    {
      codeMessages: SERVICE_ERROR_MESSAGES
    }
  );
  return {
    account: normalizeServiceUser(payload.account ?? null),
    workspaces: Array.isArray(payload.workspaces)
      ? payload.workspaces
          .map((workspace) => {
            const normalized = normalizeServiceWorkspace(workspace);
            if (!normalized) {
              return null;
            }
            const record = workspace as Record<string, unknown>;
            return {
              ...normalized,
              membership: normalizeServiceMembership(record.membership)
            } satisfies ServiceUserWorkspaceRecord;
          })
          .filter((workspace): workspace is ServiceUserWorkspaceRecord => workspace !== null)
      : []
  };
};

export const listServiceApiKeys = async (
  requestHeaders: Record<string, string>
): Promise<ServiceApiKeyRecord[]> => {
  const payload = await requestGatewayApi<ServiceApiKeysResponse>(
    '/service/api-keys',
    {
      headers: requestHeaders,
      cache: 'no-store'
    },
    {
      codeMessages: SERVICE_ERROR_MESSAGES
    }
  );
  return Array.isArray(payload.apiKeys)
    ? payload.apiKeys.map((apiKey) => normalizeServiceApiKey(apiKey)).filter((apiKey): apiKey is ServiceApiKeyRecord => apiKey !== null)
    : [];
};

export const createServiceApiKey = async (
  input: CreateServiceApiKeyInput,
  requestHeaders: Record<string, string>
): Promise<{ apiKey: ServiceApiKeyRecord; secret: string }> => {
  const payload = await requestGatewayApi<ServiceApiKeyCreateResponse>(
    '/service/api-keys',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...requestHeaders
      },
      body: JSON.stringify({
        name: input.name,
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {})
      })
    },
    {
      codeMessages: SERVICE_ERROR_MESSAGES
    }
  );
  return {
    apiKey: payload.apiKey,
    secret: payload.secret
  };
};

export const revokeServiceApiKey = async (
  keyId: string,
  requestHeaders: Record<string, string>
): Promise<ServiceApiKeyRecord[]> => {
  const payload = await requestGatewayApi<ServiceApiKeysResponse>(
    '/service/api-keys',
    {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json',
        ...requestHeaders
      },
      body: JSON.stringify({ keyId })
    },
    {
      codeMessages: SERVICE_ERROR_MESSAGES
    }
  );
  return Array.isArray(payload.apiKeys)
    ? payload.apiKeys.map((apiKey) => normalizeServiceApiKey(apiKey)).filter((apiKey): apiKey is ServiceApiKeyRecord => apiKey !== null)
    : [];
};

export const loadServiceManagementBundle = async (
  requestHeaders: Record<string, string>
): Promise<ServiceManagementBundle> => {
  const [workspacesResult, usersResult, apiKeys, configPayload] = await Promise.all([
    searchServiceWorkspaces(undefined, requestHeaders),
    searchServiceUsers(undefined, requestHeaders),
    listServiceApiKeys(requestHeaders),
    requestGatewayApi<ServiceConfigResponse>(
      '/service/config',
      {
        headers: requestHeaders,
        cache: 'no-store'
      },
      {
        codeMessages: SERVICE_ERROR_MESSAGES
      }
    )
  ]);

  return {
    workspaces: workspacesResult.workspaces,
    workspacesSearch: workspacesResult.search,
    users: usersResult.users,
    usersSearch: usersResult.search,
    guards: usersResult.guards,
    apiKeys,
    settings: configPayload.settings,
    canEditConfig: configPayload.permissions?.canEdit === true
  };
};

export const setServiceUserRoles = async (
  accountId: string,
  systemRoles: string[],
  requestHeaders: Record<string, string>
): Promise<ServiceManagedAccountRecord> => {
  const payload = await requestGatewayApi<ServiceSetUserRolesResponse>(
    `/service/users/${encodeURIComponent(accountId)}/system-roles`,
    {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        ...requestHeaders
      },
      body: JSON.stringify({ systemRoles })
    },
    {
      codeMessages: SERVICE_ERROR_MESSAGES
    }
  );
  return payload.user;
};

export const upsertServiceSmtpSettings = async (
  input: UpsertServiceSmtpInput,
  requestHeaders: Record<string, string>
): Promise<ServiceSettingsView> => {
  const payload = await requestGatewayApi<ServiceConfigMutationResponse>(
    '/service/config/smtp',
    {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        ...requestHeaders
      },
      body: JSON.stringify(input)
    },
    {
      codeMessages: SERVICE_ERROR_MESSAGES
    }
  );
  return payload.settings;
};

export const upsertServiceGithubAuthSettings = async (
  input: UpsertServiceGithubInput,
  requestHeaders: Record<string, string>
): Promise<ServiceSettingsView> => {
  const payload = await requestGatewayApi<ServiceConfigMutationResponse>(
    '/service/config/github',
    {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        ...requestHeaders
      },
      body: JSON.stringify(input)
    },
    {
      codeMessages: SERVICE_ERROR_MESSAGES
    }
  );
  return payload.settings;
};
