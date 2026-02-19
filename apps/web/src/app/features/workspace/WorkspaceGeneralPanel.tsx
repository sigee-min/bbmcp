import type { WorkspaceSummary } from '../../../lib/dashboardModel';
import styles from '../../page.module.css';

interface WorkspaceGeneralPanelProps {
  workspace: WorkspaceSummary;
  busy: boolean;
  modeMutationBusy: boolean;
  onChangeMode: (mode: 'all_open' | 'rbac') => void;
}

export function WorkspaceGeneralPanel({ workspace, busy, modeMutationBusy, onChangeMode }: WorkspaceGeneralPanelProps) {
  const disabled = busy || modeMutationBusy || !workspace.capabilities.canManageWorkspace;
  return (
    <section className={styles.workspacePanelSection}>
      <div className={styles.workspacePanelGroup}>
        <p className={styles.workspacePanelLabel}>워크스페이스 이름</p>
        <p className={styles.workspacePanelValue}>{workspace.name}</p>
      </div>
      <div className={styles.workspacePanelGroup}>
        <p className={styles.workspacePanelLabel}>권한 모드</p>
        <div className={styles.workspaceModeOptions}>
          <label className={styles.workspaceModeOption}>
            <input
              type="radio"
              name="workspace-mode"
              checked={workspace.mode === 'all_open'}
              onChange={() => onChangeMode('all_open')}
              disabled={disabled}
            />
            <span>all_open</span>
          </label>
          <label className={styles.workspaceModeOption}>
            <input
              type="radio"
              name="workspace-mode"
              checked={workspace.mode === 'rbac'}
              onChange={() => onChangeMode('rbac')}
              disabled={disabled}
            />
            <span>rbac</span>
          </label>
        </div>
      </div>
      {!workspace.capabilities.canManageWorkspace ? (
        <p className={styles.workspacePanelHint}>모드 변경 권한이 없습니다.</p>
      ) : null}
    </section>
  );
}
