import { AlertCircle } from 'lucide-react';
import type { UiErrorChannel } from '../../../lib/dashboardModel';
import { cn } from '../../../lib/utils';
import styles from './ErrorNotice.module.css';

type ErrorNoticeSize = 'sm' | 'md';

interface ErrorNoticeProps {
  message: string | null | undefined;
  channel?: UiErrorChannel;
  size?: ErrorNoticeSize;
  className?: string;
  role?: 'alert' | 'status';
}

const CHANNEL_CLASS_MAP: Record<UiErrorChannel, string> = {
  blocking: styles.channelBlocking,
  panel: '',
  inline: styles.channelInline
};

const SIZE_CLASS_MAP: Record<ErrorNoticeSize, string> = {
  sm: styles.sizeSm,
  md: styles.sizeMd
};

export function ErrorNotice({
  message,
  channel = 'panel',
  size = 'md',
  className,
  role = 'alert'
}: ErrorNoticeProps) {
  const normalized = typeof message === 'string' ? message.trim() : '';
  if (!normalized) {
    return null;
  }

  return (
    <div
      role={role}
      className={cn(styles.notice, SIZE_CLASS_MAP[size], CHANNEL_CLASS_MAP[channel], className)}
      data-ui-error-channel={channel}
    >
      <AlertCircle className={styles.icon} aria-hidden />
      <p className={styles.message}>{normalized}</p>
    </div>
  );
}
