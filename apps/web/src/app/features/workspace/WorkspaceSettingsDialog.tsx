import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ProjectTreeSnapshot, WorkspaceApiKeyRecord, WorkspaceSummary } from '../../../lib/dashboardModel';
import { buildGatewayApiUrl } from '../../../lib/gatewayApi';
import styles from '../../page.module.css';
import { ManagementDialogFrame } from '../shared/ManagementDialogFrame';
import { useErrorChannels } from '../shared/useErrorChannels';
import { WorkspaceApiKeysPanel } from './WorkspaceApiKeysPanel';
import { WorkspaceFolderAclPanel } from './WorkspaceFolderAclPanel';
import { WorkspaceGeneralPanel } from './WorkspaceGeneralPanel';
import { WorkspaceMembersPanel } from './WorkspaceMembersPanel';
import {
  createWorkspaceApiKey,
  listWorkspaceApiKeys,
  loadWorkspaceSettingsBundle,
  revokeWorkspaceApiKey,
  runWorkspaceMutation,
  type WorkspaceSettingsBundle
} from './workspaceSettingsApi';
import {
  toWorkspaceFolderOptions,
  toWorkspaceMemberCandidateOptions,
  toWorkspaceRoleOptions
} from './workspaceOptionMappers';
import {
  buildWorkspaceSettingsPanelModels,
  type WorkspaceSettingsPanelId
} from './WorkspaceSettingsPanels';
import { WorkspaceSettingsNav } from './WorkspaceSettingsNav';
import { WorkspaceRolesPanel } from './WorkspaceRolesPanel';

interface WorkspaceSettingsDialogProps {
  open: boolean;
  workspace: WorkspaceSummary | null;
  projectTree: ProjectTreeSnapshot;
  currentAccountId: string | null;
  requestHeaders: Record<string, string>;
  onClose: () => void;
  onWorkspaceUpdated: (workspace: WorkspaceSummary) => void;
}

type WorkspaceSettingsState = WorkspaceSettingsBundle;
const MAX_ACTIVE_API_KEYS = 10;

export function WorkspaceSettingsDialog({
  open,
  workspace,
  projectTree,
  currentAccountId,
  requestHeaders,
  onClose,
  onWorkspaceUpdated
}: WorkspaceSettingsDialogProps) {
  const [activePanel, setActivePanel] = useState<WorkspaceSettingsPanelId>('general');
  const [settings, setSettings] = useState<WorkspaceSettingsState | null>(null);
  const [apiKeys, setApiKeys] = useState<WorkspaceApiKeyRecord[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mutationBusy, setMutationBusy] = useState(false);
  const { panelError, clearChannelError, clearAllErrors, reportError } = useErrorChannels();

  const loadSettings = useCallback(async () => {
    if (!workspace) {
      setSettings(null);
      return;
    }
    setLoading(true);
    clearChannelError('panel');
    try {
      const settingsPayload = await loadWorkspaceSettingsBundle(workspace.workspaceId, requestHeaders);
      setSettings(settingsPayload);
      onWorkspaceUpdated(settingsPayload.workspace);
    } catch (error) {
      reportError(error, '워크스페이스 설정을 불러오지 못했습니다.', 'panel');
    } finally {
      setLoading(false);
    }
  }, [clearChannelError, onWorkspaceUpdated, reportError, requestHeaders, workspace]);

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
      clearChannelError('panel');
      try {
        await runWorkspaceMutation(request);
        await loadSettings();
      } catch (error) {
        reportError(error, '요청을 처리하지 못했습니다.', 'panel');
      } finally {
        setMutationBusy(false);
      }
    },
    [clearChannelError, loadSettings, reportError, workspace]
  );

  const currentWorkspace = settings?.workspace ?? workspace;
  const roleOptions = useMemo(() => toWorkspaceRoleOptions(settings?.roles ?? []), [settings?.roles]);
  const roleMemberCountMap = useMemo(() => {
    const counts = new Map<string, number>();
    for (const member of settings?.members ?? []) {
      for (const roleId of new Set(member.roleIds)) {
        counts.set(roleId, (counts.get(roleId) ?? 0) + 1);
      }
    }
    return counts;
  }, [settings?.members]);
  const memberCandidateOptions = useMemo(
    () => toWorkspaceMemberCandidateOptions(settings?.memberCandidates ?? []),
    [settings?.memberCandidates]
  );
  const folderOptions = useMemo(() => toWorkspaceFolderOptions(projectTree), [projectTree]);

  const canManageWorkspaceSettings = Boolean(currentWorkspace?.capabilities.canManageWorkspaceSettings);
  const canManageMembers = canManageWorkspaceSettings;
  const canManageRoles = canManageWorkspaceSettings;
  const canManageFolderAcl = canManageWorkspaceSettings;
  const canManageApiKeys = Boolean(currentWorkspace?.workspaceId);
  const activeApiKeyCount = useMemo(() => apiKeys.filter((apiKey) => !apiKey.revokedAt).length, [apiKeys]);
  const loadApiKeys = useCallback(async () => {
    if (!workspace) {
      setApiKeys([]);
      return;
    }
    setApiKeysLoading(true);
    clearChannelError('panel');
    try {
      const records = await listWorkspaceApiKeys(workspace.workspaceId, requestHeaders);
      setApiKeys(records);
    } catch (error) {
      reportError(error, 'API 키 목록을 불러오지 못했습니다.', 'panel');
    } finally {
      setApiKeysLoading(false);
    }
  }, [clearChannelError, reportError, requestHeaders, workspace]);

  useEffect(() => {
    if (!open) {
      setApiKeys([]);
      setApiKeysLoading(false);
      clearAllErrors();
      return;
    }
    setApiKeys([]);
    setApiKeysLoading(false);
  }, [clearAllErrors, open, workspace?.workspaceId]);

  useEffect(() => {
    if (!open || activePanel !== 'apiKeys') {
      return;
    }
    void loadApiKeys();
  }, [activePanel, loadApiKeys, open]);

  const panelMetaById = useMemo(() => {
    if (!currentWorkspace || !settings) {
      return {
        general: '정보 확인',
        members: '0명',
        roles: '0개',
        folderAcl: '0개',
        apiKeys: `${activeApiKeyCount}/${MAX_ACTIVE_API_KEYS}`
      } as const;
    }
    return {
      general: currentWorkspace.name || '워크스페이스',
      members: `${settings.members.length}명`,
      roles: `${settings.roles.length}개`,
      folderAcl: `${settings.aclRules.length}개`,
      apiKeys: `${activeApiKeyCount}/${MAX_ACTIVE_API_KEYS}`
    } as const;
  }, [activeApiKeyCount, currentWorkspace, settings]);

  const panelModels = useMemo(
    () =>
      buildWorkspaceSettingsPanelModels({
        canManageWorkspaceSettings,
        canManageApiKeys
      }, panelMetaById),
    [canManageApiKeys, canManageWorkspaceSettings, panelMetaById]
  );
  const visiblePanels = useMemo(() => panelModels.filter((panel) => panel.visible), [panelModels]);

  useEffect(() => {
    if (!open || visiblePanels.length === 0) {
      return;
    }
    if (visiblePanels.some((panel) => panel.id === activePanel)) {
      return;
    }
    setActivePanel(visiblePanels[0].id);
  }, [activePanel, open, visiblePanels]);

  const handleSelectPanel = useCallback(
    (panelId: WorkspaceSettingsPanelId) => {
      clearChannelError('panel');
      setActivePanel(panelId);
    },
    [clearChannelError]
  );

  const panelNode = useMemo(() => {
    if (!currentWorkspace || !settings) {
      return <p className={styles.workspaceDialogEmpty}>워크스페이스를 선택해 주세요.</p>;
    }

    if (activePanel === 'general') {
      return <WorkspaceGeneralPanel workspace={currentWorkspace} busy={loading} />;
    }

    if (activePanel === 'members') {
      return (
        <WorkspaceMembersPanel
          members={settings.members}
          roles={roleOptions}
          memberCandidates={memberCandidateOptions}
          defaultMemberRoleId={currentWorkspace.defaultMemberRoleId}
          currentAccountId={currentAccountId}
          busy={loading || mutationBusy}
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
          roleMemberCountMap={roleMemberCountMap}
          defaultMemberRoleId={currentWorkspace.defaultMemberRoleId}
          busy={loading || mutationBusy}
          canManageRoles={canManageRoles}
          onUpsertRole={async ({ roleId, name }) => {
            await runMutation(() =>
              fetch(buildGatewayApiUrl(`/workspaces/${encodeURIComponent(currentWorkspace.workspaceId)}/roles`), {
                method: 'PUT',
                headers: {
                  'content-type': 'application/json',
                  ...requestHeaders
                },
                body: JSON.stringify({
                  ...(typeof roleId === 'string' && roleId.trim().length > 0 ? { roleId } : {}),
                  name
                })
              })
            );
          }}
          onSetDefaultMemberRole={async (roleId) => {
            await runMutation(() =>
              fetch(buildGatewayApiUrl(`/workspaces/${encodeURIComponent(currentWorkspace.workspaceId)}/default-member-role`), {
                method: 'PATCH',
                headers: {
                  'content-type': 'application/json',
                  ...requestHeaders
                },
                body: JSON.stringify({ roleId })
              })
            );
          }}
          onDeleteRole={async (roleId) => {
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

    if (activePanel === 'apiKeys') {
      return (
        <WorkspaceApiKeysPanel
          apiKeys={apiKeys}
          busy={loading || mutationBusy || apiKeysLoading}
          canManageApiKeys={canManageApiKeys}
          maxActiveKeys={MAX_ACTIVE_API_KEYS}
          onCreateApiKey={async ({ name, expiresAt }) => {
            setMutationBusy(true);
            clearChannelError('panel');
            try {
              const created = await createWorkspaceApiKey(currentWorkspace.workspaceId, requestHeaders, { name, expiresAt });
              await loadApiKeys();
              return created;
            } catch (error) {
              const message = error instanceof Error ? error.message : 'API 키를 발급하지 못했습니다.';
              reportError(error, message, 'panel');
              throw new Error(message);
            } finally {
              setMutationBusy(false);
            }
          }}
          onRevokeApiKey={async ({ keyId }) => {
            setMutationBusy(true);
            clearChannelError('panel');
            try {
              const next = await revokeWorkspaceApiKey(currentWorkspace.workspaceId, requestHeaders, keyId);
              setApiKeys(next);
            } catch (error) {
              reportError(error, 'API 키를 폐기하지 못했습니다.', 'panel');
            } finally {
              setMutationBusy(false);
            }
          }}
        />
      );
    }

    return (
      <WorkspaceFolderAclPanel
        aclRules={settings.aclRules}
        roles={roleOptions}
        folderOptions={folderOptions}
        busy={loading || mutationBusy}
        canManageFolderAcl={canManageFolderAcl}
        onUpsertAclRule={async ({ ruleId, roleIds, folderId, read, write }) => {
          await runMutation(() =>
            fetch(buildGatewayApiUrl(`/workspaces/${encodeURIComponent(currentWorkspace.workspaceId)}/acl-rules`), {
              method: 'PUT',
              headers: {
                'content-type': 'application/json',
                ...requestHeaders
              },
              body: JSON.stringify({
                ...(typeof ruleId === 'string' && ruleId.trim().length > 0 ? { ruleId } : {}),
                roleIds,
                folderId,
                read,
                write
              })
            })
          );
        }}
        onDeleteAclRule={async ({ ruleId }) => {
          await runMutation(() =>
            fetch(buildGatewayApiUrl(`/workspaces/${encodeURIComponent(currentWorkspace.workspaceId)}/acl-rules`), {
              method: 'DELETE',
              headers: {
                'content-type': 'application/json',
                ...requestHeaders
              },
              body: JSON.stringify({ ruleId })
            })
          );
        }}
      />
    );
  }, [
    activePanel,
    apiKeys,
    apiKeysLoading,
    canManageFolderAcl,
    canManageApiKeys,
    canManageMembers,
    canManageRoles,
    currentWorkspace,
    currentAccountId,
    folderOptions,
    loadApiKeys,
    loading,
    memberCandidateOptions,
    mutationBusy,
    clearChannelError,
    reportError,
    requestHeaders,
    roleMemberCountMap,
    roleOptions,
    runMutation,
    settings
  ]);

  return (
    <ManagementDialogFrame
      open={open}
      ariaLabel="워크스페이스 관리"
      title="워크스페이스 관리"
      subtitle={currentWorkspace?.name ?? '워크스페이스를 선택해 주세요.'}
      onClose={onClose}
      nav={<WorkspaceSettingsNav panels={visiblePanels} activePanel={activePanel} onSelectPanel={handleSelectPanel} />}
      panel={loading && !settings ? <p className={styles.workspaceDialogEmpty}>설정을 불러오는 중입니다…</p> : panelNode}
      errorMessage={panelError}
    />
  );
}
