import { useMemo, useState } from 'react';

import type { WorkspaceMemberRecord, WorkspaceRoleRecord } from '../../../lib/dashboardModel';
import { cn } from '../../../lib/utils';
import styles from '../../page.module.css';

interface WorkspaceMembersPanelProps {
  members: readonly WorkspaceMemberRecord[];
  roles: readonly WorkspaceRoleRecord[];
  busy: boolean;
  allOpenMode: boolean;
  canManageMembers: boolean;
  onUpsertMember: (input: { accountId: string; roleIds: string[] }) => Promise<void>;
  onDeleteMember: (accountId: string) => Promise<void>;
}

export function WorkspaceMembersPanel({
  members,
  roles,
  busy,
  allOpenMode,
  canManageMembers,
  onUpsertMember,
  onDeleteMember
}: WorkspaceMembersPanelProps) {
  const [accountId, setAccountId] = useState('');
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);

  const roleMap = useMemo(() => new Map(roles.map((role) => [role.roleId, role])), [roles]);
  const disabled = busy || allOpenMode || !canManageMembers;

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((entry) => entry !== roleId) : [...prev, roleId]
    );
  };

  return (
    <section className={styles.workspacePanelSection}>
      {allOpenMode ? <p className={styles.workspacePanelHint}>all_open 모드에서는 멤버 권한 설정을 수정할 수 없습니다.</p> : null}
      {!allOpenMode && !canManageMembers ? (
        <p className={styles.workspacePanelHint}>멤버 관리 권한이 없습니다.</p>
      ) : null}

      <form
        className={styles.workspaceInlineForm}
        onSubmit={(event) => {
          event.preventDefault();
          const normalizedAccountId = accountId.trim();
          if (!normalizedAccountId || selectedRoleIds.length === 0 || disabled) {
            return;
          }
          void onUpsertMember({
            accountId: normalizedAccountId,
            roleIds: selectedRoleIds
          }).then(() => {
            setAccountId('');
            setSelectedRoleIds([]);
          });
        }}
      >
        <input
          type="text"
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
          className={styles.workspaceInput}
          placeholder="account id"
          disabled={disabled}
        />
        <div className={styles.workspaceCheckboxGrid}>
          {roles.map((role) => (
            <label key={role.roleId} className={styles.workspaceCheckboxItem}>
              <input
                type="checkbox"
                checked={selectedRoleIds.includes(role.roleId)}
                onChange={() => toggleRole(role.roleId)}
                disabled={disabled}
              />
              <span>{role.name}</span>
            </label>
          ))}
        </div>
        <button type="submit" className={styles.workspacePrimaryButton} disabled={disabled}>
          멤버 저장
        </button>
      </form>

      <div className={styles.workspaceList}>
        {members.length > 0 ? (
          members.map((member) => (
            <article key={member.accountId} className={styles.workspaceListItem}>
              <div className={styles.workspaceListItemMain}>
                <p className={styles.workspaceListItemTitle}>{member.accountId}</p>
                <div className={styles.workspaceTagRow}>
                  {member.roleIds.length > 0 ? (
                    member.roleIds.map((roleId) => (
                      <span key={roleId} className={styles.workspaceTag}>
                        {roleMap.get(roleId)?.name ?? roleId}
                      </span>
                    ))
                  ) : (
                    <span className={styles.workspaceTag}>역할 없음</span>
                  )}
                </div>
              </div>
              <div className={styles.workspaceListItemActions}>
                <button
                  type="button"
                  className={cn(styles.workspaceGhostButton, styles.workspaceDangerButton)}
                  disabled={disabled}
                  onClick={() => {
                    void onDeleteMember(member.accountId);
                  }}
                >
                  삭제
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className={styles.workspacePanelHint}>등록된 멤버가 없습니다.</p>
        )}
      </div>
    </section>
  );
}
