import { useMemo, useState } from 'react';
import { Check, Pencil, Search, Trash2, UserPlus, Users, X } from 'lucide-react';

import type { WorkspaceMemberRecord } from '../../../lib/dashboardModel';
import { cn } from '../../../lib/utils';
import styles from '../../page.module.css';
import { WorkspaceDialogListItem, WorkspaceDialogListShell } from './WorkspaceDialogList';
import type { WorkspaceMemberCandidateOption, WorkspaceRoleOption } from './workspaceOptionMappers';
import { WorkspacePanelSection } from './WorkspacePanelSection';
import {
  countWorkspaceAdminsExcluding,
  hasWorkspaceAdminRole,
  isBootstrapAdminMember,
  isLastWorkspaceAdminMember,
  toWorkspaceAdminRoleIds
} from './workspaceMemberGuards';

interface WorkspaceMembersPanelProps {
  members: readonly WorkspaceMemberRecord[];
  roles: readonly WorkspaceRoleOption[];
  memberCandidates: readonly WorkspaceMemberCandidateOption[];
  defaultMemberRoleId: string;
  currentAccountId: string | null;
  busy: boolean;
  canManageMembers: boolean;
  onUpsertMember: (input: { accountId: string; roleIds: string[] }) => Promise<void>;
  onDeleteMember: (accountId: string) => Promise<void>;
}

const uniqueRoleIds = (roleIds: readonly string[]): string[] => Array.from(new Set(roleIds));

export function WorkspaceMembersPanel({
  members,
  roles,
  memberCandidates,
  defaultMemberRoleId,
  currentAccountId,
  busy,
  canManageMembers,
  onUpsertMember,
  onDeleteMember
}: WorkspaceMembersPanelProps) {
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [editorMode, setEditorMode] = useState<'add' | 'edit' | null>(null);
  const [memberQuery, setMemberQuery] = useState('');

  const roleMap = useMemo(() => new Map(roles.map((role) => [role.roleId, role])), [roles]);
  const workspaceAdminRoleIds = useMemo(() => toWorkspaceAdminRoleIds(roles), [roles]);
  const memberAccountIds = useMemo(() => new Set(members.map((member) => member.accountId)), [members]);
  const selectableCandidates = useMemo(
    () => memberCandidates.filter((candidate) => !memberAccountIds.has(candidate.accountId)),
    [memberCandidates, memberAccountIds]
  );
  const selectedCandidate = selectableCandidates.find((candidate) => candidate.accountId === selectedAccountId) ?? null;
  const editingMember = editorMode === 'edit' ? members.find((member) => member.accountId === selectedAccountId) ?? null : null;
  const normalizedMemberQuery = memberQuery.trim().toLowerCase();
  const filteredMembers = useMemo(() => {
    if (!normalizedMemberQuery) {
      return members;
    }
    return members.filter((member) => {
      if (member.accountId.toLowerCase().includes(normalizedMemberQuery)) {
        return true;
      }
      return member.roleIds.some((roleId) => {
        const roleLabel = (roleMap.get(roleId)?.label ?? roleId).toLowerCase();
        return roleLabel.includes(normalizedMemberQuery);
      });
    });
  }, [members, normalizedMemberQuery, roleMap]);
  const disabled = busy || !canManageMembers;
  const minMemberGuard = members.length <= 2;
  const hasRoleOptions = roles.length > 0;
  const hasCandidateOptions = selectableCandidates.length > 0;
  const hasDefaultRoleOption = roleMap.has(defaultMemberRoleId);
  const editingMemberIsLastAdmin =
    Boolean(editingMember) &&
    hasWorkspaceAdminRole(editingMember?.roleIds ?? [], workspaceAdminRoleIds) &&
    countWorkspaceAdminsExcluding(members, workspaceAdminRoleIds, editingMember?.accountId ?? '') <= 0;

  const resetEditor = () => {
    setEditorMode(null);
    setSelectedAccountId('');
    setSelectedRoleIds([]);
  };

  const startAddMember = () => {
    if (editorMode === 'add') {
      resetEditor();
      return;
    }
    setEditorMode('add');
    setSelectedAccountId('');
    setSelectedRoleIds(hasDefaultRoleOption ? [defaultMemberRoleId] : []);
  };

  const startEditMember = (member: WorkspaceMemberRecord) => {
    const roleIds = uniqueRoleIds(
      hasDefaultRoleOption ? [...member.roleIds, defaultMemberRoleId] : [...member.roleIds]
    );
    setEditorMode('edit');
    setSelectedAccountId(member.accountId);
    setSelectedRoleIds(roleIds);
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) => {
      const exists = prev.includes(roleId);
      if (exists && roleId === defaultMemberRoleId) {
        return prev;
      }
      if (exists) {
        return prev.filter((entry) => entry !== roleId);
      }
      return [...prev, roleId];
    });
  };

  const canSubmit =
    !disabled &&
    hasRoleOptions &&
    selectedRoleIds.length > 0 &&
    ((editorMode === 'add' && hasCandidateOptions && selectedAccountId.length > 0) ||
      (editorMode === 'edit' && selectedAccountId.length > 0));
  const memberCountMeta = normalizedMemberQuery ? `${filteredMembers.length}/${members.length}명` : `${members.length}명`;
  const listMeta = busy
    ? `등록된 멤버 ${memberCountMeta} · 요청 처리 중`
    : !canManageMembers
      ? `등록된 멤버 ${memberCountMeta} · 읽기 전용`
      : `등록된 멤버 ${memberCountMeta}`;

  return (
    <WorkspacePanelSection
      framed={false}
      readContent={
        <WorkspaceDialogListShell
          title="멤버"
          meta={listMeta}
          icon={<Users aria-hidden />}
          action={
            <div className={styles.workspaceListShellHeaderActions}>
              <label className={styles.workspaceListSearchField}>
                <Search className={styles.workspaceListSearchIcon} aria-hidden />
                <input
                  type="search"
                  className={cn(styles.workspaceInput, styles.workspaceListSearchInput)}
                  value={memberQuery}
                  onInput={(event) => setMemberQuery(event.currentTarget.value)}
                  onChange={(event) => setMemberQuery(event.currentTarget.value)}
                  placeholder="멤버 검색"
                  aria-label="워크스페이스 멤버 검색"
                />
              </label>
              {canManageMembers ? (
                <button
                  type="button"
                  className={cn(styles.workspaceGhostButton, styles.workspaceIconButton)}
                  aria-label={editorMode === 'add' ? '멤버 추가 닫기' : '멤버 추가'}
                  title={editorMode === 'add' ? '멤버 추가 닫기' : '멤버 추가'}
                  disabled={busy}
                  onClick={startAddMember}
                >
                  {editorMode === 'add' ? <X className={styles.workspaceIcon} aria-hidden /> : <UserPlus className={styles.workspaceIcon} aria-hidden />}
                </button>
              ) : null}
            </div>
          }
        >
          {filteredMembers.length > 0 ? (
            filteredMembers.map((member) => {
              const selfRemoveGuard = Boolean(currentAccountId) && member.accountId === currentAccountId;
              const lastAdminDeleteGuard = isLastWorkspaceAdminMember(member, members, workspaceAdminRoleIds);
              const bootstrapAdminEditGuard = isBootstrapAdminMember(member.accountId);
              const deleteDisabled = disabled || selfRemoveGuard || minMemberGuard || lastAdminDeleteGuard;
              const editDisabled = disabled || bootstrapAdminEditGuard;
              return (
                <WorkspaceDialogListItem
                  key={member.accountId}
                  main={
                    <>
                      <p className={styles.workspaceListItemTitle}>{member.accountId}</p>
                      <div className={styles.workspaceTagRow}>
                        {member.roleIds.length > 0 ? (
                          member.roleIds.map((roleId) => {
                            const roleLabel = roleMap.get(roleId)?.label ?? roleId;
                            return (
                              <span key={roleId} className={styles.workspaceTag}>
                                {roleLabel}
                                {roleId === defaultMemberRoleId ? ' · 기본 가입자' : ''}
                              </span>
                            );
                          })
                        ) : (
                          <span className={styles.workspaceTag}>역할 없음</span>
                        )}
                        {selfRemoveGuard ? <span className={styles.workspaceTag}>본인</span> : null}
                      </div>
                    </>
                  }
                  actions={
                    <>
                      <button
                        type="button"
                        className={cn(styles.workspaceGhostButton, styles.workspaceIconButton)}
                        aria-label={`${member.accountId} 멤버 역할 수정`}
                        title="멤버 역할 수정"
                        disabled={editDisabled}
                        onClick={() => startEditMember(member)}
                      >
                        <Pencil className={styles.workspaceIcon} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={cn(styles.workspaceGhostButton, styles.workspaceDangerButton, styles.workspaceIconButton)}
                        aria-label={`${member.accountId} 멤버 삭제`}
                        title="멤버 삭제"
                        disabled={deleteDisabled}
                        onClick={() => {
                          void onDeleteMember(member.accountId);
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
              <p className={styles.workspacePanelHint}>
                {members.length > 0 ? '검색 결과가 없습니다.' : '등록된 멤버가 없습니다.'}
              </p>
            </div>
          )}
        </WorkspaceDialogListShell>
      }
      inputContent={
        canManageMembers && editorMode ? (
          <form
            className={styles.workspaceInlineForm}
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSubmit) {
                return;
              }
              const roleIds = uniqueRoleIds(selectedRoleIds);
              const accountId = selectedAccountId.trim();
              if (!accountId || roleIds.length === 0) {
                return;
              }
              void onUpsertMember({
                accountId,
                roleIds
              }).then(() => {
                resetEditor();
              });
            }}
          >
            <p className={styles.workspacePanelLabel}>{editorMode === 'edit' ? '멤버 역할 수정' : '멤버 추가'}</p>

            {editorMode === 'add' ? (
              <>
                <select
                  className={styles.workspaceInput}
                  value={selectedAccountId}
                  onChange={(event) => setSelectedAccountId(event.target.value)}
                  disabled={disabled || !hasCandidateOptions}
                >
                  <option value="">계정 선택</option>
                  {selectableCandidates.map((candidate) => (
                    <option key={candidate.accountId} value={candidate.accountId}>
                      {candidate.label}
                    </option>
                  ))}
                </select>
                {selectedCandidate ? <p className={styles.workspacePanelHint}>{selectedCandidate.description}</p> : null}
              </>
            ) : (
              <div className={styles.workspacePanelCard}>
                <p className={styles.workspacePanelCardTitle}>대상 멤버</p>
                <p className={styles.workspacePanelValue}>{editingMember?.accountId ?? selectedAccountId}</p>
              </div>
            )}

            <div className={styles.workspaceChipGrid} role="group" aria-label="멤버 역할 선택">
              {roles.map((role) => {
                const isSelected = selectedRoleIds.includes(role.roleId);
                const isDefaultLocked = role.roleId === defaultMemberRoleId && isSelected;
                const isWorkspaceAdminLocked = editingMemberIsLastAdmin && workspaceAdminRoleIds.has(role.roleId) && isSelected;
                return (
                  <button
                    key={role.roleId}
                    type="button"
                    className={cn(styles.workspaceSelectChip, isSelected ? styles.workspaceSelectChipActive : '')}
                    aria-pressed={isSelected}
                    disabled={disabled || !hasRoleOptions || isDefaultLocked || isWorkspaceAdminLocked}
                    onClick={() => toggleRole(role.roleId)}
                  >
                    {role.label}
                    {role.roleId === defaultMemberRoleId ? ' (기본)' : ''}
                  </button>
                );
              })}
            </div>
            <p className={styles.workspacePanelHint}>기본 가입자 역할은 멤버에서 제거할 수 없습니다.</p>
            {!hasRoleOptions ? <p className={styles.workspacePanelHint}>먼저 역할을 생성한 뒤 멤버를 추가할 수 있습니다.</p> : null}
            {editorMode === 'add' && !hasCandidateOptions ? (
              <p className={styles.workspacePanelHint}>추가 가능한 계정 후보가 없습니다.</p>
            ) : null}

            <div className={styles.workspaceFormActions}>
              <button
                type="submit"
                className={cn(styles.workspacePrimaryButton, styles.workspaceIconButton)}
                aria-label="멤버 저장"
                title="멤버 저장"
                disabled={!canSubmit}
              >
                <Check className={styles.workspaceIcon} aria-hidden />
              </button>
              <button
                type="button"
                className={cn(styles.workspaceGhostButton, styles.workspaceIconButton)}
                aria-label="멤버 편집 닫기"
                title="멤버 편집 닫기"
                disabled={disabled}
                onClick={resetEditor}
              >
                <X className={styles.workspaceIcon} aria-hidden />
              </button>
            </div>
          </form>
        ) : null
      }
    />
  );
}
