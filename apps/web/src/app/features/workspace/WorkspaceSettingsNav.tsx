import { cn } from '../../../lib/utils';
import styles from '../../page.module.css';

export const WORKSPACE_SETTINGS_PANELS = [
  { id: 'general', label: '일반' },
  { id: 'members', label: '멤버' },
  { id: 'roles', label: '역할' },
  { id: 'folderAcl', label: '폴더 권한' }
] as const;

export type WorkspaceSettingsPanelId = (typeof WORKSPACE_SETTINGS_PANELS)[number]['id'];

interface WorkspaceSettingsNavProps {
  activePanel: WorkspaceSettingsPanelId;
  onSelectPanel: (panelId: WorkspaceSettingsPanelId) => void;
}

export function WorkspaceSettingsNav({ activePanel, onSelectPanel }: WorkspaceSettingsNavProps) {
  return (
    <nav className={styles.workspaceSettingsNav} aria-label="워크스페이스 설정 메뉴">
      {WORKSPACE_SETTINGS_PANELS.map((panel) => {
        const selected = panel.id === activePanel;
        return (
          <button
            key={panel.id}
            type="button"
            className={cn(styles.workspaceSettingsNavItem, selected && styles.workspaceSettingsNavItemActive)}
            onClick={() => onSelectPanel(panel.id)}
          >
            {panel.label}
          </button>
        );
      })}
    </nav>
  );
}
