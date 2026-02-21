import { FolderKanban, RotateCcw, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { ServiceWorkspaceSummary } from '../../../lib/dashboardModel';
import { cn } from '../../../lib/utils';
import styles from '../../page.module.css';
import { WorkspaceDialogListItem, WorkspaceDialogListShell } from '../workspace/WorkspaceDialogList';
import { WorkspacePanelSection } from '../workspace/WorkspacePanelSection';
import type { ServiceWorkspacesSearchMeta, ServiceWorkspacesSearchQuery } from './serviceManagementApi';

interface ServiceWorkspacesPanelProps {
  workspaces: readonly ServiceWorkspaceSummary[];
  search: ServiceWorkspacesSearchMeta;
  busy: boolean;
  onSearch: (query: ServiceWorkspacesSearchQuery) => Promise<void>;
}

type WorkspaceFieldOption = {
  value: ServiceWorkspacesSearchQuery['field'];
  label: string;
};

const WORKSPACE_FIELD_OPTIONS: readonly WorkspaceFieldOption[] = [
  { value: 'any', label: '전체 필드' },
  { value: 'workspaceId', label: '워크스페이스 ID' },
  { value: 'name', label: '이름' },
  { value: 'createdBy', label: '생성자 ID' },
  { value: 'memberAccountId', label: '멤버 계정 ID' }
];

const MATCH_OPTIONS: ReadonlyArray<{ value: ServiceWorkspacesSearchQuery['match']; label: string }> = [
  { value: 'exact', label: '정확히 일치' },
  { value: 'prefix', label: '접두 일치' },
  { value: 'contains', label: '포함 검색' }
];

const toSearchPayload = (value: {
  q: string;
  field: ServiceWorkspacesSearchQuery['field'];
  match: ServiceWorkspacesSearchQuery['match'];
  memberAccountId: string;
  limit: number;
}): ServiceWorkspacesSearchQuery => ({
  q: value.q.trim() || undefined,
  field: value.field,
  match: value.match,
  memberAccountId: value.memberAccountId.trim() || undefined,
  limit: value.limit,
  cursor: null
});

export function ServiceWorkspacesPanel({ workspaces, search, busy, onSearch }: ServiceWorkspacesPanelProps) {
  const [q, setQ] = useState(search.q ?? '');
  const [field, setField] = useState<ServiceWorkspacesSearchQuery['field']>(search.field);
  const [match, setMatch] = useState<ServiceWorkspacesSearchQuery['match']>(search.match);
  const [memberAccountId, setMemberAccountId] = useState(search.memberAccountId ?? '');
  const [queryBusy, setQueryBusy] = useState(false);

  useEffect(() => {
    setQ(search.q ?? '');
    setField(search.field);
    setMatch(search.match);
    setMemberAccountId(search.memberAccountId ?? '');
  }, [search.field, search.match, search.memberAccountId, search.q]);

  const disabled = busy || queryBusy;
  const listMeta = busy ? `검색 결과 ${search.total}개 · 불러오는 중` : `검색 결과 ${search.total}개`;

  const hasActiveFilter = useMemo(
    () => Boolean((search.q ?? '').trim()) || search.field !== 'any' || search.match !== 'contains' || Boolean(search.memberAccountId),
    [search.field, search.match, search.memberAccountId, search.q]
  );

  const submitSearch = async () => {
    setQueryBusy(true);
    try {
      await onSearch(
        toSearchPayload({
          q,
          field,
          match,
          memberAccountId,
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
    setMemberAccountId('');
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
                aria-label="워크스페이스 검색어"
                disabled={disabled}
              />
              <input
                className={styles.workspaceInput}
                type="text"
                value={memberAccountId}
                onChange={(event) => setMemberAccountId(event.target.value)}
                placeholder="멤버 계정 ID"
                aria-label="워크스페이스 멤버 계정 ID 필터"
                disabled={disabled}
              />
            </div>
            <div className={styles.workspaceInputRow}>
              <label className={styles.workspacePanelHint}>
                필드
                <select
                  className={styles.workspaceInput}
                  value={field}
                  onChange={(event) => setField(event.target.value as ServiceWorkspacesSearchQuery['field'])}
                  aria-label="워크스페이스 검색 필드"
                  disabled={disabled}
                >
                  {WORKSPACE_FIELD_OPTIONS.map((option) => (
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
                  onChange={(event) => setMatch(event.target.value as ServiceWorkspacesSearchQuery['match'])}
                  aria-label="워크스페이스 검색 매칭"
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
                aria-label="워크스페이스 검색 실행"
                disabled={disabled}
              >
                <Search className={styles.workspaceIcon} aria-hidden />
              </button>
              <button
                type="button"
                className={cn(styles.workspaceGhostButton, styles.workspaceIconButton)}
                aria-label="워크스페이스 검색 초기화"
                disabled={disabled || !hasActiveFilter}
                onClick={() => {
                  void resetSearch();
                }}
              >
                <RotateCcw className={styles.workspaceIcon} aria-hidden />
              </button>
            </div>
          </form>

          <WorkspaceDialogListShell title="워크스페이스" meta={listMeta} icon={<FolderKanban aria-hidden />}>
            {workspaces.length > 0 ? (
              workspaces.map((workspace) => (
                <WorkspaceDialogListItem
                  key={workspace.workspaceId}
                  main={
                    <>
                      <p className={styles.workspaceListItemTitle}>{workspace.workspaceId}</p>
                      <p className={styles.workspacePanelHint}>{workspace.name}</p>
                      <div className={styles.workspaceTagRow}>
                        <span className={styles.workspaceTag}>owner:{workspace.createdBy || '-'}</span>
                        <span className={styles.workspaceTag}>default:{workspace.defaultMemberRoleId}</span>
                      </div>
                    </>
                  }
                />
              ))
            ) : (
              <div className={styles.workspaceListEmpty}>
                <p className={styles.workspacePanelHint}>검색 조건에 맞는 워크스페이스가 없습니다.</p>
              </div>
            )}
          </WorkspaceDialogListShell>
        </>
      }
    />
  );
}
