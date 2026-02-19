import { useMemo, useState } from 'react';

import type { WorkspacePermissionKey, WorkspaceRoleRecord } from '../../../lib/dashboardModel';
import { cn } from '../../../lib/utils';
import styles from '../../page.module.css';

const PERMISSION_OPTIONS: readonly WorkspacePermissionKey[] = [
  'workspace.read',
  'workspace.settings.manage',
  'workspace.members.manage',
  'workspace.roles.manage',
  'folder.read',
  'folder.write',
  'project.read',
  'project.write'
] as const;

interface WorkspaceRolesPanelProps {
  roles: readonly WorkspaceRoleRecord[];
  busy: boolean;
  allOpenMode: boolean;
  canManageRoles: boolean;
  onUpsertRole: (input: { roleId: string; name: string; permissions: WorkspacePermissionKey[]; builtin?: 'workspace_admin' | 'user' | null }) => Promise<void>;
  onDeleteRole: (roleId: string) => Promise<void>;
}

export function WorkspaceRolesPanel({
  roles,
  busy,
  allOpenMode,
  canManageRoles,
  onUpsertRole,
  onDeleteRole
}: WorkspaceRolesPanelProps) {
  const [draftRoleId, setDraftRoleId] = useState('');
  const [draftRoleName, setDraftRoleName] = useState('');
  const [draftPermissions, setDraftPermissions] = useState<WorkspacePermissionKey[]>(['workspace.read', 'folder.read', 'project.read']);
  const [roleNames, setRoleNames] = useState<Record<string, string>>({});

  const disabled = busy || allOpenMode || !canManageRoles;

  const toggleDraftPermission = (permission: WorkspacePermissionKey) => {
    setDraftPermissions((prev) =>
      prev.includes(permission) ? prev.filter((entry) => entry !== permission) : [...prev, permission]
    );
  };

  const canCreate = useMemo(
    () => draftRoleId.trim().length > 0 && draftRoleName.trim().length > 0 && draftPermissions.length > 0,
    [draftPermissions.length, draftRoleId, draftRoleName]
  );

  return (
    <section className={styles.workspacePanelSection}>
      {allOpenMode ? <p className={styles.workspacePanelHint}>all_open 모드에서는 역할을 수정할 수 없습니다.</p> : null}
      {!allOpenMode && !canManageRoles ? <p className={styles.workspacePanelHint}>역할 관리 권한이 없습니다.</p> : null}

      <form
        className={styles.workspaceInlineForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (!canCreate || disabled) {
            return;
          }
          void onUpsertRole({
            roleId: draftRoleId.trim(),
            name: draftRoleName.trim(),
            permissions: draftPermissions
          }).then(() => {
            setDraftRoleId('');
            setDraftRoleName('');
            setDraftPermissions(['workspace.read', 'folder.read', 'project.read']);
          });
        }}
      >
        <div className={styles.workspaceInputRow}>
          <input
            type="text"
            className={styles.workspaceInput}
            placeholder="role id"
            value={draftRoleId}
            onChange={(event) => setDraftRoleId(event.target.value)}
            disabled={disabled}
          />
          <input
            type="text"
            className={styles.workspaceInput}
            placeholder="role name"
            value={draftRoleName}
            onChange={(event) => setDraftRoleName(event.target.value)}
            disabled={disabled}
          />
        </div>
        <div className={styles.workspaceCheckboxGrid}>
          {PERMISSION_OPTIONS.map((permission) => (
            <label key={permission} className={styles.workspaceCheckboxItem}>
              <input
                type="checkbox"
                checked={draftPermissions.includes(permission)}
                onChange={() => toggleDraftPermission(permission)}
                disabled={disabled}
              />
              <span>{permission}</span>
            </label>
          ))}
        </div>
        <button type="submit" className={styles.workspacePrimaryButton} disabled={disabled || !canCreate}>
          역할 추가
        </button>
      </form>

      <div className={styles.workspaceList}>
        {roles.length > 0 ? (
          roles.map((role) => {
            const isBuiltinUser = role.builtin === 'user';
            const editableName = roleNames[role.roleId] ?? role.name;
            return (
              <article key={role.roleId} className={styles.workspaceListItem}>
                <div className={styles.workspaceListItemMain}>
                  <div className={styles.workspaceInputRow}>
                    <input
                      type="text"
                      className={styles.workspaceInput}
                      value={editableName}
                      disabled={disabled || isBuiltinUser}
                      onChange={(event) => {
                        const nextName = event.target.value;
                        setRoleNames((prev) => ({ ...prev, [role.roleId]: nextName }));
                      }}
                    />
                    <span className={styles.workspaceTag}>{role.roleId}</span>
                    {role.builtin ? <span className={styles.workspaceTag}>{role.builtin}</span> : null}
                  </div>
                  <div className={styles.workspaceTagRow}>
                    {role.permissions.map((permission) => (
                      <span key={`${role.roleId}:${permission}`} className={styles.workspaceTag}>
                        {permission}
                      </span>
                    ))}
                  </div>
                </div>
                <div className={styles.workspaceListItemActions}>
                  <button
                    type="button"
                    className={styles.workspaceGhostButton}
                    disabled={disabled || isBuiltinUser || editableName.trim().length === 0 || editableName === role.name}
                    onClick={() => {
                      void onUpsertRole({
                        roleId: role.roleId,
                        name: editableName.trim(),
                        permissions: [...role.permissions],
                        builtin: role.builtin
                      });
                    }}
                  >
                    저장
                  </button>
                  <button
                    type="button"
                    className={cn(styles.workspaceGhostButton, styles.workspaceDangerButton)}
                    disabled={disabled || isBuiltinUser}
                    onClick={() => {
                      void onDeleteRole(role.roleId);
                    }}
                  >
                    삭제
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <p className={styles.workspacePanelHint}>등록된 역할이 없습니다.</p>
        )}
      </div>
      <p className={styles.workspacePanelHint}>기본 역할 `user`는 이름 변경/삭제가 불가합니다.</p>
    </section>
  );
}
