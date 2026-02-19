import { useState } from 'react';

import type { WorkspaceAclEffect, WorkspaceFolderAclRecord, WorkspaceRoleRecord } from '../../../lib/dashboardModel';
import { cn } from '../../../lib/utils';
import styles from '../../page.module.css';

const EFFECT_OPTIONS: readonly WorkspaceAclEffect[] = ['inherit', 'allow', 'deny'] as const;

interface WorkspaceFolderAclPanelProps {
  folderAcl: readonly WorkspaceFolderAclRecord[];
  roles: readonly WorkspaceRoleRecord[];
  busy: boolean;
  allOpenMode: boolean;
  canManageFolderAcl: boolean;
  onUpsertFolderAcl: (input: {
    roleId: string;
    folderId: string | null;
    read: WorkspaceAclEffect;
    write: WorkspaceAclEffect;
  }) => Promise<void>;
  onDeleteFolderAcl: (roleId: string, folderId: string | null) => Promise<void>;
}

export function WorkspaceFolderAclPanel({
  folderAcl,
  roles,
  busy,
  allOpenMode,
  canManageFolderAcl,
  onUpsertFolderAcl,
  onDeleteFolderAcl
}: WorkspaceFolderAclPanelProps) {
  const [roleId, setRoleId] = useState('');
  const [folderId, setFolderId] = useState('');
  const [readEffect, setReadEffect] = useState<WorkspaceAclEffect>('inherit');
  const [writeEffect, setWriteEffect] = useState<WorkspaceAclEffect>('inherit');

  const disabled = busy || allOpenMode || !canManageFolderAcl;

  return (
    <section className={styles.workspacePanelSection}>
      {allOpenMode ? <p className={styles.workspacePanelHint}>all_open 모드에서는 폴더 ACL을 수정할 수 없습니다.</p> : null}
      {!allOpenMode && !canManageFolderAcl ? <p className={styles.workspacePanelHint}>폴더 ACL 관리 권한이 없습니다.</p> : null}

      <form
        className={styles.workspaceInlineForm}
        onSubmit={(event) => {
          event.preventDefault();
          const normalizedRoleId = roleId.trim();
          if (!normalizedRoleId || disabled) {
            return;
          }
          const normalizedFolderId = folderId.trim();
          void onUpsertFolderAcl({
            roleId: normalizedRoleId,
            folderId: normalizedFolderId ? normalizedFolderId : null,
            read: readEffect,
            write: writeEffect
          }).then(() => {
            setFolderId('');
            setReadEffect('inherit');
            setWriteEffect('inherit');
          });
        }}
      >
        <div className={styles.workspaceInputRow}>
          <select
            className={styles.workspaceInput}
            value={roleId}
            onChange={(event) => setRoleId(event.target.value)}
            disabled={disabled}
          >
            <option value="">역할 선택</option>
            {roles.map((role) => (
              <option key={role.roleId} value={role.roleId}>
                {role.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            className={styles.workspaceInput}
            value={folderId}
            onChange={(event) => setFolderId(event.target.value)}
            disabled={disabled}
            placeholder="folder id (비우면 root)"
          />
        </div>
        <div className={styles.workspaceInputRow}>
          <select
            className={styles.workspaceInput}
            value={readEffect}
            onChange={(event) => setReadEffect(event.target.value as WorkspaceAclEffect)}
            disabled={disabled}
          >
            {EFFECT_OPTIONS.map((effect) => (
              <option key={`read:${effect}`} value={effect}>
                read: {effect}
              </option>
            ))}
          </select>
          <select
            className={styles.workspaceInput}
            value={writeEffect}
            onChange={(event) => setWriteEffect(event.target.value as WorkspaceAclEffect)}
            disabled={disabled}
          >
            {EFFECT_OPTIONS.map((effect) => (
              <option key={`write:${effect}`} value={effect}>
                write: {effect}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={styles.workspacePrimaryButton} disabled={disabled || !roleId.trim()}>
          ACL 저장
        </button>
      </form>

      <div className={styles.workspaceList}>
        {folderAcl.length > 0 ? (
          folderAcl.map((entry) => (
            <article key={`${entry.roleId}:${entry.folderId ?? '__root__'}`} className={styles.workspaceListItem}>
              <div className={styles.workspaceListItemMain}>
                <p className={styles.workspaceListItemTitle}>{entry.folderId ?? 'root'}</p>
                <div className={styles.workspaceTagRow}>
                  <span className={styles.workspaceTag}>{entry.roleId}</span>
                  <span className={styles.workspaceTag}>read:{entry.read}</span>
                  <span className={styles.workspaceTag}>write:{entry.write}</span>
                </div>
              </div>
              <div className={styles.workspaceListItemActions}>
                <button
                  type="button"
                  className={cn(styles.workspaceGhostButton, styles.workspaceDangerButton)}
                  disabled={disabled}
                  onClick={() => {
                    void onDeleteFolderAcl(entry.roleId, entry.folderId);
                  }}
                >
                  삭제
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className={styles.workspacePanelHint}>등록된 폴더 ACL이 없습니다.</p>
        )}
      </div>
    </section>
  );
}
