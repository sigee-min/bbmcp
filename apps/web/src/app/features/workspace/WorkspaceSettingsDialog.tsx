import { X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  WorkspaceAclEffect,
  WorkspaceFolderAclRecord,
  WorkspaceMemberRecord,
  WorkspacePermissionKey,
  WorkspaceRoleRecord,
  WorkspaceSummary
} from '../../../lib/dashboardModel';
import { buildGatewayApiUrl } from '../../../lib/gatewayApi';
import { cn } from '../../../lib/utils';
import styles from '../../page.module.css';
import { WorkspaceFolderAclPanel } from './WorkspaceFolderAclPanel';
import { WorkspaceGeneralPanel } from './WorkspaceGeneralPanel';
import { WorkspaceMembersPanel } from './WorkspaceMembersPanel';
import { WorkspaceSettingsNav, type WorkspaceSettingsPanelId } from './WorkspaceSettingsNav';
import { WorkspaceRolesPanel } from './WorkspaceRolesPanel';

interface WorkspaceSettingsResponse {
  ok: boolean;
  workspace: WorkspaceSummary;
  roles: WorkspaceRoleRecord[];
  members: WorkspaceMemberRecord[];
  folderAcl: WorkspaceFolderAclRecord[];
}

interface WorkspaceSettingsDialogProps {
  open: boolean;
  workspace: WorkspaceSummary | null;
  requestHeaders: Record<string, string>;
  onClose: () => void;
  onWorkspaceUpdated: (workspace: WorkspaceSummary) => void;
}

type WorkspaceSettingsState = {
  workspace: WorkspaceSummary;
  roles: WorkspaceRoleRecord[];
  members: WorkspaceMemberRecord[];
  folderAcl: WorkspaceFolderAclRecord[];
};

const parseResponseMessage = (payload: unknown, status: number): string => {
  if (payload && typeof payload === 'object') {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }
  return `Request failed (${status})`;
};

const roleCanBeDeleted = (role: WorkspaceRoleRecord): boolean => role.builtin !== 'user';

export function WorkspaceSettingsDialog({
  open,
  workspace,
  requestHeaders,
  onClose,
  onWorkspaceUpdated
}: WorkspaceSettingsDialogProps) {
  const [activePanel, setActivePanel] = useState<WorkspaceSettingsPanelId>('general');
  const [settings, setSettings] = useState<WorkspaceSettingsState | null>(null);
  const [loading, setLoading] = useState(false);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    if (!workspace) {
      setSettings(null);
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(buildGatewayApiUrl(`/workspaces/${encodeURIComponent(workspace.workspaceId)}/settings`), {
        headers: requestHeaders,
        cache: 'no-store'
      });
      const payload = (await response.json()) as WorkspaceSettingsResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(parseResponseMessage(payload, response.status));
      }
      setSettings({
        workspace: payload.workspace,
        roles: payload.roles,
        members: payload.members,
        folderAcl: payload.folderAcl
      });
      onWorkspaceUpdated(payload.workspace);
    } catch (error) {
      const message = error instanceof Error ? error.message : '워크스페이스 설정을 불러오지 못했습니다.';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }, [onWorkspaceUpdated, requestHeaders, workspace]);

  useEffect(() => {
    if (!open) {
      return;
    }
    void loadSettings();
  }, [loadSettings, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setActivePanel('general');
  }, [open, workspace?.workspaceId]);

  const runMutation = useCallback(
    async (request: () => Promise<Response>) => {
      if (!workspace) {
        return;
      }
      setMutationBusy(true);
      setErrorMessage(null);
      try {
        const response = await request();
        const payload = (await response.json()) as { ok?: boolean; message?: string };
        if (!response.ok || !payload.ok) {
          throw new Error(parseResponseMessage(payload, response.status));
        }
        await loadSettings();
      } catch (error) {
        const message = error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
        setErrorMessage(message);
      } finally {
        setMutationBusy(false);
      }
    },
    [loadSettings, workspace]
  );

  const currentWorkspace = settings?.workspace ?? workspace;
  const allOpenMode = currentWorkspace?.mode === 'all_open';
  const roleOptions = settings?.roles ?? [];

  const canManageWorkspace = Boolean(currentWorkspace?.capabilities.canManageWorkspace);
  const canManageMembers = Boolean(currentWorkspace?.capabilities.canManageMembers);
  const canManageRoles = Boolean(currentWorkspace?.capabilities.canManageRoles);
  const canManageFolderAcl = Boolean(currentWorkspace?.capabilities.canManageFolderAcl);

  const panelNode = useMemo(() => {
    if (!currentWorkspace || !settings) {
      return <p className={styles.workspaceDialogEmpty}>워크스페이스를 선택해 주세요.</p>;
    }

    if (activePanel === 'general') {
      return (
        <WorkspaceGeneralPanel
          workspace={currentWorkspace}
          busy={loading}
          modeMutationBusy={mutationBusy}
          onChangeMode={(mode) => {
            if (mode === currentWorkspace.mode) {
              return;
            }
            void runMutation(() =>
              fetch(buildGatewayApiUrl(`/workspaces/${encodeURIComponent(currentWorkspace.workspaceId)}/mode`), {
                method: 'PATCH',
                headers: {
                  'content-type': 'application/json',
                  ...requestHeaders
                },
                body: JSON.stringify({ mode })
              })
            );
          }}
        />
      );
    }

    if (activePanel === 'members') {
      return (
        <WorkspaceMembersPanel
          members={settings.members}
          roles={settings.roles}
          busy={loading || mutationBusy}
          allOpenMode={allOpenMode}
          canManageMembers={canManageMembers}
          onUpsertMember={async ({ accountId, roleIds }) => {
            await runMutation(() =>
              fetch(buildGatewayApiUrl(`/workspaces/${encodeURIComponent(currentWorkspace.workspaceId)}/members`), {
                method: 'PUT',
                headers: {
                  'content-type': 'application/json',
                  ...requestHeaders
                },
                body: JSON.stringify({ accountId, roleIds })
              })
            );
          }}
          onDeleteMember={async (accountId) => {
            await runMutation(() =>
              fetch(buildGatewayApiUrl(`/workspaces/${encodeURIComponent(currentWorkspace.workspaceId)}/members/${encodeURIComponent(accountId)}`), {
                method: 'DELETE',
                headers: requestHeaders
              })
            );
          }}
        />
      );
    }

    if (activePanel === 'roles') {
      return (
        <WorkspaceRolesPanel
          roles={settings.roles}
          busy={loading || mutationBusy}
          allOpenMode={allOpenMode}
          canManageRoles={canManageRoles}
          onUpsertRole={async ({ roleId, name, permissions, builtin }) => {
            await runMutation(() =>
              fetch(buildGatewayApiUrl(`/workspaces/${encodeURIComponent(currentWorkspace.workspaceId)}/roles`), {
                method: 'PUT',
                headers: {
                  'content-type': 'application/json',
                  ...requestHeaders
                },
                body: JSON.stringify({ roleId, name, permissions, ...(builtin ? { builtin } : {}) })
              })
            );
          }}
          onDeleteRole={async (roleId) => {
            const role = settings.roles.find((entry) => entry.roleId === roleId);
            if (!role || !roleCanBeDeleted(role)) {
              return;
            }
            await runMutation(() =>
              fetch(buildGatewayApiUrl(`/workspaces/${encodeURIComponent(currentWorkspace.workspaceId)}/roles/${encodeURIComponent(roleId)}`), {
                method: 'DELETE',
                headers: requestHeaders
              })
            );
          }}
        />
      );
    }

    return (
      <WorkspaceFolderAclPanel
        folderAcl={settings.folderAcl}
        roles={roleOptions}
        busy={loading || mutationBusy}
        allOpenMode={allOpenMode}
        canManageFolderAcl={canManageFolderAcl}
        onUpsertFolderAcl={async ({ roleId, folderId, read, write }) => {
          await runMutation(() =>
            fetch(buildGatewayApiUrl(`/workspaces/${encodeURIComponent(currentWorkspace.workspaceId)}/folder-acl`), {
              method: 'PUT',
              headers: {
                'content-type': 'application/json',
                ...requestHeaders
              },
              body: JSON.stringify({ roleId, folderId, read, write })
            })
          );
        }}
        onDeleteFolderAcl={async (roleId, folderId) => {
          const query = new URLSearchParams();
          if (folderId) {
            query.set('folderId', folderId);
          }
          const suffix = query.toString();
          await runMutation(() =>
            fetch(
              buildGatewayApiUrl(
                `/workspaces/${encodeURIComponent(currentWorkspace.workspaceId)}/folder-acl/${encodeURIComponent(roleId)}${
                  suffix ? `?${suffix}` : ''
                }`
              ),
              {
                method: 'DELETE',
                headers: requestHeaders
              }
            )
          );
        }}
      />
    );
  }, [
    activePanel,
    allOpenMode,
    canManageFolderAcl,
    canManageMembers,
    canManageRoles,
    currentWorkspace,
    loading,
    mutationBusy,
    requestHeaders,
    roleOptions,
    runMutation,
    settings
  ]);

  if (!open) {
    return null;
  }

  return (
    <div className={styles.workspaceDialogOverlay} role="presentation" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="워크스페이스 관리"
        className={cn(styles.workspaceDialog)}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.workspaceDialogHeader}>
          <div>
            <h2 className={styles.workspaceDialogTitle}>워크스페이스 관리</h2>
            <p className={styles.workspaceDialogSubtitle}>{currentWorkspace?.name ?? '워크스페이스를 선택해 주세요.'}</p>
            <div className={styles.workspaceTagRow}>
              <span className={styles.workspaceTag}>mode:{currentWorkspace?.mode ?? '-'}</span>
              <span className={styles.workspaceTag}>manage:{canManageWorkspace ? 'yes' : 'no'}</span>
            </div>
          </div>
          <button type="button" className={styles.workspaceDialogClose} onClick={onClose} aria-label="닫기">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className={styles.workspaceDialogContent}>
          <WorkspaceSettingsNav activePanel={activePanel} onSelectPanel={setActivePanel} />
          <div className={styles.workspaceDialogPanel}>
            {loading && !settings ? <p className={styles.workspaceDialogEmpty}>설정을 불러오는 중입니다…</p> : panelNode}
          </div>
        </div>

        {errorMessage ? <p className={styles.workspaceDialogError}>{errorMessage}</p> : null}
      </section>
    </div>
  );
}
