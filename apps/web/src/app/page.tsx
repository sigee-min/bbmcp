import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  createLoadedState,
  createInitialDashboardState,
  isSystemManager,
  replaceProjectTree,
  rotateViewer,
  selectProject,
  setActiveTab,
  type DashboardState,
  type HierarchyNode,
  type InspectorTabId,
  type ProjectSnapshot,
  type ProjectTreeSnapshot
} from '../lib/dashboardModel';
import type { WorkspaceSummary } from '../lib/dashboardModel';
import type { ThemeMode } from '../lib/theme';
import { buildGatewayApiUrl } from '../lib/gatewayApi';
import { parseGatewayApiResponse, requestGatewayApi, resolveGatewayRequestErrorMessage } from '../lib/gatewayApiClient';
import { cn } from '../lib/utils';
import { useDashboardStream } from './_hooks/useDashboardStream';
import { useOverlaySelection } from './_hooks/useOverlaySelection';
import { useProjectList } from './_hooks/useProjectList';
import { useProjectTreeMutations } from './_hooks/useProjectTreeMutations';
import { useThemeMode } from './_hooks/useThemeMode';
import { ServiceManagementDialog } from './features/admin/ServiceManagementDialog';
import { AccountSecurityDialog } from './features/auth/AccountSecurityDialog';
import { AuthScreen } from './features/auth/AuthScreen';
import { InspectorSidebar, type HierarchyRow } from './features/inspector/InspectorSidebar';
import { ProjectSidebar } from './features/project-tree/ProjectSidebar';
import { errorCopy } from './features/shared/dashboardCopy';
import { StateScreen } from './features/shared/StateScreen';
import { useErrorChannels } from './features/shared/useErrorChannels';
import { ViewportPanel, type RotateSource } from './features/viewport/ViewportPanel';
import {
  DEFAULT_VIEWPORT_ENVIRONMENT_TEMPLATE_ID,
  resolveViewportEnvironmentTemplateId,
  type ViewportEnvironmentTemplateId
} from './features/viewport/viewportEnvironmentTemplates';
import styles from './page.module.css';
import { WorkspaceCreateDialog, type WorkspaceCreateInput } from './features/workspace/WorkspaceCreateDialog';
import { WorkspaceSettingsDialog } from './features/workspace/WorkspaceSettingsDialog';

const INVERT_POINTER_STORAGE_KEY = 'ashfox.viewer.invertPointer';
const LEGACY_INVERT_X_STORAGE_KEY = 'ashfox.viewer.invertX';
const LEGACY_INVERT_Y_STORAGE_KEY = 'ashfox.viewer.invertY';
const VIEWPORT_ENVIRONMENT_STORAGE_KEY = 'ashfox.viewer.environmentTemplate';
const TEXTURE_OVERLAY_ANCHOR_SELECTOR = '[data-overlay-anchor="texture"], [data-overlay="texture"]';

type AuthSessionUser = {
  accountId: string;
  displayName: string;
  email: string;
  systemRoles: string[];
  localLoginId: string | null;
  githubLogin: string | null;
  hasPassword: boolean;
  canSetPassword: boolean;
};

interface ProjectsResponse {
  ok: boolean;
  projects: readonly ProjectSnapshot[];
  tree: ProjectTreeSnapshot;
}

interface WorkspacesResponse {
  ok: boolean;
  workspaces: readonly WorkspaceSummary[];
}

interface SessionResponse {
  ok: boolean;
  user?: AuthSessionUser;
  githubEnabled?: boolean;
  code?: string;
  message?: string;
}

interface CreateWorkspaceResponse {
  ok: boolean;
  workspace?: WorkspaceSummary;
  code?: string;
  message?: string;
}

const toFriendlySessionError = (error: unknown): string => {
  return resolveGatewayRequestErrorMessage(error, '세션을 확인하지 못했습니다.');
};

const toFriendlyAuthError = (error: unknown, fallback: string): string => {
  return resolveGatewayRequestErrorMessage(error, fallback);
};

const areWorkspaceCapabilitiesEqual = (
  left: WorkspaceSummary['capabilities'],
  right: WorkspaceSummary['capabilities']
): boolean => left.canManageWorkspaceSettings === right.canManageWorkspaceSettings;

const areWorkspaceSummariesEqual = (left: WorkspaceSummary, right: WorkspaceSummary): boolean =>
  left.workspaceId === right.workspaceId &&
  left.name === right.name &&
  left.defaultMemberRoleId === right.defaultMemberRoleId &&
  areWorkspaceCapabilitiesEqual(left.capabilities, right.capabilities);

const buildWorkspaceScopedPath = (path: string, workspaceId: string): string => {
  const basePath = buildGatewayApiUrl(path);
  const normalized = workspaceId.trim();
  if (!normalized) {
    return basePath;
  }
  const separator = basePath.includes('?') ? '&' : '?';
  return `${basePath}${separator}workspaceId=${encodeURIComponent(normalized)}`;
};

const flattenHierarchyRows = (nodes: readonly HierarchyNode[], depth = 0): HierarchyRow[] => {
  const rows: HierarchyRow[] = [];
  for (const node of nodes) {
    rows.push({ node, depth });
    rows.push(...flattenHierarchyRows(node.children, depth + 1));
  }
  return rows;
};

export default function HomePage() {
  const [authResolved, setAuthResolved] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authUser, setAuthUser] = useState<AuthSessionUser | null>(null);
  const [githubEnabled, setGithubEnabled] = useState(false);
  const [accountSecurityOpen, setAccountSecurityOpen] = useState(false);
  const [credentialUpdateBusy, setCredentialUpdateBusy] = useState(false);
  const [credentialUpdateError, setCredentialUpdateError] = useState<string | null>(null);
  const [credentialUpdateSuccess, setCredentialUpdateSuccess] = useState<string | null>(null);
  const [state, setState] = useState<DashboardState>(() => createInitialDashboardState());
  const [reloadVersion, setReloadVersion] = useState(0);
  const [workspaces, setWorkspaces] = useState<readonly WorkspaceSummary[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceSettingsOpen, setWorkspaceSettingsOpen] = useState(false);
  const [workspaceCreateOpen, setWorkspaceCreateOpen] = useState(false);
  const [serviceManagementOpen, setServiceManagementOpen] = useState(false);
  const [workspaceCreateBusy, setWorkspaceCreateBusy] = useState(false);
  const [invertPointer, setInvertPointer] = useState(false);
  const [environmentTemplateId, setEnvironmentTemplateId] = useState<ViewportEnvironmentTemplateId>(
    DEFAULT_VIEWPORT_ENVIRONMENT_TEMPLATE_ID
  );
  const {
    panelError: authError,
    clearChannelError: clearAuthErrorChannel,
    clearAllErrors: clearAllAuthErrors,
    reportError: reportAuthError
  } = useErrorChannels();
  const {
    panelError: workspaceError,
    inlineError: workspaceCreateError,
    clearChannelError: clearWorkspaceErrorChannel,
    clearAllErrors: clearAllWorkspaceErrors,
    reportError: reportWorkspaceError
  } = useErrorChannels();
  const {
    panelError: animationError,
    clearAllErrors: clearAllAnimationErrors,
    setChannelError: setAnimationError
  } = useErrorChannels();
  const requestHeaders = useMemo(() => {
    const normalizedWorkspaceId = selectedWorkspaceId.trim();
    if (normalizedWorkspaceId.length === 0) {
      return {};
    }
    return {
      'x-ashfox-workspace-id': normalizedWorkspaceId
    };
  }, [selectedWorkspaceId]);
  const isAuthenticated = authResolved && authUser !== null;
  const workspaceSelectionReady = workspaces.length > 0 || workspaceError !== null;

  const refreshSession = useCallback(async () => {
    clearAuthErrorChannel('panel');
    try {
      const response = await fetch(buildGatewayApiUrl('/auth/me'), {
        cache: 'no-store'
      });
      if (response.status === 401) {
        setAuthUser(null);
        setGithubEnabled(true);
        return;
      }
      const payload = await parseGatewayApiResponse<SessionResponse>(response, {
        fallbackMessage: '세션을 확인하지 못했습니다.'
      });
      if (!payload.user) {
        throw new Error(payload.message ?? '세션을 확인하지 못했습니다.');
      }
      setAuthUser(payload.user);
      setGithubEnabled(payload.githubEnabled !== false);
    } catch (error) {
      setAuthUser(null);
      reportAuthError(error, toFriendlySessionError(error), 'panel');
    } finally {
      setAuthResolved(true);
    }
  }, [clearAuthErrorChannel, reportAuthError]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const handleDirectLogin = useCallback(
    async (loginId: string, password: string) => {
      setAuthBusy(true);
      clearAuthErrorChannel('panel');
      try {
        const payload = await requestGatewayApi<SessionResponse>(
          '/auth/login',
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json'
            },
            body: JSON.stringify({ loginId, password })
          },
          {
            fallbackMessage: '로그인에 실패했습니다.'
          }
        );
        if (!payload.user) {
          throw new Error(payload.message ?? '로그인에 실패했습니다.');
        }
        setAuthUser(payload.user);
      } catch (error) {
        reportAuthError(error, toFriendlyAuthError(error, '로그인에 실패했습니다.'), 'panel');
      } finally {
        setAuthBusy(false);
      }
    },
    [clearAuthErrorChannel, reportAuthError]
  );

  const handleGitHubLogin = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.location.assign(buildGatewayApiUrl('/auth/github/start'));
  }, []);

  const handleUpdateLocalCredential = useCallback(
    async (input: { loginId?: string; password?: string; passwordConfirm?: string }) => {
      if (!authUser) {
        return;
      }
      setCredentialUpdateBusy(true);
      setCredentialUpdateError(null);
      setCredentialUpdateSuccess(null);
      try {
        const payload = await requestGatewayApi<SessionResponse>(
          '/auth/local-credential',
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json'
            },
            body: JSON.stringify(input)
          },
          {
            fallbackMessage: '로컬 로그인 정보를 저장하지 못했습니다.'
          }
        );
        if (!payload.user) {
          throw new Error(payload.message ?? '로컬 로그인 정보를 저장하지 못했습니다.');
        }
        setAuthUser(payload.user);
        setCredentialUpdateSuccess('로컬 로그인 정보가 저장되었습니다.');
      } catch (error) {
        setCredentialUpdateError(toFriendlyAuthError(error, '로컬 로그인 정보를 저장하지 못했습니다.'));
      } finally {
        setCredentialUpdateBusy(false);
      }
    },
    [authUser]
  );

  const handleLogout = useCallback(async () => {
    try {
      await fetch(buildGatewayApiUrl('/auth/logout'), { method: 'POST' });
    } catch {
      // ignore logout network errors and reset local state anyway
    }
    setAuthUser(null);
    setState(createInitialDashboardState());
    setWorkspaces([]);
    setCredentialUpdateError(null);
    setCredentialUpdateSuccess(null);
    setAccountSecurityOpen(false);
    setWorkspaceSettingsOpen(false);
    setWorkspaceCreateOpen(false);
    setServiceManagementOpen(false);
    clearAllAuthErrors();
    clearAllWorkspaceErrors();
    clearAllAnimationErrors();
  }, [clearAllAnimationErrors, clearAllAuthErrors, clearAllWorkspaceErrors]);

  useEffect(() => {
    if (!isAuthenticated) {
      setWorkspaceLoading(false);
      clearAllWorkspaceErrors();
      setWorkspaces([]);
      setSelectedWorkspaceId('');
      setWorkspaceCreateOpen(false);
      return;
    }
    let cancelled = false;
    const loadWorkspaces = async () => {
      setWorkspaceLoading(true);
      clearWorkspaceErrorChannel('panel');
      try {
        const payload = await requestGatewayApi<WorkspacesResponse>(
          '/workspaces',
          {
            cache: 'no-store'
          },
          {
            fallbackMessage: '워크스페이스를 불러오지 못했습니다.'
          }
        );
        if (cancelled) {
          return;
        }
        setWorkspaces(payload.workspaces);
        setSelectedWorkspaceId((prev) => {
          if (payload.workspaces.some((workspace) => workspace.workspaceId === prev)) {
            return prev;
          }
          return payload.workspaces[0]?.workspaceId ?? '';
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : '워크스페이스를 불러오지 못했습니다.';
        reportWorkspaceError(error, message, 'panel');
      } finally {
        if (!cancelled) {
          setWorkspaceLoading(false);
        }
      }
    };
    void loadWorkspaces();
    return () => {
      cancelled = true;
    };
  }, [clearAllWorkspaceErrors, clearWorkspaceErrorChannel, isAuthenticated, reloadVersion, reportWorkspaceError]);

  useProjectList({
    setState,
    reloadVersion,
    workspaceId: selectedWorkspaceId,
    requestHeaders,
    enabled: isAuthenticated && !workspaceLoading && workspaceSelectionReady
  });
  useDashboardStream({ workspaceId: selectedWorkspaceId, state, setState });
  const { themeMode, resolvedTheme, setThemeMode } = useThemeMode();

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const persisted = window.localStorage.getItem(INVERT_POINTER_STORAGE_KEY);
    if (persisted !== null) {
      setInvertPointer(persisted === '1');
      return;
    }
    const legacyX = window.localStorage.getItem(LEGACY_INVERT_X_STORAGE_KEY) === '1';
    const legacyY = window.localStorage.getItem(LEGACY_INVERT_Y_STORAGE_KEY) === '1';
    setInvertPointer(legacyX && legacyY);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const persisted = window.localStorage.getItem(VIEWPORT_ENVIRONMENT_STORAGE_KEY);
    setEnvironmentTemplateId(resolveViewportEnvironmentTemplateId(persisted));
  }, []);

  const reloadProjectsSnapshot = useCallback(async () => {
    const response = await fetch(buildWorkspaceScopedPath('/projects/tree', selectedWorkspaceId), {
      cache: 'no-store',
      headers: requestHeaders
    });
    const payload = await parseGatewayApiResponse<ProjectsResponse>(response, {
      fallbackMessage: '프로젝트를 불러오지 못했습니다.'
    });

    setState((prev) => {
      if (prev.projects.length === 0) {
        return createLoadedState(payload.projects, payload.tree, prev.selectedProjectId);
      }
      return replaceProjectTree(prev, payload.projects, payload.tree);
    });
  }, [requestHeaders, selectedWorkspaceId]);

  const {
    mutationBusy,
    mutationError,
    clearMutationError,
    onCreateFolder,
    onCreateProject,
    onRenameFolder,
    onRenameProject,
    onDeleteFolder,
    onDeleteProject,
    onMoveFolder,
    onMoveProject
  } = useProjectTreeMutations({ workspaceId: selectedWorkspaceId, requestHeaders, reloadProjectsSnapshot });

  const retryProjectLoad = useCallback(() => {
    clearMutationError();
    setReloadVersion((prev) => prev + 1);
  }, [clearMutationError]);

  const handleWorkspaceSelect = useCallback(
    (workspaceId: string) => {
      if (!workspaceId || workspaceId === selectedWorkspaceId) {
        return;
      }
      clearMutationError();
      setState(createInitialDashboardState());
      setSelectedWorkspaceId(workspaceId);
    },
    [clearMutationError, selectedWorkspaceId]
  );

  const handleProjectSelect = useCallback((projectId: string) => {
    setState((prev) => selectProject(prev, projectId));
  }, []);

  const handleInspectorTabSelect = useCallback((tabId: InspectorTabId) => {
    setState((prev) => setActiveTab(prev, tabId));
  }, []);

  const handleViewerRotate = useCallback(
    (deltaX: number, deltaY: number, source: RotateSource) => {
      const adjustedX = source === 'pointer' && invertPointer ? -deltaX : deltaX;
      const adjustedY = source === 'pointer' && invertPointer ? -deltaY : deltaY;
      setState((prev) => ({
        ...prev,
        viewer: rotateViewer(prev.viewer, adjustedX, adjustedY)
      }));
    },
    [invertPointer]
  );

  const handleThemeModeChange = useCallback(
    (mode: ThemeMode) => {
      setThemeMode(mode);
    },
    [setThemeMode]
  );

  const handleOpenAccountSecurity = useCallback(() => {
    setCredentialUpdateError(null);
    setCredentialUpdateSuccess(null);
    setAccountSecurityOpen(true);
  }, []);

  const handleOpenWorkspaceCreate = useCallback(() => {
    clearWorkspaceErrorChannel('inline');
    setWorkspaceCreateOpen(true);
  }, [clearWorkspaceErrorChannel]);
  const handleOpenWorkspaceSettings = useCallback(() => {
    setWorkspaceSettingsOpen(true);
  }, []);
  const handleOpenServiceManagement = useCallback(() => {
    setServiceManagementOpen(true);
  }, []);

  const toggleInvertPointer = useCallback(() => {
    setInvertPointer((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(INVERT_POINTER_STORAGE_KEY, next ? '1' : '0');
        window.localStorage.removeItem(LEGACY_INVERT_X_STORAGE_KEY);
        window.localStorage.removeItem(LEGACY_INVERT_Y_STORAGE_KEY);
      }
      return next;
    });
  }, []);

  const handleEnvironmentTemplateSelect = useCallback((templateId: ViewportEnvironmentTemplateId) => {
    const normalized = resolveViewportEnvironmentTemplateId(templateId);
    setEnvironmentTemplateId(normalized);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(VIEWPORT_ENVIRONMENT_STORAGE_KEY, normalized);
    }
  }, []);

  const selectedProject = useMemo(() => {
    if (state.selectedProjectId === null) {
      return null;
    }
    return state.projects.find((project) => project.projectId === state.selectedProjectId) ?? null;
  }, [state.projects, state.selectedProjectId]);
  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.workspaceId === selectedWorkspaceId) ?? null,
    [selectedWorkspaceId, workspaces]
  );
  const upsertWorkspaceSummary = useCallback((workspace: WorkspaceSummary) => {
    setWorkspaces((prev) => {
      const existing = prev.find((entry) => entry.workspaceId === workspace.workspaceId);
      if (existing) {
        if (areWorkspaceSummariesEqual(existing, workspace)) {
          return prev;
        }
        return prev.map((entry) => (entry.workspaceId === workspace.workspaceId ? workspace : entry));
      }
      return [...prev, workspace];
    });
  }, []);
  const handleWorkspaceUpdated = useCallback(
    (workspace: WorkspaceSummary) => {
      upsertWorkspaceSummary(workspace);
    },
    [upsertWorkspaceSummary]
  );
  const handleCreateWorkspace = useCallback(
    async (input: WorkspaceCreateInput) => {
      setWorkspaceCreateBusy(true);
      clearWorkspaceErrorChannel('inline');
      try {
        const payload = await requestGatewayApi<CreateWorkspaceResponse>(
          '/workspaces',
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...requestHeaders
            },
            body: JSON.stringify(input)
          },
          {
            fallbackMessage: '워크스페이스를 생성하지 못했습니다.'
          }
        );
        if (!payload.workspace) {
          throw new Error(payload.message ?? '워크스페이스를 생성하지 못했습니다.');
        }
        upsertWorkspaceSummary(payload.workspace);
        setWorkspaceCreateOpen(false);
        handleWorkspaceSelect(payload.workspace.workspaceId);
      } catch (error) {
        const message = error instanceof Error ? error.message : '워크스페이스를 생성하지 못했습니다.';
        reportWorkspaceError(error, message, 'inline');
      } finally {
        setWorkspaceCreateBusy(false);
      }
    },
    [clearWorkspaceErrorChannel, handleWorkspaceSelect, reportWorkspaceError, requestHeaders, upsertWorkspaceSummary]
  );
  const canManageService = isSystemManager(authUser?.systemRoles);
  const canCreateWorkspace = canManageService;
  useEffect(() => {
    if (canManageService) {
      return;
    }
    setServiceManagementOpen(false);
  }, [canManageService]);
  const projectListLoading = state.status === 'loading' && state.projects.length === 0;
  const projectListError = state.status === 'error' && state.projects.length === 0 ? errorCopy.project_load_failed : null;
  const projectTextures = selectedProject?.textures ?? [];
  const projectAnimations = selectedProject?.animations ?? [];

  const {
    selectedTexture,
    textureOverlayTexture,
    selectedAnimation,
    selectedAnimationId,
    animationPlaying,
    handleTextureSelect,
    handleAnimationSelect
  } = useOverlaySelection({
    selectedProjectId: state.selectedProjectId,
    projectTextures,
    projectAnimations,
    textureOverlayAnchorSelector: TEXTURE_OVERLAY_ANCHOR_SELECTOR
  });

  const hierarchyRows = useMemo(
    () => (selectedProject && state.activeTab === 'hierarchy' ? flattenHierarchyRows(selectedProject.hierarchy) : []),
    [selectedProject, state.activeTab]
  );

  const handleAnimationPlaybackNoticeChange = useCallback(
    (notice: string | null) => {
      setAnimationError('panel', notice);
    },
    [setAnimationError]
  );

  if (!authResolved) {
    return <StateScreen title="Ashfox" description="로그인 세션을 확인하는 중입니다." loading />;
  }

  if (!authUser) {
    return (
      <AuthScreen
        githubEnabled={githubEnabled}
        busy={authBusy}
        errorMessage={authError}
        themeMode={themeMode}
        resolvedTheme={resolvedTheme}
        onThemeModeChange={handleThemeModeChange}
        onLogin={handleDirectLogin}
        onGitHubLogin={handleGitHubLogin}
      />
    );
  }

  return (
    <main className={cn('layout', styles.shell)}>
      <div className={cn('layout', styles.layout)}>
        <ProjectSidebar
          projectTree={state.projectTree}
          selectedProjectId={state.selectedProjectId}
          streamStatus={state.streamStatus}
          projectListLoading={projectListLoading}
          projectListError={projectListError}
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          workspaceLoading={workspaceLoading}
          workspaceError={workspaceError}
          mutationBusy={mutationBusy}
          mutationError={mutationError}
          onRetryProjectLoad={retryProjectLoad}
          canCreateWorkspace={canCreateWorkspace}
          canManageService={canManageService}
          onOpenWorkspaceCreate={handleOpenWorkspaceCreate}
          onOpenServiceManagement={handleOpenServiceManagement}
          onOpenWorkspaceSettings={handleOpenWorkspaceSettings}
          onOpenAccountSecurity={handleOpenAccountSecurity}
          onLogout={handleLogout}
          onSelectWorkspace={handleWorkspaceSelect}
          onSelectProject={handleProjectSelect}
          onThemeModeChange={handleThemeModeChange}
          themeMode={themeMode}
          onCreateFolder={onCreateFolder}
          onCreateProject={onCreateProject}
          onRenameFolder={onRenameFolder}
          onRenameProject={onRenameProject}
          onDeleteFolder={onDeleteFolder}
          onDeleteProject={onDeleteProject}
          onMoveFolder={onMoveFolder}
          onMoveProject={onMoveProject}
        />
        <ViewportPanel
          selectedProject={selectedProject}
          workspaceId={selectedWorkspaceId}
          streamStatus={state.streamStatus}
          viewer={state.viewer}
          errorCode={state.errorCode}
          animationErrorMessage={animationError}
          selectedTexture={textureOverlayTexture}
          selectedAnimationId={selectedAnimation?.id ?? null}
          selectedAnimationName={selectedAnimation?.name ?? null}
          animationPlaying={animationPlaying}
          invertPointer={invertPointer}
          environmentTemplateId={environmentTemplateId}
          onToggleInvertPointer={toggleInvertPointer}
          onSelectEnvironmentTemplate={handleEnvironmentTemplateSelect}
          onRotateViewer={handleViewerRotate}
          onAnimationPlaybackNoticeChange={handleAnimationPlaybackNoticeChange}
        />
        <InspectorSidebar
          selectedProject={selectedProject}
          hierarchyRows={hierarchyRows}
          selectedAnimationId={selectedAnimationId}
          textures={projectTextures}
          selectedTextureId={selectedTexture?.textureId ?? null}
          activeTab={state.activeTab}
          onSelectTab={handleInspectorTabSelect}
          onSelectAnimation={handleAnimationSelect}
          onSelectTexture={handleTextureSelect}
        />
        <WorkspaceSettingsDialog
          open={workspaceSettingsOpen}
          workspace={selectedWorkspace}
          projectTree={state.projectTree}
          currentAccountId={authUser.accountId}
          requestHeaders={requestHeaders}
          onClose={() => setWorkspaceSettingsOpen(false)}
          onWorkspaceUpdated={handleWorkspaceUpdated}
        />
        <WorkspaceCreateDialog
          open={workspaceCreateOpen}
          busy={workspaceCreateBusy}
          errorMessage={workspaceCreateError}
          onClose={() => setWorkspaceCreateOpen(false)}
          onCreate={handleCreateWorkspace}
        />
        <ServiceManagementDialog
          open={serviceManagementOpen && canManageService}
          currentUserName={authUser.displayName}
          currentUserSystemRoles={authUser.systemRoles}
          requestHeaders={requestHeaders}
          onClose={() => setServiceManagementOpen(false)}
        />
        <AccountSecurityDialog
          open={accountSecurityOpen}
          user={authUser}
          busy={credentialUpdateBusy}
          errorMessage={credentialUpdateError}
          successMessage={credentialUpdateSuccess}
          onClose={() => setAccountSecurityOpen(false)}
          onSubmit={handleUpdateLocalCredential}
        />
      </div>
    </main>
  );
}
