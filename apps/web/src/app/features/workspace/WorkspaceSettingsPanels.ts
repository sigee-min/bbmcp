import type { LucideIcon } from 'lucide-react';
import { Folder, KeyRound, Shield, SlidersHorizontal, Users } from 'lucide-react';

export const WORKSPACE_SETTINGS_PANELS = [
  {
    id: 'general',
    label: '일반',
    description: '현재 워크스페이스의 기본 정보와 정책을 확인합니다.',
    capability: 'workspace',
    icon: SlidersHorizontal
  },
  {
    id: 'members',
    label: '멤버',
    description: '멤버 권한과 역할 연결 상태를 관리합니다.',
    capability: 'members',
    icon: Users
  },
  {
    id: 'roles',
    label: '역할',
    description: '역할 자체(이름/멤버 연결 기준)를 관리합니다.',
    capability: 'roles',
    icon: Shield
  },
  {
    id: 'folderAcl',
    label: 'ACL 규칙',
    description: '폴더 권한 규칙을 역할 기준으로 관리합니다.',
    capability: 'folderAcl',
    icon: Folder
  },
  {
    id: 'apiKeys',
    label: 'API 키',
    description: '워크스페이스 통합용 API 키를 발급·폐기합니다.',
    capability: 'apiKeys',
    icon: KeyRound
  }
] as const;

export type WorkspaceSettingsPanelId = (typeof WORKSPACE_SETTINGS_PANELS)[number]['id'];

type WorkspaceCapabilityStatus = {
  canManageWorkspaceSettings: boolean;
  canManageApiKeys: boolean;
};

export type WorkspaceSettingsPanelModel = {
  id: WorkspaceSettingsPanelId;
  label: string;
  description: string;
  icon: LucideIcon;
  visible: boolean;
  meta: string;
};

export type WorkspaceSettingsPanelMetaById = Partial<Record<WorkspaceSettingsPanelId, string>>;

const resolvePanelVisible = (
  capability: (typeof WORKSPACE_SETTINGS_PANELS)[number]['capability'] | undefined,
  status: WorkspaceCapabilityStatus
): boolean => {
  if (!capability) {
    return true;
  }
  if (capability === 'apiKeys') {
    return true;
  }
  if (capability === 'workspace') {
    return status.canManageWorkspaceSettings;
  }
  if (capability === 'members' || capability === 'roles' || capability === 'folderAcl') {
    return status.canManageWorkspaceSettings;
  }
  return status.canManageApiKeys;
};

export const buildWorkspaceSettingsPanelModels = (
  status: WorkspaceCapabilityStatus,
  metaById: WorkspaceSettingsPanelMetaById = {}
): WorkspaceSettingsPanelModel[] =>
  WORKSPACE_SETTINGS_PANELS.map((panel) => ({
    id: panel.id,
    label: panel.label,
    description: panel.description,
    icon: panel.icon,
    visible: resolvePanelVisible(panel.capability, status),
    meta: metaById[panel.id] ?? panel.description
  }));
