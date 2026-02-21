import type {
  WorkspaceAclRuleRecord,
  WorkspaceApiKeyRecord,
  WorkspaceMemberCandidateRecord,
  WorkspaceMemberRecord,
  WorkspaceRoleRecord,
  WorkspaceSummary
} from '../../../lib/dashboardModel';
import { buildGatewayApiUrl } from '../../../lib/gatewayApi';
import { parseGatewayApiResponse, requestGatewayApi } from '../../../lib/gatewayApiClient';

interface WorkspaceSettingsResponse {
  ok: boolean;
  workspace: WorkspaceSummary;
  roles: WorkspaceRoleRecord[];
  members: WorkspaceMemberRecord[];
  aclRules: WorkspaceAclRuleRecord[];
  code?: string;
  message?: string;
}

interface WorkspaceMemberCandidatesResponse {
  ok: boolean;
  candidates: WorkspaceMemberCandidateRecord[];
  code?: string;
  message?: string;
}

interface WorkspaceApiKeyListResponse {
  ok: boolean;
  apiKeys: WorkspaceApiKeyRecord[];
  code?: string;
  message?: string;
}

interface WorkspaceApiKeyCreateResponse {
  ok: boolean;
  apiKey: WorkspaceApiKeyRecord;
  secret: string;
  code?: string;
  message?: string;
}

const WORKSPACE_ERROR_MESSAGES: Record<string, string> = {
  workspace_member_bootstrap_admin_immutable: '초기 admin 계정의 역할은 수정할 수 없습니다.',
  workspace_member_last_admin_guard: '워크스페이스에는 최소 1명 이상의 어드민이 필요합니다.',
  workspace_member_self_remove_forbidden: '본인 계정은 워크스페이스 멤버에서 제거할 수 없습니다.',
  workspace_member_minimum_guard: '멤버 제거 후 남은 인원이 1명 이하가 되면 삭제할 수 없습니다.',
  workspace_acl_admin_rule_immutable: '워크스페이스 어드민 고정 ACL 규칙은 삭제할 수 없습니다.',
  workspace_role_name_conflict: '같은 이름의 역할이 이미 존재합니다.',
  workspace_api_key_not_found: '요청한 API 키를 찾을 수 없습니다.',
  workspace_api_key_limit_exceeded: '활성 API 키는 계정당 최대 10개까지 발급할 수 있습니다.'
};

export interface WorkspaceSettingsBundle {
  workspace: WorkspaceSummary;
  roles: WorkspaceRoleRecord[];
  members: WorkspaceMemberRecord[];
  aclRules: WorkspaceAclRuleRecord[];
  memberCandidates: WorkspaceMemberCandidateRecord[];
}

export const loadWorkspaceSettingsBundle = async (
  workspaceId: string,
  requestHeaders: Record<string, string>
): Promise<WorkspaceSettingsBundle> => {
  const settingsPayload = await requestGatewayApi<WorkspaceSettingsResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/settings`,
    {
      headers: requestHeaders,
      cache: 'no-store'
    },
    {
      codeMessages: WORKSPACE_ERROR_MESSAGES
    }
  );

  let memberCandidates: WorkspaceMemberCandidateRecord[] = [];
  const candidatesResponse = await fetch(
    buildGatewayApiUrl(`/workspaces/${encodeURIComponent(workspaceId)}/member-candidates?limit=100`),
    {
      headers: requestHeaders,
      cache: 'no-store'
    }
  );
  if (candidatesResponse.ok) {
    const candidatesPayload = await parseGatewayApiResponse<WorkspaceMemberCandidatesResponse>(candidatesResponse, {
      requireAppOk: false,
      codeMessages: WORKSPACE_ERROR_MESSAGES
    });
    if (candidatesPayload.ok && Array.isArray(candidatesPayload.candidates)) {
      memberCandidates = candidatesPayload.candidates;
    }
  }

  return {
    workspace: settingsPayload.workspace,
    roles: settingsPayload.roles,
    members: settingsPayload.members,
    aclRules: Array.isArray(settingsPayload.aclRules) ? settingsPayload.aclRules : [],
    memberCandidates
  };
};

export const runWorkspaceMutation = async (request: () => Promise<Response>): Promise<void> => {
  const response = await request();
  await parseGatewayApiResponse(response, {
    codeMessages: WORKSPACE_ERROR_MESSAGES
  });
};

export const listWorkspaceApiKeys = async (
  workspaceId: string,
  requestHeaders: Record<string, string>
): Promise<WorkspaceApiKeyRecord[]> => {
  const payload = await requestGatewayApi<WorkspaceApiKeyListResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/api-keys`,
    {
      headers: requestHeaders,
      cache: 'no-store'
    },
    {
      codeMessages: WORKSPACE_ERROR_MESSAGES
    }
  );
  return Array.isArray(payload.apiKeys) ? payload.apiKeys : [];
};

export const createWorkspaceApiKey = async (
  workspaceId: string,
  requestHeaders: Record<string, string>,
  input: { name: string; expiresAt?: string }
): Promise<{ apiKey: WorkspaceApiKeyRecord; secret: string }> => {
  const payload = await requestGatewayApi<WorkspaceApiKeyCreateResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/api-keys`,
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
      codeMessages: WORKSPACE_ERROR_MESSAGES
    }
  );
  return {
    apiKey: payload.apiKey,
    secret: payload.secret
  };
};

export const revokeWorkspaceApiKey = async (
  workspaceId: string,
  requestHeaders: Record<string, string>,
  keyId: string
): Promise<WorkspaceApiKeyRecord[]> => {
  const payload = await requestGatewayApi<WorkspaceApiKeyListResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/api-keys`,
    {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json',
        ...requestHeaders
      },
      body: JSON.stringify({ keyId })
    },
    {
      codeMessages: WORKSPACE_ERROR_MESSAGES
    }
  );
  return Array.isArray(payload.apiKeys) ? payload.apiKeys : [];
};
