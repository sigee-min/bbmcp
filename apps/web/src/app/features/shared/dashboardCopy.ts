import type { DashboardErrorCode, StreamStatus } from '../../../lib/dashboardModel';
import { resolveUiErrorMessage } from './uiErrorContract';

export const streamLabel: Record<StreamStatus, string> = {
  idle: '대기 중',
  connecting: '연결 중',
  open: '연결됨',
  reconnecting: '재연결 중'
};

export const errorCopy: Record<DashboardErrorCode, string> = {
  project_load_failed: resolveUiErrorMessage('project_load_failed'),
  stream_unavailable: resolveUiErrorMessage('stream_unavailable')
};
