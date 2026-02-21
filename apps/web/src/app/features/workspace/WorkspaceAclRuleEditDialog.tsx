import { Check, Shield, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { WorkspaceAclEffect, WorkspaceAclRuleRecord } from '../../../lib/dashboardModel';
import { cn } from '../../../lib/utils';
import styles from '../../page.module.css';
import type { WorkspaceFolderOption, WorkspaceRoleOption } from './workspaceOptionMappers';
import { WorkspaceDialogListItem, WorkspaceDialogListShell } from './WorkspaceDialogList';

const EFFECT_OPTIONS: readonly WorkspaceAclEffect[] = ['inherit', 'allow', 'deny'] as const;
const ROOT_FOLDER_VALUE = '__root__';

interface WorkspaceAclRuleEditDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  rule: WorkspaceAclRuleRecord | null;
  busy: boolean;
  canManageFolderAcl: boolean;
  roles: readonly WorkspaceRoleOption[];
  folderOptions: readonly WorkspaceFolderOption[];
  onClose: () => void;
  onSave: (input: {
    ruleId?: string;
    roleIds: string[];
    folderId: string | null;
    read: WorkspaceAclEffect;
    write: WorkspaceAclEffect;
  }) => Promise<void>;
}

export function WorkspaceAclRuleEditDialog({
  open,
  mode,
  rule,
  busy,
  canManageFolderAcl,
  roles,
  folderOptions,
  onClose,
  onSave
}: WorkspaceAclRuleEditDialogProps) {
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [folderValue, setFolderValue] = useState(ROOT_FOLDER_VALUE);
  const [readEffect, setReadEffect] = useState<WorkspaceAclEffect>('inherit');
  const [writeEffect, setWriteEffect] = useState<WorkspaceAclEffect>('inherit');

  useEffect(() => {
    if (!open) {
      return;
    }
    if (mode === 'edit' && rule) {
      setSelectedRoleIds(Array.from(new Set(rule.roleIds)));
      setFolderValue(rule.folderId ?? ROOT_FOLDER_VALUE);
      setReadEffect(rule.read);
      setWriteEffect(rule.write);
      return;
    }
    setSelectedRoleIds([]);
    setFolderValue(ROOT_FOLDER_VALUE);
    setReadEffect('inherit');
    setWriteEffect('inherit');
  }, [mode, open, rule]);

  const hasRoleOptions = roles.length > 0;
  const disabled = busy || !canManageFolderAcl || (mode === 'edit' && rule?.locked === true);
  const canSave = !disabled && hasRoleOptions && selectedRoleIds.length > 0 && (mode === 'create' || Boolean(rule));
  const folderMap = useMemo(
    () => new Map(folderOptions.map((folder) => [folder.folderId ?? ROOT_FOLDER_VALUE, folder.label])),
    [folderOptions]
  );
  const title = mode === 'edit' ? 'ACL 규칙 수정' : 'ACL 규칙 추가';

  const toggleRole = (roleId: string, checked: boolean) => {
    setSelectedRoleIds((prev) => {
      if (checked) {
        if (prev.includes(roleId)) {
          return prev;
        }
        return [...prev, roleId];
      }
      return prev.filter((value) => value !== roleId);
    });
  };

  const targetLabel = useMemo(() => {
    if (!rule || mode === 'create') {
      return '새 ACL 규칙';
    }
    return folderMap.get(rule.folderId ?? ROOT_FOLDER_VALUE) ?? '루트 (모든 폴더)';
  }, [folderMap, mode, rule]);

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
            <p className={styles.workspaceAclEditSubtitle}>{targetLabel}</p>
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
            const normalizedRoleIds = Array.from(
              new Set(selectedRoleIds.map((roleId) => roleId.trim()).filter((roleId) => roleId.length > 0))
            );
            if (normalizedRoleIds.length === 0) {
              return;
            }
            const selectedFolderId = folderValue === ROOT_FOLDER_VALUE ? null : folderValue;
            void onSave({
              ...(mode === 'edit' && rule ? { ruleId: rule.ruleId } : {}),
              roleIds: normalizedRoleIds,
              folderId: selectedFolderId,
              read: readEffect,
              write: writeEffect
            });
          }}
        >
          <div className={styles.workspaceAclEditBody}>
            <div className={styles.workspaceAclEditInputRow}>
              <select
                className={styles.workspaceInput}
                value={readEffect}
                onChange={(event) => setReadEffect(event.target.value as WorkspaceAclEffect)}
                disabled={disabled}
                aria-label={mode === 'edit' ? 'ACL 수정 read 효과 선택' : 'ACL 추가 read 효과 선택'}
              >
                {EFFECT_OPTIONS.map((effect) => (
                  <option key={`${mode}-read:${effect}`} value={effect}>
                    read: {effect}
                  </option>
                ))}
              </select>
              <select
                className={styles.workspaceInput}
                value={writeEffect}
                onChange={(event) => setWriteEffect(event.target.value as WorkspaceAclEffect)}
                disabled={disabled}
                aria-label={mode === 'edit' ? 'ACL 수정 write 효과 선택' : 'ACL 추가 write 효과 선택'}
              >
                {EFFECT_OPTIONS.map((effect) => (
                  <option key={`${mode}-write:${effect}`} value={effect}>
                    write: {effect}
                  </option>
                ))}
              </select>
            </div>

            <select
              className={styles.workspaceInput}
              value={folderValue}
              onChange={(event) => setFolderValue(event.target.value)}
              disabled={disabled}
              aria-label={mode === 'edit' ? 'ACL 수정 대상 폴더 선택' : 'ACL 추가 대상 폴더 선택'}
            >
              {folderOptions.map((folder) => (
                <option key={folder.folderId ?? ROOT_FOLDER_VALUE} value={folder.folderId ?? ROOT_FOLDER_VALUE}>
                  {folder.label}
                </option>
              ))}
            </select>

            <WorkspaceDialogListShell
              title="역할 선택"
              meta={`선택 ${selectedRoleIds.length} / 전체 ${roles.length}`}
              icon={<Shield aria-hidden />}
            >
              {hasRoleOptions ? (
                <div className={styles.workspaceAclEditRoleList} role="group" aria-label={mode === 'edit' ? 'ACL 수정 역할 선택' : 'ACL 추가 역할 선택'}>
                  {roles.map((role) => {
                    const checked = selectedRoleIds.includes(role.roleId);
                    return (
                      <WorkspaceDialogListItem
                        key={role.roleId}
                        className={checked ? styles.workspaceAclEditRoleRowSelected : undefined}
                        main={
                          <>
                            <p className={styles.workspaceListItemTitle}>{role.label}</p>
                            {role.builtin === 'workspace_admin' ? (
                              <div className={styles.workspaceTagRow}>
                                <span className={styles.workspaceTag}>어드민 고정</span>
                              </div>
                            ) : null}
                          </>
                        }
                        actions={
                          <label className={styles.workspaceAclEditRoleToggle}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={(event) => toggleRole(role.roleId, event.target.checked)}
                            />
                            <span>{checked ? '선택됨' : '선택'}</span>
                          </label>
                        }
                      />
                    );
                  })}
                </div>
              ) : (
                <div className={styles.workspaceListEmpty}>
                  <p className={styles.workspacePanelHint}>먼저 역할을 생성한 뒤 ACL을 수정할 수 있습니다.</p>
                </div>
              )}
            </WorkspaceDialogListShell>
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
              aria-label={`${title} 저장`}
            >
              <Check className={styles.workspaceIcon} aria-hidden />
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
