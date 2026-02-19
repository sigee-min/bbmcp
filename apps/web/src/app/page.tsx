import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  createLoadedState,
  createInitialDashboardState,
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
import { cn } from '../lib/utils';
import { useDashboardStream } from './_hooks/useDashboardStream';
import { useOverlaySelection } from './_hooks/useOverlaySelection';
import { useProjectList } from './_hooks/useProjectList';
import { useProjectTreeMutations } from './_hooks/useProjectTreeMutations';
import { useThemeMode } from './_hooks/useThemeMode';
import { AccountSecurityDialog } from './features/auth/AccountSecurityDialog';
import { AuthScreen } from './features/auth/AuthScreen';
import { InspectorSidebar, type HierarchyRow } from './features/inspector/InspectorSidebar';
import { ProjectSidebar } from './features/project-tree/ProjectSidebar';
import { errorCopy } from './features/shared/dashboardCopy';
import { StateScreen } from './features/shared/StateScreen';
import { ViewportPanel, type RotateSource } from './features/viewport/ViewportPanel';
import styles from './page.module.css';
import { WorkspaceSettingsDialog } from './features/workspace/WorkspaceSettingsDialog';

const INVERT_POINTER_STORAGE_KEY = 'ashfox.viewer.invertPointer';
const LEGACY_INVERT_X_STORAGE_KEY = 'ashfox.viewer.invertX';
const LEGACY_INVERT_Y_STORAGE_KEY = 'ashfox.viewer.invertY';
const TEXTURE_OVERLAY_ANCHOR_SELECTOR = '[data-overlay-anchor="texture"], [data-overlay="texture"]';
const DEFAULT_WORKSPACE_ID = 'ws_default';

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
  message?: string;
}

const parseApiErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  try {
    const payload = (await response.json()) as { message?: unknown };
    if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
      return payload.message;
    }
    return fallback;
  } catch {
    return fallback;
  }
};

const areWorkspaceCapabilitiesEqual = (
  left: WorkspaceSummary['capabilities'],
  right: WorkspaceSummary['capabilities']
): boolean =>
  left.canManageWorkspace === right.canManageWorkspace &&
  left.canManageMembers === right.canManageMembers &&
  left.canManageRoles === right.canManageRoles &&
  left.canManageFolderAcl === right.canManageFolderAcl;

const areWorkspaceSummariesEqual = (left: WorkspaceSummary, right: WorkspaceSummary): boolean =>
  left.workspaceId === right.workspaceId &&
  left.name === right.name &&
  left.mode === right.mode &&
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
  const [authError, setAuthError] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<AuthSessionUser | null>(null);
  const [githubEnabled, setGithubEnabled] = useState(false);
  const [accountSecurityOpen, setAccountSecurityOpen] = useState(false);
  const [credentialUpdateBusy, setCredentialUpdateBusy] = useState(false);
  const [credentialUpdateError, setCredentialUpdateError] = useState<string | null>(null);
  const [credentialUpdateSuccess, setCredentialUpdateSuccess] = useState<string | null>(null);
  const [state, setState] = useState<DashboardState>(() => createInitialDashboardState());
  const [reloadVersion, setReloadVersion] = useState(0);
  const [workspaces, setWorkspaces] = useState<readonly WorkspaceSummary[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(DEFAULT_WORKSPACE_ID);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceSettingsOpen, setWorkspaceSettingsOpen] = useState(false);
  const [invertPointer, setInvertPointer] = useState(false);
  const requestHeaders = useMemo(
    () => ({
      'x-ashfox-workspace-id': selectedWorkspaceId
    }),
    [selectedWorkspaceId]
  );
  const isAuthenticated = authResolved && authUser !== null;
  const workspaceSelectionReady = workspaces.length > 0 || workspaceError !== null;

  const refreshSession = useCallback(async () => {
    setAuthError(null);
    try {
      const response = await fetch(buildGatewayApiUrl('/auth/me'), {
        cache: 'no-store'
      });
      if (response.status === 401) {
        setAuthUser(null);
        setGithubEnabled(true);
        return;
      }
      if (!response.ok) {
        throw new Error(await parseApiErrorMessage(response, '세션을 확인하지 못했습니다.'));
      }
      const payload = (await response.json()) as SessionResponse;
      if (!payload.ok || !payload.user) {
        throw new Error(payload.message ?? '세션을 확인하지 못했습니다.');
      }
      setAuthUser(payload.user);
      setGithubEnabled(payload.githubEnabled !== false);
    } catch (error) {
      setAuthUser(null);
      setAuthError(error instanceof Error ? error.message : '세션을 확인하지 못했습니다.');
    } finally {
      setAuthResolved(true);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const handleDirectLogin = useCallback(
    async (loginId: string, password: string) => {
      setAuthBusy(true);
      setAuthError(null);
      try {
        const response = await fetch(buildGatewayApiUrl('/auth/login'), {
          method: 'POST',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({ loginId, password })
        });
        if (!response.ok) {
          throw new Error(await parseApiErrorMessage(response, '로그인에 실패했습니다.'));
        }
        const payload = (await response.json()) as SessionResponse;
        if (!payload.ok || !payload.user) {
          throw new Error(payload.message ?? '로그인에 실패했습니다.');
        }
        setAuthUser(payload.user);
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : '로그인에 실패했습니다.');
      } finally {
        setAuthBusy(false);
      }
    },
    []
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
        const response = await fetch(buildGatewayApiUrl('/auth/local-credential'), {
          method: 'POST',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify(input)
        });
        if (!response.ok) {
          throw new Error(await parseApiErrorMessage(response, '로컬 로그인 정보를 저장하지 못했습니다.'));
        }
        const payload = (await response.json()) as SessionResponse;
        if (!payload.ok || !payload.user) {
          throw new Error(payload.message ?? '로컬 로그인 정보를 저장하지 못했습니다.');
        }
        setAuthUser(payload.user);
        setCredentialUpdateSuccess('로컬 로그인 정보가 저장되었습니다.');
      } catch (error) {
        setCredentialUpdateError(error instanceof Error ? error.message : '로컬 로그인 정보를 저장하지 못했습니다.');
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
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setWorkspaceLoading(false);
      setWorkspaceError(null);
      setWorkspaces([]);
      setSelectedWorkspaceId(DEFAULT_WORKSPACE_ID);
      return;
    }
    let cancelled = false;
    const loadWorkspaces = async () => {
      setWorkspaceLoading(true);
      setWorkspaceError(null);
      try {
        const response = await fetch(buildGatewayApiUrl('/workspaces'), {
          cache: 'no-store'
        });
        if (!response.ok) {
          throw new Error(await parseApiErrorMessage(response, `workspace list failed: ${response.status}`));
        }
        const payload = (await response.json()) as WorkspacesResponse;
        if (!payload.ok) {
          throw new Error('workspace list failed');
        }
        if (cancelled) {
          return;
        }
        setWorkspaces(payload.workspaces);
        setSelectedWorkspaceId((prev) => {
          if (payload.workspaces.some((workspace) => workspace.workspaceId === prev)) {
            return prev;
          }
          return payload.workspaces[0]?.workspaceId ?? DEFAULT_WORKSPACE_ID;
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : '워크스페이스를 불러오지 못했습니다.';
        setWorkspaceError(message);
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
  }, [isAuthenticated, reloadVersion]);

  useProjectList({
    setState,
    reloadVersion,
    workspaceId: selectedWorkspaceId,
    requestHeaders,
    enabled: isAuthenticated && !workspaceLoading && workspaceSelectionReady
  });
  useDashboardStream({ workspaceId: selectedWorkspaceId, state, setState });
  const { themeMode, setThemeMode } = useThemeMode();

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

  const reloadProjectsSnapshot = useCallback(async () => {
    const response = await fetch(buildWorkspaceScopedPath('/projects/tree', selectedWorkspaceId), {
      cache: 'no-store',
      headers: requestHeaders
    });
    if (!response.ok) {
      throw new Error(`project list failed: ${response.status}`);
    }

    const payload = (await response.json()) as ProjectsResponse;
    if (!payload.ok) {
      throw new Error('project list failed');
    }

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
  const handleWorkspaceUpdated = useCallback((workspace: WorkspaceSummary) => {
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
  const canManageWorkspace = Boolean(
    selectedWorkspace?.capabilities.canManageWorkspace ||
      selectedWorkspace?.capabilities.canManageMembers ||
      selectedWorkspace?.capabilities.canManageRoles ||
      selectedWorkspace?.capabilities.canManageFolderAcl
  );

  const projectTextures = selectedProject?.textures ?? [];
  const projectAnimations = selectedProject?.animations ?? [];

  const {
    selectedTexture,
    textureOverlayTexture,
    selectedAnimation,
    selectedAnimationId,
    animationPlaybackMode,
    animationLoopEnabled,
    handleTextureSelect,
    handleAnimationSelect,
    handlePlayAnimation,
    handleStopAnimation,
    toggleAnimationLoop
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

  if (!authResolved) {
    return <StateScreen title="Ashfox Dashboard" description="로그인 세션을 확인하는 중입니다." loading />;
  }

  if (!authUser) {
    return (
      <AuthScreen
        githubEnabled={githubEnabled}
        busy={authBusy}
        errorMessage={authError}
        onLogin={handleDirectLogin}
        onGitHubLogin={handleGitHubLogin}
      />
    );
  }

  if (state.status === 'loading' && state.projects.length === 0) {
    return <StateScreen title="Ashfox Dashboard" description="프로젝트 목록을 불러오는 중입니다." loading />;
  }

  if (state.status === 'error' && state.projects.length === 0) {
    return (
      <StateScreen
        title="Ashfox Dashboard"
        description={errorCopy.project_load_failed}
        destructive
        actionLabel="다시 시도"
        onAction={retryProjectLoad}
      />
    );
  }

  if (state.status === 'empty') {
    return (
      <StateScreen
        title="Ashfox Dashboard"
        description="표시할 프로젝트가 없습니다."
        actionLabel="프로젝트 다시 불러오기"
        actionVariant="secondary"
        onAction={retryProjectLoad}
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
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          workspaceLoading={workspaceLoading}
          workspaceError={workspaceError}
          canManageWorkspace={canManageWorkspace}
          mutationBusy={mutationBusy}
          mutationError={mutationError}
          onRetryProjectLoad={retryProjectLoad}
          onOpenWorkspaceSettings={() => setWorkspaceSettingsOpen(true)}
          onOpenAccountSecurity={handleOpenAccountSecurity}
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
          streamStatus={state.streamStatus}
          viewer={state.viewer}
          errorCode={state.errorCode}
          selectedTexture={textureOverlayTexture}
          selectedAnimation={selectedAnimation}
          animationPlaybackMode={animationPlaybackMode}
          animationLoopEnabled={animationLoopEnabled}
          invertPointer={invertPointer}
          onToggleInvertPointer={toggleInvertPointer}
          onRotateViewer={handleViewerRotate}
          onPlayAnimation={handlePlayAnimation}
          onStopAnimation={handleStopAnimation}
          onToggleAnimationLoop={toggleAnimationLoop}
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
          requestHeaders={requestHeaders}
          onClose={() => setWorkspaceSettingsOpen(false)}
          onWorkspaceUpdated={handleWorkspaceUpdated}
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
        <button className={styles.logoutButton} type="button" onClick={() => void handleLogout()}>
          로그아웃
        </button>
      </div>
    </main>
  );
}
