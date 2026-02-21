import { Check, Folders, Pencil, RotateCcw, Search, ShieldUser, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { ServiceManagedAccountRecord } from '../../../lib/dashboardModel';
import { cn } from '../../../lib/utils';
import styles from '../../page.module.css';
import { WorkspaceDialogListItem, WorkspaceDialogListShell } from '../workspace/WorkspaceDialogList';
import { WorkspacePanelSection } from '../workspace/WorkspacePanelSection';
import type {
  ServiceUserWorkspaceLookup,
  ServiceUsersSearchMeta,
  ServiceUsersSearchQuery
} from './serviceManagementApi';

interface ServiceUsersPanelProps {
  users: readonly ServiceManagedAccountRecord[];
  search: ServiceUsersSearchMeta;
  busy: boolean;
  canManageUsers: boolean;
  minimumSystemAdminCount: number;
  currentSystemAdminCount: number;
  onSearch: (query: ServiceUsersSearchQuery) => Promise<void>;
  onLoadUserWorkspaces: (accountId: string) => Promise<ServiceUserWorkspaceLookup>;
  onSetRoles: (accountId: string, systemRoles: string[]) => Promise<void>;
}

type SystemRoleOption = {
  value: 'system_admin' | 'cs_admin';
  label: string;
};

const SYSTEM_ROLE_OPTIONS: readonly SystemRoleOption[] = [
  { value: 'system_admin', label: 'System Admin' },
  { value: 'cs_admin', label: 'CS Admin' }
];

const USER_FIELD_OPTIONS: ReadonlyArray<{ value: ServiceUsersSearchQuery['field']; label: string }> = [
  { value: 'any', label: '전체 필드' },
  { value: 'accountId', label: '계정 ID' },
  { value: 'displayName', label: '이름' },
  { value: 'email', label: '이메일' },
  { value: 'localLoginId', label: '로컬 로그인 ID' },
  { value: 'githubLogin', label: 'GitHub 로그인' }
];

const MATCH_OPTIONS: ReadonlyArray<{ value: ServiceUsersSearchQuery['match']; label: string }> = [
  { value: 'exact', label: '정확히 일치' },
  { value: 'prefix', label: '접두 일치' },
  { value: 'contains', label: '포함 검색' }
];

const hasRole = (roles: readonly string[], role: string): boolean => roles.includes(role);

const uniqueRoles = (roles: readonly string[]): string[] => Array.from(new Set(roles));

const toSearchPayload = (value: {
  q: string;
  field: ServiceUsersSearchQuery['field'];
  match: ServiceUsersSearchQuery['match'];
  workspaceId: string;
  limit: number;
}): ServiceUsersSearchQuery => ({
  q: value.q.trim() || undefined,
  field: value.field,
  match: value.match,
  workspaceId: value.workspaceId.trim() || undefined,
  limit: value.limit,
  cursor: null
});

export function ServiceUsersPanel({
  users,
  search,
  busy,
  canManageUsers,
  minimumSystemAdminCount,
  currentSystemAdminCount,
  onSearch,
  onLoadUserWorkspaces,
  onSetRoles
}: ServiceUsersPanelProps) {
  const [q, setQ] = useState(search.q ?? '');
  const [field, setField] = useState<ServiceUsersSearchQuery['field']>(search.field);
  const [match, setMatch] = useState<ServiceUsersSearchQuery['match']>(search.match);
  const [workspaceId, setWorkspaceId] = useState(search.workspaceId ?? '');
  const [queryBusy, setQueryBusy] = useState(false);

  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [draftRoles, setDraftRoles] = useState<string[]>([]);
  const [draftBusy, setDraftBusy] = useState(false);

  const [membershipOpen, setMembershipOpen] = useState(false);
  const [membershipAccountId, setMembershipAccountId] = useState<string>('');
  const [membershipDisplayName, setMembershipDisplayName] = useState<string>('');
  const [membershipWorkspaces, setMembershipWorkspaces] = useState<ServiceUserWorkspaceLookup['workspaces']>([]);
  const [membershipBusy, setMembershipBusy] = useState(false);
  const [membershipError, setMembershipError] = useState<string | null>(null);

  useEffect(() => {
    setQ(search.q ?? '');
    setField(search.field);
    setMatch(search.match);
    setWorkspaceId(search.workspaceId ?? '');
  }, [search.field, search.match, search.q, search.workspaceId]);

  const roleCountMap = useMemo(() => {
    const counts = {
      system_admin: 0,
      cs_admin: 0
    };
    for (const user of users) {
      if (hasRole(user.systemRoles, 'system_admin')) {
        counts.system_admin += 1;
      }
      if (hasRole(user.systemRoles, 'cs_admin')) {
        counts.cs_admin += 1;
      }
    }
    return counts;
  }, [users]);

  const editingUser = useMemo(
    () => (editingAccountId ? users.find((entry) => entry.accountId === editingAccountId) ?? null : null),
    [editingAccountId, users]
  );

  const disabled = busy || draftBusy || queryBusy;
  const listMeta = busy
    ? `검색 결과 ${search.total}명 · 불러오는 중`
    : canManageUsers
      ? `검색 결과 ${search.total}명 · system_admin ${currentSystemAdminCount}명`
      : `검색 결과 ${search.total}명 · 읽기 전용`;

  const hasActiveFilter = useMemo(
    () => Boolean((search.q ?? '').trim()) || search.field !== 'any' || search.match !== 'contains' || Boolean(search.workspaceId),
    [search.field, search.match, search.q, search.workspaceId]
  );

  const closeEditor = () => {
    if (draftBusy) {
      return;
    }
    setEditingAccountId(null);
    setDraftRoles([]);
  };

  const openEditor = (account: ServiceManagedAccountRecord) => {
    if (!canManageUsers) {
      return;
    }
    setEditingAccountId(account.accountId);
    setDraftRoles(uniqueRoles(account.systemRoles));
  };

  const toggleRole = (role: string) => {
    setDraftRoles((prev) => {
      if (prev.includes(role)) {
        return prev.filter((entry) => entry !== role);
      }
      return [...prev, role];
    });
  };

  const closeMembership = () => {
    if (membershipBusy) {
      return;
    }
    setMembershipOpen(false);
    setMembershipError(null);
    setMembershipWorkspaces([]);
  };

  const openMembership = (account: ServiceManagedAccountRecord) => {
    setMembershipOpen(true);
    setMembershipAccountId(account.accountId);
    setMembershipDisplayName(account.displayName);
    setMembershipWorkspaces([]);
    setMembershipError(null);
    setMembershipBusy(true);
    void onLoadUserWorkspaces(account.accountId)
      .then((lookup) => {
        setMembershipWorkspaces(lookup.workspaces);
        if (lookup.account) {
          setMembershipDisplayName(lookup.account.displayName);
        }
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : '유저 소속 워크스페이스를 불러오지 못했습니다.';
        setMembershipError(message);
      })
      .finally(() => {
        setMembershipBusy(false);
      });
  };

  const canSave =
    !disabled &&
    Boolean(editingUser) &&
    uniqueRoles(draftRoles).sort().join(',') !== uniqueRoles(editingUser?.systemRoles ?? []).sort().join(',');

  const submitSearch = async () => {
    setQueryBusy(true);
    try {
      await onSearch(
        toSearchPayload({
          q,
          field,
          match,
          workspaceId,
          limit: search.limit
        })
      );
    } finally {
      setQueryBusy(false);
    }
  };

  const resetSearch = async () => {
    setQ('');
    setField('any');
    setMatch('contains');
    setWorkspaceId('');
    setQueryBusy(true);
    try {
      await onSearch({
        field: 'any',
        match: 'contains',
        limit: search.limit,
        cursor: null
      });
    } finally {
      setQueryBusy(false);
    }
  };

  return (
    <>
      <WorkspacePanelSection
        framed={false}
        readContent={
          <>
            <form
              className={styles.workspaceInlineForm}
              onSubmit={(event) => {
                event.preventDefault();
                void submitSearch();
              }}
            >
              <div className={styles.workspaceInputRow}>
                <input
                  className={styles.workspaceInput}
                  type="text"
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder="검색어"
                  aria-label="서비스 유저 검색어"
                  disabled={disabled}
                />
                <input
                  className={styles.workspaceInput}
                  type="text"
                  value={workspaceId}
                  onChange={(event) => setWorkspaceId(event.target.value)}
                  placeholder="워크스페이스 ID 필터"
                  aria-label="서비스 유저 워크스페이스 ID 필터"
                  disabled={disabled}
                />
              </div>
              <div className={styles.workspaceInputRow}>
                <label className={styles.workspacePanelHint}>
                  필드
                  <select
                    className={styles.workspaceInput}
                    value={field}
                    onChange={(event) => setField(event.target.value as ServiceUsersSearchQuery['field'])}
                    aria-label="서비스 유저 검색 필드"
                    disabled={disabled}
                  >
                    {USER_FIELD_OPTIONS.map((option) => (
                      <option key={String(option.value)} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.workspacePanelHint}>
                  매칭
                  <select
                    className={styles.workspaceInput}
                    value={match}
                    onChange={(event) => setMatch(event.target.value as ServiceUsersSearchQuery['match'])}
                    aria-label="서비스 유저 검색 매칭"
                    disabled={disabled}
                  >
                    {MATCH_OPTIONS.map((option) => (
                      <option key={String(option.value)} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={styles.workspaceTagRow}>
                <button
                  type="submit"
                  className={cn(styles.workspacePrimaryButton, styles.workspaceIconButton)}
                  aria-label="서비스 유저 검색 실행"
                  disabled={disabled}
                >
                  <Search className={styles.workspaceIcon} aria-hidden />
                </button>
                <button
                  type="button"
                  className={cn(styles.workspaceGhostButton, styles.workspaceIconButton)}
                  aria-label="서비스 유저 검색 초기화"
                  disabled={disabled || !hasActiveFilter}
                  onClick={() => {
                    void resetSearch();
                  }}
                >
                  <RotateCcw className={styles.workspaceIcon} aria-hidden />
                </button>
              </div>
            </form>

            <WorkspaceDialogListShell title="유저" meta={listMeta} icon={<ShieldUser aria-hidden />}>
              {users.length > 0 ? (
                users.map((account) => {
                  const accountRoles = uniqueRoles(account.systemRoles);
                  const hasSystemAdmin = accountRoles.includes('system_admin');
                  const lastSystemAdminGuard = hasSystemAdmin && roleCountMap.system_admin <= Math.max(1, minimumSystemAdminCount);
                  return (
                    <WorkspaceDialogListItem
                      key={account.accountId}
                      main={
                        <>
                          <p className={styles.workspaceListItemTitle}>{account.accountId}</p>
                          <p className={styles.workspacePanelHint}>{account.displayName}</p>
                          <p className={styles.workspacePanelHint}>{account.email}</p>
                          <div className={styles.workspaceTagRow}>
                            {account.localLoginId ? <span className={styles.workspaceTag}>local:{account.localLoginId}</span> : null}
                            {account.githubLogin ? <span className={styles.workspaceTag}>gh:{account.githubLogin}</span> : null}
                            {accountRoles.length > 0 ? (
                              accountRoles.map((role) => (
                                <span key={role} className={styles.workspaceTag}>
                                  {role}
                                </span>
                              ))
                            ) : (
                              <span className={styles.workspaceTag}>역할 없음</span>
                            )}
                            {lastSystemAdminGuard ? <span className={styles.workspaceTag}>최소 인원 보호</span> : null}
                          </div>
                        </>
                      }
                      actions={
                        <>
                          <button
                            type="button"
                            className={cn(styles.workspaceGhostButton, styles.workspaceIconButton)}
                            aria-label={`${account.accountId} 소속 워크스페이스 보기`}
                            title="소속 워크스페이스 보기"
                            disabled={disabled}
                            onClick={() => openMembership(account)}
                          >
                            <Folders className={styles.workspaceIcon} aria-hidden />
                          </button>
                          {canManageUsers ? (
                            <button
                              type="button"
                              className={cn(styles.workspaceGhostButton, styles.workspaceIconButton)}
                              aria-label={`${account.accountId} 시스템 역할 수정`}
                              title="시스템 역할 수정"
                              disabled={disabled}
                              onClick={() => openEditor(account)}
                            >
                              <Pencil className={styles.workspaceIcon} aria-hidden />
                            </button>
                          ) : null}
                        </>
                      }
                    />
                  );
                })
              ) : (
                <div className={styles.workspaceListEmpty}>
                  <p className={styles.workspacePanelHint}>검색 조건에 맞는 유저가 없습니다.</p>
                </div>
              )}
            </WorkspaceDialogListShell>
          </>
        }
      />

      {editingUser ? (
        <div className={styles.workspaceAclEditOverlay} role="presentation" onClick={closeEditor}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label="시스템 역할 수정"
            className={styles.workspaceAclEditDialog}
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.workspaceAclEditHeader}>
              <div className={styles.workspaceAclEditTitleWrap}>
                <h3 className={styles.workspaceAclEditTitle}>시스템 역할 수정</h3>
                <p className={styles.workspaceAclEditSubtitle}>{editingUser.displayName}</p>
              </div>
              <button
                type="button"
                className={styles.workspaceAclEditCloseButton}
                onClick={closeEditor}
                disabled={draftBusy}
                aria-label="시스템 역할 수정 닫기"
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
                setDraftBusy(true);
                void onSetRoles(editingUser.accountId, uniqueRoles(draftRoles))
                  .then(() => {
                    closeEditor();
                  })
                  .finally(() => {
                    setDraftBusy(false);
                  });
              }}
            >
              <div className={styles.workspaceAclEditBody}>
                <div className={styles.workspaceChipGrid} role="group" aria-label="시스템 역할 선택">
                  {SYSTEM_ROLE_OPTIONS.map((role) => {
                    const selected = draftRoles.includes(role.value);
                    const disableLastAdminGuard =
                      role.value === 'system_admin' &&
                      selected &&
                      editingUser.systemRoles.includes('system_admin') &&
                      currentSystemAdminCount <= Math.max(1, minimumSystemAdminCount);
                    return (
                      <button
                        key={role.value}
                        type="button"
                        className={cn(styles.workspaceSelectChip, selected ? styles.workspaceSelectChipActive : '')}
                        aria-pressed={selected}
                        disabled={draftBusy || disableLastAdminGuard}
                        onClick={() => toggleRole(role.value)}
                      >
                        {role.label}
                      </button>
                    );
                  })}
                </div>
                <p className={styles.workspacePanelHint}>
                  system_admin은 최소 {minimumSystemAdminCount}명 이상 유지되어야 합니다.
                </p>
              </div>

              <footer className={styles.workspaceAclEditFooter}>
                <button
                  type="button"
                  className={cn(styles.workspaceGhostButton, styles.workspaceIconButton)}
                  onClick={closeEditor}
                  disabled={draftBusy}
                  aria-label="시스템 역할 수정 취소"
                >
                  <X className={styles.workspaceIcon} aria-hidden />
                </button>
                <button
                  type="submit"
                  className={cn(styles.workspacePrimaryButton, styles.workspaceIconButton)}
                  disabled={!canSave}
                  aria-label="시스템 역할 수정 저장"
                >
                  <Check className={styles.workspaceIcon} aria-hidden />
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}

      {membershipOpen ? (
        <div className={styles.workspaceAclEditOverlay} role="presentation" onClick={closeMembership}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label="유저 소속 워크스페이스"
            className={styles.workspaceAclEditDialog}
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.workspaceAclEditHeader}>
              <div className={styles.workspaceAclEditTitleWrap}>
                <h3 className={styles.workspaceAclEditTitle}>소속 워크스페이스</h3>
                <p className={styles.workspaceAclEditSubtitle}>
                  {membershipDisplayName} ({membershipAccountId})
                </p>
              </div>
              <button
                type="button"
                className={styles.workspaceAclEditCloseButton}
                onClick={closeMembership}
                disabled={membershipBusy}
                aria-label="유저 소속 워크스페이스 닫기"
              >
                <X className={styles.workspaceIcon} aria-hidden />
              </button>
            </header>

            <div className={styles.workspaceAclEditBody}>
              {membershipError ? <p className={styles.workspacePanelHint}>{membershipError}</p> : null}
              {!membershipError && membershipBusy ? <p className={styles.workspacePanelHint}>불러오는 중...</p> : null}
              {!membershipError && !membershipBusy ? (
                membershipWorkspaces.length > 0 ? (
                  membershipWorkspaces.map((workspace) => (
                    <WorkspaceDialogListItem
                      key={workspace.workspaceId}
                      main={
                        <>
                          <p className={styles.workspaceListItemTitle}>{workspace.workspaceId}</p>
                          <p className={styles.workspacePanelHint}>{workspace.name}</p>
                          <div className={styles.workspaceTagRow}>
                            <span className={styles.workspaceTag}>owner:{workspace.createdBy || '-'}</span>
                            <span className={styles.workspaceTag}>default:{workspace.defaultMemberRoleId}</span>
                            <span className={styles.workspaceTag}>
                              roles:{workspace.membership?.roleIds.join(', ') || '-'}
                            </span>
                          </div>
                        </>
                      }
                    />
                  ))
                ) : (
                  <p className={styles.workspacePanelHint}>소속 워크스페이스가 없습니다.</p>
                )
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
