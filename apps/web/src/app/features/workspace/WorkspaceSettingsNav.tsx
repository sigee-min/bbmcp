import { cn } from '../../../lib/utils';
import styles from '../../page.module.css';
import type { WorkspaceSettingsPanelId, WorkspaceSettingsPanelModel } from './WorkspaceSettingsPanels';

interface WorkspaceSettingsNavProps {
  panels: readonly WorkspaceSettingsPanelModel[];
  activePanel: WorkspaceSettingsPanelId;
  onSelectPanel: (panelId: WorkspaceSettingsPanelId) => void;
}

export function WorkspaceSettingsNav({ panels, activePanel, onSelectPanel }: WorkspaceSettingsNavProps) {
  return (
    <nav className={styles.workspaceSettingsNav} aria-label="워크스페이스 설정 메뉴">
      {panels.map((panel) => {
        const selected = panel.id === activePanel;
        const PanelIcon = panel.icon;
        return (
          <button
            key={panel.id}
            type="button"
            className={cn(
              styles.workspaceSettingsNavItem,
              selected && styles.workspaceSettingsNavItemActive
            )}
            onClick={() => onSelectPanel(panel.id)}
            aria-current={selected ? 'page' : undefined}
          >
            <span className={styles.workspaceSettingsNavItemHeader}>
              <PanelIcon className={styles.workspaceSettingsNavItemIcon} aria-hidden />
              <span className={styles.workspaceSettingsNavItemLabel}>{panel.label}</span>
            </span>
            <span className={styles.workspaceSettingsNavItemMeta}>{panel.meta}</span>
          </button>
        );
      })}
    </nav>
  );
}
