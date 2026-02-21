import { useMemo, useState } from 'react';
import { Folder, Pencil, Plus, Shield, Trash2 } from 'lucide-react';

import type { WorkspaceAclRuleRecord } from '../../../lib/dashboardModel';
import { cn } from '../../../lib/utils';
import styles from '../../page.module.css';
import { WorkspaceDialogListItem, WorkspaceDialogListShell } from './WorkspaceDialogList';
import type { WorkspaceFolderOption, WorkspaceRoleOption } from './workspaceOptionMappers';
import { WorkspaceAclRuleEditDialog } from './WorkspaceAclRuleEditDialog';
import { WorkspacePanelSection } from './WorkspacePanelSection';

const ROOT_FOLDER_VALUE = '__root__';

interface WorkspaceFolderAclPanelProps {
  aclRules: readonly WorkspaceAclRuleRecord[];
  roles: readonly WorkspaceRoleOption[];
  folderOptions: readonly WorkspaceFolderOption[];
  busy: boolean;
  canManageFolderAcl: boolean;
  onUpsertAclRule: (input: {
    ruleId?: string;
    roleIds: string[];
    folderId: string | null;
    read: 'allow' | 'deny' | 'inherit';
    write: 'allow' | 'deny' | 'inherit';
  }) => Promise<void>;
  onDeleteAclRule: (input: { ruleId: string }) => Promise<void>;
}

export function WorkspaceFolderAclPanel({
  aclRules,
  roles,
  folderOptions,
  busy,
  canManageFolderAcl,
  onUpsertAclRule,
  onDeleteAclRule
}: WorkspaceFolderAclPanelProps) {
  const [aclDialogOpen, setAclDialogOpen] = useState(false);
  const [aclDialogMode, setAclDialogMode] = useState<'create' | 'edit'>('create');
  const [editingRule, setEditingRule] = useState<WorkspaceAclRuleRecord | null>(null);

  const disabled = busy || !canManageFolderAcl;
  const roleMap = useMemo(() => new Map(roles.map((role) => [role.roleId, role])), [roles]);
  const folderMap = useMemo(
    () => new Map(folderOptions.map((folder) => [folder.folderId ?? ROOT_FOLDER_VALUE, folder.label])),
    [folderOptions]
  );
  const listMeta = busy
    ? `등록된 규칙 ${aclRules.length}개 · 요청 처리 중`
    : !canManageFolderAcl
      ? `등록된 규칙 ${aclRules.length}개 · 읽기 전용`
      : `등록된 규칙 ${aclRules.length}개`;

  const openCreateDialog = () => {
    setAclDialogMode('create');
    setEditingRule(null);
    setAclDialogOpen(true);
  };

  const openEditDialog = (rule: WorkspaceAclRuleRecord) => {
    setAclDialogMode('edit');
    setEditingRule(rule);
    setAclDialogOpen(true);
  };

  const closeDialog = () => {
    if (busy) {
      return;
    }
    setAclDialogOpen(false);
    setEditingRule(null);
  };

  return (
    <>
      <WorkspacePanelSection
        framed={false}
        readContent={
          <WorkspaceDialogListShell
            title="ACL 규칙"
            meta={listMeta}
            icon={<Folder aria-hidden />}
            action={
              canManageFolderAcl ? (
                <button
                  type="button"
                  className={cn(styles.workspaceGhostButton, styles.workspaceIconButton)}
                  aria-label="ACL 규칙 추가"
                  title="ACL 규칙 추가"
                  disabled={busy}
                  onClick={openCreateDialog}
                >
                  <Plus className={styles.workspaceIcon} aria-hidden />
                </button>
              ) : null
            }
          >
            {aclRules.length > 0 ? (
              aclRules.map((entry) => {
                const targetLabel = folderMap.get(entry.folderId ?? ROOT_FOLDER_VALUE) ?? '루트 (모든 폴더)';
                const deleteDisabled = disabled || Boolean(entry.locked);
                const editDisabled = disabled || Boolean(entry.locked);
                const roleLabels = entry.roleIds.map((roleId) => roleMap.get(roleId)?.label ?? roleId).join(', ');
                return (
                  <WorkspaceDialogListItem
                    key={entry.ruleId}
                    main={
                      <>
                        <div className={styles.workspaceAclTitleRow}>
                          <p className={styles.workspaceListItemTitle}>{targetLabel}</p>
                          {entry.locked ? (
                            <span className={styles.workspaceAclLockedBadge}>
                              <Shield className={styles.workspaceInlineIcon} aria-hidden />
                              고정
                            </span>
                          ) : null}
                        </div>
                        <div className={styles.workspaceTagRow}>
                          <span className={styles.workspaceTag}>read:{entry.read}</span>
                          <span className={styles.workspaceTag}>write:{entry.write}</span>
                        </div>
                        <div className={styles.workspaceAclRoleInfo}>
                          <p className={styles.workspaceAclRoleSummary}>적용 역할 {entry.roleIds.length}개</p>
                          <p className={styles.workspaceAclRoleList}>{roleLabels || '역할 없음'}</p>
                        </div>
                      </>
                    }
                    actions={
                      <>
                        <button
                          type="button"
                          className={cn(styles.workspaceGhostButton, styles.workspaceIconButton)}
                          aria-label={`${entry.ruleId} ACL 규칙 수정`}
                          title="ACL 규칙 수정"
                          disabled={editDisabled}
                          onClick={() => openEditDialog(entry)}
                        >
                          <Pencil className={styles.workspaceIcon} aria-hidden />
                        </button>
                        <button
                          type="button"
                          className={cn(styles.workspaceGhostButton, styles.workspaceDangerButton, styles.workspaceIconButton)}
                          aria-label={`${entry.ruleId} ACL 규칙 삭제`}
                          title="ACL 규칙 삭제"
                          disabled={deleteDisabled}
                          onClick={() => {
                            void onDeleteAclRule({ ruleId: entry.ruleId });
                          }}
                        >
                          <Trash2 className={styles.workspaceIcon} aria-hidden />
                        </button>
                      </>
                    }
                  />
                );
              })
            ) : (
              <div className={styles.workspaceListEmpty}>
                <p className={styles.workspacePanelHint}>등록된 ACL 규칙이 없습니다.</p>
              </div>
            )}
          </WorkspaceDialogListShell>
        }
      />

      <WorkspaceAclRuleEditDialog
        open={aclDialogOpen}
        mode={aclDialogMode}
        rule={editingRule}
        busy={busy}
        canManageFolderAcl={canManageFolderAcl}
        roles={roles}
        folderOptions={folderOptions}
        onClose={closeDialog}
        onSave={async (payload) => {
          await onUpsertAclRule(payload);
          closeDialog();
        }}
      />
    </>
  );
}
