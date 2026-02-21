import type { WorkspaceSummary } from '../../../lib/dashboardModel';
import styles from '../../page.module.css';
import { WorkspacePanelSection } from './WorkspacePanelSection';

interface WorkspaceGeneralPanelProps {
  workspace: WorkspaceSummary;
  busy: boolean;
}

export function WorkspaceGeneralPanel({ workspace, busy }: WorkspaceGeneralPanelProps) {
  return (
    <WorkspacePanelSection
      readContent={
        <>
          <div className={styles.workspacePanelCard}>
            <p className={styles.workspacePanelCardTitle}>워크스페이스 요약</p>
            <div className={styles.workspacePanelGroup}>
              <p className={styles.workspacePanelLabel}>워크스페이스 이름</p>
              <p className={styles.workspacePanelValue}>{workspace.name}</p>
            </div>
          </div>
          <div className={styles.workspacePanelCard}>
            <p className={styles.workspacePanelCardTitle}>프로젝트 모니터링</p>
            <p className={styles.workspacePanelHint}>메트릭 대시보드는 준비 중입니다.</p>
          </div>
        </>
      }
      inputContent={busy ? <p className={styles.workspacePanelHint}>설정을 갱신하는 중입니다.</p> : null}
    />
  );
}
