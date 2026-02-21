import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { ErrorNotice } from '../shared/ErrorNotice';
import styles from './WorkspaceCreateDialog.module.css';

export interface WorkspaceCreateInput {
  name: string;
}

interface WorkspaceCreateDialogProps {
  open: boolean;
  busy: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onCreate: (input: WorkspaceCreateInput) => Promise<void>;
}

const buildValidationError = (name: string): string | null => {
  if (name.trim().length === 0) {
    return '워크스페이스 이름을 입력해 주세요.';
  }
  return null;
};

export function WorkspaceCreateDialog({ open, busy, errorMessage, onClose, onCreate }: WorkspaceCreateDialogProps) {
  const [name, setName] = useState('새 워크스페이스');

  useEffect(() => {
    if (!open) {
      return;
    }
    setName('새 워크스페이스');
  }, [open]);

  const validationError = useMemo(() => buildValidationError(name), [name]);

  const submit = async () => {
    if (busy || validationError) {
      return;
    }
    await onCreate({
      name: name.trim()
    });
  };

  if (!open) {
    return null;
  }

  return (
    <div
      className={styles.overlay}
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
        aria-label="워크스페이스 생성"
        className={styles.dialog}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <h2 className={styles.title}>워크스페이스 생성</h2>
            <p className={styles.subtitle}>새 워크스페이스를 만들고 바로 이동합니다.</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="닫기" disabled={busy}>
            <X className="h-4 w-4" />
          </button>
        </header>

        <form
          className={styles.body}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className={styles.label} htmlFor="workspace-create-name">
            워크스페이스 이름
          </label>
          <input
            id="workspace-create-name"
            className={styles.input}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="예: Team Workspace"
            disabled={busy}
          />

          {validationError ? (
            <ErrorNotice message={validationError} channel="inline" size="sm" className={styles.errorNotice} />
          ) : null}
          {errorMessage ? <ErrorNotice message={errorMessage} channel="panel" size="sm" className={styles.errorNotice} /> : null}

          <footer className={styles.footer}>
            <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={busy}>
              취소
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={busy || Boolean(validationError)}
              onClick={() => {
                void submit();
              }}
            >
              생성
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
