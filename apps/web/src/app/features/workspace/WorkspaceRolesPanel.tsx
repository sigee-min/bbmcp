import { useEffect, useMemo, useRef, useState } from 'react';
import { MoreHorizontal, Plus, Shield, ShieldCheck, UserPlus } from 'lucide-react';

import type { WorkspaceRoleRecord } from '../../../lib/dashboardModel';
import { AdaptiveMenu } from '../../_components/AdaptiveMenu';
import { cn } from '../../../lib/utils';
import styles from '../../page.module.css';
import { WorkspaceDialogListItem, WorkspaceDialogListShell } from './WorkspaceDialogList';
import { WorkspacePanelSection } from './WorkspacePanelSection';
import { WorkspaceRoleEditDialog } from './WorkspaceRoleEditDialog';

interface WorkspaceRolesPanelProps {
  roles: readonly WorkspaceRoleRecord[];
  roleMemberCountMap: ReadonlyMap<string, number>;
  defaultMemberRoleId: string;
  busy: boolean;
  canManageRoles: boolean;
  onUpsertRole: (input: {
    roleId?: string;
    name: string;
  }) => Promise<void>;
  onDeleteRole: (roleId: string) => Promise<void>;
  onSetDefaultMemberRole: (roleId: string) => Promise<void>;
}

export function WorkspaceRolesPanel({
  roles,
  roleMemberCountMap,
  defaultMemberRoleId,
  busy,
  canManageRoles,
  onUpsertRole,
  onDeleteRole,
  onSetDefaultMemberRole
}: WorkspaceRolesPanelProps) {
  const [actionRoleId, setActionRoleId] = useState<string | null>(null);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [roleDialogMode, setRoleDialogMode] = useState<'create' | 'edit'>('create');
  const [editingRole, setEditingRole] = useState<WorkspaceRoleRecord | null>(null);
  const actionAnchorRef = useRef<HTMLButtonElement | null>(null);

  const disabled = busy || !canManageRoles;

  useEffect(() => {
    if (!actionRoleId) {
      return;
    }
    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest('[data-workspace-role-action-menu="true"]')) {
        return;
      }
      setActionRoleId(null);
    };
    document.addEventListener('pointerdown', handleOutsidePointer);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer);
    };
  }, [actionRoleId]);

  const listMeta = busy
    ? `등록된 역할 ${roles.length}개 · 요청 처리 중`
    : !canManageRoles
      ? `등록된 역할 ${roles.length}개 · 읽기 전용`
      : `등록된 역할 ${roles.length}개`;

  const openCreateRoleDialog = () => {
    setRoleDialogMode('create');
    setEditingRole(null);
    setRoleDialogOpen(true);
  };

  const openEditRoleDialog = (role: WorkspaceRoleRecord) => {
    setRoleDialogMode('edit');
    setEditingRole(role);
    setRoleDialogOpen(true);
  };

  const closeRoleDialog = () => {
    if (busy) {
      return;
    }
    setRoleDialogOpen(false);
    setEditingRole(null);
  };

  return (
    <>
      <WorkspacePanelSection
        framed={false}
        readContent={
          <WorkspaceDialogListShell
            title="역할"
            meta={listMeta}
            icon={<Shield aria-hidden />}
            action={
              canManageRoles ? (
                <button
                  type="button"
                  className={cn(styles.workspaceGhostButton, styles.workspaceIconButton)}
                  aria-label="역할 추가"
                  title="역할 추가"
                  disabled={busy}
                  onClick={openCreateRoleDialog}
                >
                  <Plus className={styles.workspaceIcon} aria-hidden />
                </button>
              ) : null
            }
          >
            {roles.length > 0 ? (
              roles.map((role) => {
                const roleName = role.name;
                const isAdminRole = role.builtin === 'workspace_admin';
                const isDefaultMemberRole = role.roleId === defaultMemberRoleId;
                const deleteDisabled = disabled || isAdminRole || isDefaultMemberRole;
                const setDefaultDisabled = disabled || isAdminRole || isDefaultMemberRole;
                const editDisabled = disabled || isAdminRole;
                const roleMemberCount = roleMemberCountMap.get(role.roleId) ?? 0;
                return (
                  <WorkspaceDialogListItem
                    key={role.roleId}
                    main={
                      <div className={styles.workspaceRoleHeading}>
                        <span className={styles.workspaceRoleHeadingMain}>
                          <span className={styles.workspaceListItemTitle}>{roleName}</span>
                          <span
                            className={styles.workspaceRoleMemberCount}
                            aria-label={`${roleName} 역할 멤버 수`}
                            title={`멤버 ${roleMemberCount}명`}
                          >
                            {roleMemberCount}명
                          </span>
                        </span>
                        <span className={styles.workspaceRoleStateBadges}>
                          {isDefaultMemberRole ? (
                            <span
                              role="img"
                              className={cn(styles.workspaceRoleStateBadge, styles.workspaceRoleStateBadgeDefault)}
                              aria-label="기본 가입자 역할"
                              title="기본 가입자 역할"
                            >
                              <UserPlus className={styles.workspaceRoleStateBadgeIcon} aria-hidden />
                            </span>
                          ) : null}
                          {isAdminRole ? (
                            <span
                              role="img"
                              className={cn(styles.workspaceRoleStateBadge, styles.workspaceRoleStateBadgeAdmin)}
                              aria-label="어드민 고정 역할"
                              title="어드민 고정 역할"
                            >
                              <ShieldCheck className={styles.workspaceRoleStateBadgeIcon} aria-hidden />
                            </span>
                          ) : null}
                        </span>
                      </div>
                    }
                    actions={
                      <div data-workspace-role-action-menu="true">
                        <button
                          ref={actionRoleId === role.roleId ? actionAnchorRef : undefined}
                          type="button"
                          className={cn(styles.workspaceGhostButton, styles.workspaceRoleActionTrigger)}
                          aria-label={`${roleName} 역할 액션`}
                          disabled={disabled}
                          data-workspace-role-action-menu="true"
                          onClick={(event) => {
                            actionAnchorRef.current = event.currentTarget;
                            setActionRoleId((prev) => (prev === role.roleId ? null : role.roleId));
                          }}
                        >
                          <MoreHorizontal className={styles.workspaceRoleActionIcon} aria-hidden />
                        </button>
                        <AdaptiveMenu
                          open={actionRoleId === role.roleId}
                          anchorRef={actionAnchorRef}
                          ariaLabel={`${roleName} 역할 액션`}
                          className={styles.workspaceRoleActionMenu}
                        >
                          <button
                            type="button"
                            role="menuitem"
                            className={styles.workspaceRoleActionMenuItem}
                            disabled={editDisabled}
                            onClick={() => {
                              openEditRoleDialog(role);
                              setActionRoleId(null);
                            }}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className={styles.workspaceRoleActionMenuItem}
                            disabled={setDefaultDisabled}
                            onClick={() => {
                              void onSetDefaultMemberRole(role.roleId);
                              setActionRoleId(null);
                            }}
                          >
                            기본 가입자 권한으로 지정
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className={cn(styles.workspaceRoleActionMenuItem, styles.workspaceRoleActionMenuItemDanger)}
                            disabled={deleteDisabled}
                            onClick={() => {
                              void onDeleteRole(role.roleId);
                              setActionRoleId(null);
                            }}
                          >
                            삭제
                          </button>
                        </AdaptiveMenu>
                      </div>
                    }
                  />
                );
              })
            ) : (
              <div className={styles.workspaceListEmpty}>
                <p className={styles.workspacePanelHint}>등록된 역할이 없습니다.</p>
              </div>
            )}
          </WorkspaceDialogListShell>
        }
      />

      <WorkspaceRoleEditDialog
        open={roleDialogOpen}
        mode={roleDialogMode}
        initialName={editingRole?.name ?? ''}
        busy={busy}
        canManageRoles={canManageRoles}
        onClose={closeRoleDialog}
        onSave={async ({ name }) => {
          await onUpsertRole({
            ...(roleDialogMode === 'edit' && editingRole ? { roleId: editingRole.roleId } : {}),
            name
          });
          closeRoleDialog();
        }}
      />
    </>
  );
}
