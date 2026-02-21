import type { ReactNode } from 'react';
import { cn } from '../../../lib/utils';
import styles from '../../page.module.css';

interface WorkspaceDialogListShellProps {
  title: string;
  meta: string;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}

interface WorkspaceDialogListItemProps {
  main: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function WorkspaceDialogListShell({ title, meta, icon, action, children }: WorkspaceDialogListShellProps) {
  return (
    <div className={styles.workspaceListShell}>
      <div className={styles.workspaceListShellHeader}>
        <div className={styles.workspaceListShellHeaderInfo}>
          <span className={styles.workspaceListShellHeaderIcon}>{icon}</span>
          <div className={styles.workspaceListShellHeaderTitleWrap}>
            <p className={styles.workspaceListShellHeaderTitle}>{title}</p>
            <p className={styles.workspaceListShellHeaderMeta}>{meta}</p>
          </div>
        </div>
        {action ? <div className={styles.workspaceListShellHeaderAction}>{action}</div> : null}
      </div>

      <div className={styles.workspaceListBody}>
        <div className={styles.workspaceList}>{children}</div>
      </div>
    </div>
  );
}

export function WorkspaceDialogListItem({ main, actions, className }: WorkspaceDialogListItemProps) {
  return (
    <article
      className={cn(styles.workspaceListItem, styles.dashboardListRow, className)}
      data-dashboard-list-row="true"
      data-dashboard-list-context="workspace-dialog"
    >
      <div className={cn(styles.workspaceListItemMain, styles.dashboardListRowMain)}>{main}</div>
      {actions ? <div className={cn(styles.workspaceListItemActions, styles.dashboardListRowActions)}>{actions}</div> : null}
    </article>
  );
}
