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
import type { ThemeMode } from '../lib/theme';
import { buildGatewayApiUrl } from '../lib/gatewayApi';
import { cn } from '../lib/utils';
import { useDashboardStream } from './_hooks/useDashboardStream';
import { useOverlaySelection } from './_hooks/useOverlaySelection';
import { useProjectList } from './_hooks/useProjectList';
import { useProjectTreeMutations } from './_hooks/useProjectTreeMutations';
import { useThemeMode } from './_hooks/useThemeMode';
import { InspectorSidebar, type HierarchyRow } from './features/inspector/InspectorSidebar';
import { ProjectSidebar } from './features/project-tree/ProjectSidebar';
import { errorCopy } from './features/shared/dashboardCopy';
import { StateScreen } from './features/shared/StateScreen';
import { ViewportPanel, type RotateSource } from './features/viewport/ViewportPanel';
import styles from './page.module.css';

const INVERT_POINTER_STORAGE_KEY = 'ashfox.viewer.invertPointer';
const LEGACY_INVERT_X_STORAGE_KEY = 'ashfox.viewer.invertX';
const LEGACY_INVERT_Y_STORAGE_KEY = 'ashfox.viewer.invertY';
const TEXTURE_OVERLAY_ANCHOR_SELECTOR = '[data-overlay-anchor="texture"], [data-overlay="texture"]';

interface ProjectsResponse {
  ok: boolean;
  projects: readonly ProjectSnapshot[];
  tree: ProjectTreeSnapshot;
}

const flattenHierarchyRows = (nodes: readonly HierarchyNode[], depth = 0): HierarchyRow[] => {
  const rows: HierarchyRow[] = [];
  for (const node of nodes) {
    rows.push({ node, depth });
    rows.push(...flattenHierarchyRows(node.children, depth + 1));
  }
  return rows;
};

export default function HomePage() {
  const [state, setState] = useState<DashboardState>(() => createInitialDashboardState());
  const [reloadVersion, setReloadVersion] = useState(0);
  const [invertPointer, setInvertPointer] = useState(false);

  useProjectList({ setState, reloadVersion });
  useDashboardStream({ state, setState });
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
    const response = await fetch(buildGatewayApiUrl('/projects/tree'), { cache: 'no-store' });
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
  }, []);

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
  } = useProjectTreeMutations({ reloadProjectsSnapshot });

  const retryProjectLoad = useCallback(() => {
    clearMutationError();
    setReloadVersion((prev) => prev + 1);
  }, [clearMutationError]);

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
          mutationBusy={mutationBusy}
          mutationError={mutationError}
          onRetryProjectLoad={retryProjectLoad}
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
      </div>
    </main>
  );
}
