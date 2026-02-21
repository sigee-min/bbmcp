import type {
  DashboardErrorCode,
  UiErrorChannel,
  UiErrorContract,
  UiErrorKind,
  UiErrorSeverity
} from '../../../lib/dashboardModel';

export type CommonUiErrorCode =
  | DashboardErrorCode
  | 'gateway_unavailable'
  | 'forbidden_service_management'
  | 'forbidden_system_admin_required'
  | 'service_user_not_found'
  | 'system_admin_last_guard'
  | 'workspace_member_bootstrap_admin_immutable'
  | 'workspace_member_last_admin_guard'
  | 'workspace_member_self_remove_forbidden'
  | 'workspace_member_minimum_guard'
  | 'workspace_acl_admin_rule_immutable'
  | 'workspace_role_name_conflict'
  | 'workspace_api_key_not_found'
  | 'workspace_api_key_limit_exceeded'
  | 'invalid_payload'
  | 'request_failed';

const createContract = <TCode extends CommonUiErrorCode>(input: {
  code: TCode;
  kind: UiErrorKind;
  channel: UiErrorChannel;
  severity: UiErrorSeverity;
  fallback: string;
  dedupeKey?: string;
}): UiErrorContract<TCode> => ({
  code: input.code,
  kind: input.kind,
  channel: input.channel,
  severity: input.severity,
  fallback: input.fallback,
  ...(typeof input.dedupeKey === 'string' && input.dedupeKey.trim().length > 0 ? { dedupeKey: input.dedupeKey } : {})
});

export const UI_ERROR_CHANNEL_PRIORITY: Record<UiErrorChannel, number> = {
  blocking: 3,
  panel: 2,
  inline: 1
};

export const COMMON_UI_ERROR_CATALOG: Record<CommonUiErrorCode, UiErrorContract<CommonUiErrorCode>> = {
  project_load_failed: createContract({
    code: 'project_load_failed',
    kind: 'server',
    channel: 'panel',
    severity: 'error',
    fallback: '프로젝트를 불러오지 못했습니다.',
    dedupeKey: 'project_load_failed'
  }),
  stream_unavailable: createContract({
    code: 'stream_unavailable',
    kind: 'network',
    channel: 'panel',
    severity: 'warning',
    fallback: '연결이 일시적으로 끊겼습니다. 자동으로 다시 연결하는 중입니다.',
    dedupeKey: 'stream_unavailable'
  }),
  gateway_unavailable: createContract({
    code: 'gateway_unavailable',
    kind: 'network',
    channel: 'blocking',
    severity: 'error',
    fallback: '백엔드 연결이 필요합니다. gateway 서버를 실행한 뒤 다시 시도해 주세요.',
    dedupeKey: 'gateway_unavailable'
  }),
  forbidden_service_management: createContract({
    code: 'forbidden_service_management',
    kind: 'permission',
    channel: 'panel',
    severity: 'error',
    fallback: '서비스 관리 접근 권한이 없습니다.'
  }),
  forbidden_system_admin_required: createContract({
    code: 'forbidden_system_admin_required',
    kind: 'permission',
    channel: 'panel',
    severity: 'error',
    fallback: '해당 작업은 시스템 어드민 권한이 필요합니다.'
  }),
  service_user_not_found: createContract({
    code: 'service_user_not_found',
    kind: 'not_found',
    channel: 'panel',
    severity: 'error',
    fallback: '대상 사용자 계정을 찾을 수 없습니다.'
  }),
  system_admin_last_guard: createContract({
    code: 'system_admin_last_guard',
    kind: 'conflict',
    channel: 'panel',
    severity: 'error',
    fallback: '시스템 어드민은 최소 1명 이상 존재해야 합니다.'
  }),
  workspace_member_bootstrap_admin_immutable: createContract({
    code: 'workspace_member_bootstrap_admin_immutable',
    kind: 'conflict',
    channel: 'panel',
    severity: 'error',
    fallback: '초기 admin 계정의 역할은 수정할 수 없습니다.'
  }),
  workspace_member_last_admin_guard: createContract({
    code: 'workspace_member_last_admin_guard',
    kind: 'conflict',
    channel: 'panel',
    severity: 'error',
    fallback: '워크스페이스에는 최소 1명 이상의 어드민이 필요합니다.'
  }),
  workspace_member_self_remove_forbidden: createContract({
    code: 'workspace_member_self_remove_forbidden',
    kind: 'permission',
    channel: 'panel',
    severity: 'error',
    fallback: '본인 계정은 워크스페이스 멤버에서 제거할 수 없습니다.'
  }),
  workspace_member_minimum_guard: createContract({
    code: 'workspace_member_minimum_guard',
    kind: 'conflict',
    channel: 'panel',
    severity: 'error',
    fallback: '멤버 제거 후 남은 인원이 1명 이하가 되면 삭제할 수 없습니다.'
  }),
  workspace_acl_admin_rule_immutable: createContract({
    code: 'workspace_acl_admin_rule_immutable',
    kind: 'conflict',
    channel: 'panel',
    severity: 'error',
    fallback: '워크스페이스 어드민 고정 ACL 규칙은 삭제할 수 없습니다.'
  }),
  workspace_role_name_conflict: createContract({
    code: 'workspace_role_name_conflict',
    kind: 'conflict',
    channel: 'inline',
    severity: 'error',
    fallback: '같은 이름의 역할이 이미 존재합니다.'
  }),
  workspace_api_key_not_found: createContract({
    code: 'workspace_api_key_not_found',
    kind: 'not_found',
    channel: 'panel',
    severity: 'error',
    fallback: '요청한 API 키를 찾을 수 없습니다.'
  }),
  workspace_api_key_limit_exceeded: createContract({
    code: 'workspace_api_key_limit_exceeded',
    kind: 'conflict',
    channel: 'inline',
    severity: 'error',
    fallback: '활성 API 키는 계정당 최대 10개까지 발급할 수 있습니다.'
  }),
  invalid_payload: createContract({
    code: 'invalid_payload',
    kind: 'validation',
    channel: 'inline',
    severity: 'error',
    fallback: '요청 형식이 올바르지 않습니다.'
  }),
  request_failed: createContract({
    code: 'request_failed',
    kind: 'unknown',
    channel: 'panel',
    severity: 'error',
    fallback: '요청을 처리하지 못했습니다.'
  })
};

export const resolveUiErrorContract = (
  code: string | null | undefined,
  fallback?: string
): UiErrorContract<CommonUiErrorCode> => {
  const normalized = typeof code === 'string' ? code.trim() : '';
  const matched = normalized.length > 0 ? COMMON_UI_ERROR_CATALOG[normalized as CommonUiErrorCode] : undefined;
  if (matched) {
    return matched;
  }
  const base = COMMON_UI_ERROR_CATALOG.request_failed;
  return {
    ...base,
    ...(typeof fallback === 'string' && fallback.trim().length > 0 ? { fallback: fallback.trim() } : {})
  };
};

export const resolveUiErrorMessage = (
  code: string | null | undefined,
  fallback?: string
): string => resolveUiErrorContract(code, fallback).fallback;
