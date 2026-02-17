import type { DashboardErrorCode, StreamStatus, ViewerState } from '../../lib/dashboardModel';
import { DashboardViewport } from './DashboardViewport';
import styles from './DashboardCenterPanel.module.css';

interface DashboardCenterPanelProps {
  selectedProjectName: string | null;
  streamStatus: StreamStatus;
  errorCode: DashboardErrorCode | null;
  viewer: ViewerState;
  hasGeometry: boolean;
  onRotate: (deltaX: number, deltaY: number) => void;
}

const streamStatusLabelMap: Record<StreamStatus, string> = {
  idle: '대기 중',
  connecting: '연결 중',
  open: '연결됨',
  reconnecting: '재연결 중'
};

export const DashboardCenterPanel = ({
  selectedProjectName,
  streamStatus,
  errorCode,
  viewer,
  hasGeometry,
  onRotate
}: DashboardCenterPanelProps) => (
  <section className={styles.centerPanel}>
    <div className={styles.statusBar}>
      <span>{selectedProjectName ?? '선택된 프로젝트 없음'}</span>
      <span
        className={streamStatus === 'reconnecting' ? styles.streamStateWarning : styles.streamState}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        스트림 상태: {streamStatusLabelMap[streamStatus]}
      </span>
    </div>

    {errorCode !== null ? (
      <div className={styles.alert}>
        {errorCode === 'stream_unavailable'
          ? '연결이 일시적으로 끊겼습니다. 자동으로 다시 연결하는 중입니다.'
          : '프로젝트를 불러오는 중 오류가 발생했습니다. 마지막으로 불러온 목록을 표시합니다.'}
      </div>
    ) : null}

    <DashboardViewport viewer={viewer} hasGeometry={hasGeometry} onRotate={onRotate} />
  </section>
);
