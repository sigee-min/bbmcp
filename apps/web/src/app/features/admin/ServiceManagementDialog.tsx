import { useCallback, useEffect, useMemo, useState } from 'react';

import { normalizeSystemRoles } from '../../../lib/dashboardModel';
import { cn } from '../../../lib/utils';
import styles from '../../page.module.css';
import { ManagementDialogFrame } from '../shared/ManagementDialogFrame';
import { useErrorChannels } from '../shared/useErrorChannels';
import {
  buildServiceManagementPanelModels,
  type ServiceManagementPanelId
} from './ServiceManagementPanels';
import { ServiceIntegrationsPanel } from './ServiceIntegrationsPanel';
import { ServiceUsersPanel } from './ServiceUsersPanel';
import { ServiceWorkspacesPanel } from './ServiceWorkspacesPanel';
import {
  loadServiceManagementBundle,
  listServiceUserWorkspaces,
  searchServiceUsers,
  searchServiceWorkspaces,
  setServiceUserRoles,
  upsertServiceGithubAuthSettings,
  upsertServiceSmtpSettings,
  type ServiceManagementBundle,
  type ServiceUsersSearchQuery,
  type ServiceWorkspacesSearchQuery
} from './serviceManagementApi';

interface ServiceManagementDialogProps {
  open: boolean;
  currentUserName: string;
  currentUserSystemRoles: readonly string[];
  requestHeaders: Record<string, string>;
  onClose: () => void;
}

export function ServiceManagementDialog({
  open,
  currentUserName,
  currentUserSystemRoles,
  requestHeaders,
  onClose
}: ServiceManagementDialogProps) {
  const [activePanel, setActivePanel] = useState<ServiceManagementPanelId>('workspaces');
  const [bundle, setBundle] = useState<ServiceManagementBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [mutationBusy, setMutationBusy] = useState(false);
  const { panelError, clearChannelError, clearAllErrors, reportError } = useErrorChannels();

  const actorRoles = useMemo(() => normalizeSystemRoles(currentUserSystemRoles), [currentUserSystemRoles]);
  const isSystemAdmin = actorRoles.includes('system_admin');

  const loadBundle = useCallback(async () => {
    setLoading(true);
    clearChannelError('panel');
    try {
      const next = await loadServiceManagementBundle(requestHeaders);
      setBundle(next);
    } catch (error) {
      reportError(error, '서비스 관리 정보를 불러오지 못했습니다.', 'panel');
    } finally {
      setLoading(false);
    }
  }, [clearChannelError, reportError, requestHeaders]);

  useEffect(() => {
    if (!open) {
      clearAllErrors();
      return;
    }
    setActivePanel('workspaces');
    void loadBundle();
  }, [clearAllErrors, loadBundle, open]);

  const panelMetaById = useMemo(
    () => ({
      workspaces: bundle ? `${bundle.workspacesSearch.total}개` : '로딩',
      users: bundle ? `${bundle.usersSearch.total}명` : '로딩',
      integrations: bundle
        ? bundle.canEditConfig && isSystemAdmin
          ? '편집 가능'
          : '읽기 전용'
        : '로딩'
    }),
    [bundle, isSystemAdmin]
  );

  const panelModels = useMemo(
    () =>
      buildServiceManagementPanelModels({
        panelMetaById
      }),
    [panelMetaById]
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

  const handleSearchWorkspaces = useCallback(
    async (query: ServiceWorkspacesSearchQuery) => {
      setMutationBusy(true);
      clearChannelError('panel');
      try {
        const result = await searchServiceWorkspaces(query, requestHeaders);
        setBundle((prev) => {
          if (!prev) {
            return prev;
          }
          return {
            ...prev,
            workspaces: result.workspaces,
            workspacesSearch: result.search
          };
        });
      } catch (error) {
        reportError(error, '워크스페이스 검색에 실패했습니다.', 'panel');
        throw error;
      } finally {
        setMutationBusy(false);
      }
    },
    [clearChannelError, reportError, requestHeaders]
  );

  const handleSearchUsers = useCallback(
    async (query: ServiceUsersSearchQuery) => {
      setMutationBusy(true);
      clearChannelError('panel');
      try {
        const result = await searchServiceUsers(query, requestHeaders);
        setBundle((prev) => {
          if (!prev) {
            return prev;
          }
          return {
            ...prev,
            users: result.users,
            usersSearch: result.search,
            guards: result.guards
          };
        });
      } catch (error) {
        reportError(error, '유저 검색에 실패했습니다.', 'panel');
        throw error;
      } finally {
        setMutationBusy(false);
      }
    },
    [clearChannelError, reportError, requestHeaders]
  );

  const handleLoadUserWorkspaces = useCallback(
    async (accountId: string) => listServiceUserWorkspaces(accountId, requestHeaders),
    [requestHeaders]
  );

  const handleSetUserRoles = useCallback(
    async (accountId: string, systemRoles: string[]) => {
      setMutationBusy(true);
      clearChannelError('panel');
      try {
        const updated = await setServiceUserRoles(accountId, systemRoles, requestHeaders);
        setBundle((prev) => {
          if (!prev) {
            return prev;
          }
          const users = prev.users.map((entry) => (entry.accountId === updated.accountId ? updated : entry));
          const currentSystemAdminCount = users.filter((user) => user.systemRoles.includes('system_admin')).length;
          return {
            ...prev,
            users,
            guards: {
              ...prev.guards,
              currentSystemAdminCount
            }
          };
        });
      } catch (error) {
        reportError(error, '시스템 역할을 변경하지 못했습니다.', 'panel');
        throw error;
      } finally {
        setMutationBusy(false);
      }
    },
    [clearChannelError, reportError, requestHeaders]
  );

  const handleSaveSmtp = useCallback(
    async (input: {
      enabled: boolean;
      host: string;
      port: number | null;
      secure: boolean;
      username: string;
      password: string;
      fromEmail: string;
      fromName: string;
    }) => {
      setMutationBusy(true);
      clearChannelError('panel');
      try {
        const settings = await upsertServiceSmtpSettings(input, requestHeaders);
        setBundle((prev) => (prev ? { ...prev, settings } : prev));
      } catch (error) {
        reportError(error, 'SMTP 설정을 저장하지 못했습니다.', 'panel');
        throw error;
      } finally {
        setMutationBusy(false);
      }
    },
    [clearChannelError, reportError, requestHeaders]
  );

  const handleSaveGithub = useCallback(
    async (input: {
      enabled: boolean;
      clientId: string;
      clientSecret: string;
      callbackUrl: string;
      scopes: string;
    }) => {
      setMutationBusy(true);
      clearChannelError('panel');
      try {
        const settings = await upsertServiceGithubAuthSettings(input, requestHeaders);
        setBundle((prev) => (prev ? { ...prev, settings } : prev));
      } catch (error) {
        reportError(error, 'GitHub 설정을 저장하지 못했습니다.', 'panel');
        throw error;
      } finally {
        setMutationBusy(false);
      }
    },
    [clearChannelError, reportError, requestHeaders]
  );

  const panelNode = useMemo(() => {
    if (!bundle) {
      if (loading) {
        return <p className={styles.workspaceDialogEmpty}>서비스 관리 정보를 불러오는 중입니다.</p>;
      }
      return (
        <p className={styles.workspaceDialogEmpty}>
          {panelError ? '서비스 관리 정보를 다시 불러와 주세요.' : '서비스 관리 정보를 불러오지 못했습니다.'}
        </p>
      );
    }

    if (activePanel === 'workspaces') {
      return (
        <ServiceWorkspacesPanel
          workspaces={bundle.workspaces}
          search={bundle.workspacesSearch}
          busy={loading || mutationBusy}
          onSearch={handleSearchWorkspaces}
        />
      );
    }

    if (activePanel === 'users') {
      return (
        <ServiceUsersPanel
          users={bundle.users}
          search={bundle.usersSearch}
          busy={loading || mutationBusy}
          canManageUsers={isSystemAdmin}
          minimumSystemAdminCount={bundle.guards.minimumSystemAdminCount}
          currentSystemAdminCount={bundle.guards.currentSystemAdminCount}
          onSearch={handleSearchUsers}
          onLoadUserWorkspaces={handleLoadUserWorkspaces}
          onSetRoles={handleSetUserRoles}
        />
      );
    }

    return (
      <ServiceIntegrationsPanel
        settings={bundle.settings}
        busy={loading || mutationBusy}
        canEditConfig={bundle.canEditConfig && isSystemAdmin}
        onSaveSmtp={handleSaveSmtp}
        onSaveGithub={handleSaveGithub}
      />
    );
  }, [
    activePanel,
    bundle,
    handleLoadUserWorkspaces,
    handleSearchUsers,
    handleSearchWorkspaces,
    handleSaveGithub,
    handleSaveSmtp,
    handleSetUserRoles,
    isSystemAdmin,
    loading,
    mutationBusy,
    panelError
  ]);

  return (
    <ManagementDialogFrame
      open={open}
      ariaLabel="서비스 관리"
      title="서비스 관리"
      subtitle={`운영 관리자: ${currentUserName}`}
      onClose={onClose}
      errorMessage={panelError}
      nav={
        <nav className={styles.workspaceSettingsNav} aria-label="서비스 관리 메뉴">
          {visiblePanels.map((panel) => {
            const selected = panel.id === activePanel;
            const PanelIcon = panel.icon;
            return (
              <button
                key={panel.id}
                type="button"
                className={cn(styles.workspaceSettingsNavItem, selected && styles.workspaceSettingsNavItemActive)}
                onClick={() => {
                  clearChannelError('panel');
                  setActivePanel(panel.id);
                }}
                aria-current={selected ? 'page' : undefined}
              >
                <span className={styles.workspaceSettingsNavItemHeader}>
                  <PanelIcon className={styles.workspaceSettingsNavItemIcon} aria-hidden />
                  <span className={styles.workspaceSettingsNavItemLabel}>{panel.label}</span>
                </span>
                <span className={styles.workspaceSettingsNavItemMeta}>{panel.meta}</span>
              </button>
            );
          })}
        </nav>
      }
      panel={panelNode}
    />
  );
}
