import type { LucideIcon } from 'lucide-react';
import { FolderKanban, ShieldUser, SlidersHorizontal } from 'lucide-react';

export const SERVICE_MANAGEMENT_PANELS = [
  {
    id: 'workspaces',
    label: '워크스페이스',
    description: '전체 워크스페이스 운영 상태를 확인합니다.',
    icon: FolderKanban
  },
  {
    id: 'users',
    label: '유저',
    description: '시스템 어드민/CS 어드민 역할을 관리합니다.',
    icon: ShieldUser
  },
  {
    id: 'integrations',
    label: '시스템 설정',
    description: 'SMTP 및 GitHub 인증 연동을 설정합니다.',
    icon: SlidersHorizontal
  }
] as const;

export type ServiceManagementPanelId = (typeof SERVICE_MANAGEMENT_PANELS)[number]['id'];

export type ServiceManagementPanelModel = {
  id: ServiceManagementPanelId;
  label: string;
  description: string;
  icon: LucideIcon;
  meta: string;
  visible: boolean;
};

export type ServiceManagementPanelMetaById = Partial<Record<ServiceManagementPanelId, string>>;

export const buildServiceManagementPanelModels = (input: {
  panelMetaById?: ServiceManagementPanelMetaById;
}): ServiceManagementPanelModel[] => {
  const metaById = input.panelMetaById ?? {};
  return SERVICE_MANAGEMENT_PANELS.map((panel) => ({
    id: panel.id,
    label: panel.label,
    description: panel.description,
    icon: panel.icon,
    meta: metaById[panel.id] ?? panel.description,
    visible: true
  }));
};
