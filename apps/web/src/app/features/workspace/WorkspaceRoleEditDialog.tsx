import { Check, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { cn } from '../../../lib/utils';
import styles from '../../page.module.css';

interface WorkspaceRoleEditDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  initialName: string;
  busy: boolean;
  canManageRoles: boolean;
  onClose: () => void;
  onSave: (input: { name: string }) => Promise<void>;
}

export function WorkspaceRoleEditDialog({
  open,
  mode,
  initialName,
  busy,
  canManageRoles,
  onClose,
  onSave
}: WorkspaceRoleEditDialogProps) {
  const [draftRoleName, setDraftRoleName] = useState('');

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraftRoleName(initialName);
  }, [initialName, open]);

  const disabled = busy || !canManageRoles;
  const canSave = useMemo(() => !disabled && draftRoleName.trim().length > 0, [disabled, draftRoleName]);
  const title = mode === 'edit' ? '역할 수정' : '역할 생성';

  if (!open) {
    return null;
  }

  return (
    <div
      className={styles.workspaceAclEditOverlay}
      role="presentation"
      onClick={() => {
        if (!busy) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={styles.workspaceAclEditDialog}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.workspaceAclEditHeader}>
          <div className={styles.workspaceAclEditTitleWrap}>
            <h3 className={styles.workspaceAclEditTitle}>{title}</h3>
            <p className={styles.workspaceAclEditSubtitle}>역할 이름을 입력하고 저장하세요.</p>
          </div>
          <button
            type="button"
            className={styles.workspaceAclEditCloseButton}
            onClick={onClose}
            aria-label={`${title} 닫기`}
            disabled={busy}
          >
            <X className={styles.workspaceIcon} aria-hidden />
          </button>
        </header>

        <form
          className={styles.workspaceAclEditForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSave) {
              return;
            }
            void onSave({ name: draftRoleName.trim() });
          }}
        >
          <div className={styles.workspaceAclEditBody}>
            <input
              type="text"
              className={styles.workspaceInput}
              placeholder="role name"
              value={draftRoleName}
              disabled={disabled}
              onChange={(event) => setDraftRoleName(event.target.value)}
              aria-label={mode === 'edit' ? '역할 수정 이름 입력' : '역할 생성 이름 입력'}
            />
          </div>

          <footer className={styles.workspaceAclEditFooter}>
            <button
              type="button"
              className={cn(styles.workspaceGhostButton, styles.workspaceIconButton)}
              onClick={onClose}
              disabled={busy}
              aria-label={`${title} 취소`}
            >
              <X className={styles.workspaceIcon} aria-hidden />
            </button>
            <button
              type="submit"
              className={cn(styles.workspacePrimaryButton, styles.workspaceIconButton)}
              disabled={!canSave}
              aria-label={mode === 'edit' ? '역할 수정 저장' : '역할 생성 저장'}
            >
              <Check className={styles.workspaceIcon} aria-hidden />
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
