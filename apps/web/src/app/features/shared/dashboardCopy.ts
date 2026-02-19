import type { DashboardErrorCode, StreamStatus } from '../../../lib/dashboardModel';

export const streamLabel: Record<StreamStatus, string> = {
  idle: '대기 중',
  connecting: '연결 중',
  open: '연결됨',
  reconnecting: '재연결 중'
};

export const errorCopy: Record<DashboardErrorCode, string> = {
  project_load_failed: '프로젝트를 불러오지 못했습니다.',
  stream_unavailable: '연결이 일시적으로 끊겼습니다. 자동으로 다시 연결하는 중입니다.'
};
