import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../../../lib/utils';
import styles from '../../page.module.css';
import { ErrorNotice } from './ErrorNotice';

interface ManagementDialogFrameProps {
  open: boolean;
  ariaLabel: string;
  title: string;
  subtitle?: string | null;
  nav: ReactNode;
  panel: ReactNode;
  errorMessage?: string | null;
  dialogClassName?: string;
  onClose: () => void;
}

export function ManagementDialogFrame({
  open,
  ariaLabel,
  title,
  subtitle,
  nav,
  panel,
  errorMessage = null,
  dialogClassName,
  onClose
}: ManagementDialogFrameProps) {
  if (!open) {
    return null;
  }

  return (
    <div className={styles.workspaceDialogOverlay} role="presentation" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={cn(styles.workspaceDialog, dialogClassName)}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.workspaceDialogHeader}>
          <div>
            <h2 className={styles.workspaceDialogTitle}>{title}</h2>
            {subtitle ? <p className={styles.workspaceDialogSubtitle}>{subtitle}</p> : null}
          </div>
          <button type="button" className={styles.workspaceDialogClose} onClick={onClose} aria-label="닫기">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className={styles.workspaceDialogContent}>
          {nav}
          <div className={styles.workspaceDialogPanel}>{panel}</div>
        </div>

        {errorMessage ? (
          <div className={styles.workspaceDialogErrorSlot}>
            <ErrorNotice message={errorMessage} channel="panel" size="sm" className={styles.workspaceDialogErrorNotice} />
          </div>
        ) : null}
      </section>
    </div>
  );
}
