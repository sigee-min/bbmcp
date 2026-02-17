'use client';

import { useMemo, useState } from 'react';

import { DashboardCenterPanel } from './_components/DashboardCenterPanel';
import { InspectorPanel } from './_components/InspectorPanel';
import { ProjectSidebar } from './_components/ProjectSidebar';
import { StateCard } from './_components/StateCard';
import { useDashboardStream } from './_hooks/useDashboardStream';
import { useProjectList } from './_hooks/useProjectList';
import { createInitialDashboardState, rotateViewer, selectProject, setActiveTab, type DashboardState } from '../lib/dashboardModel';
import styles from './page.module.css';

export default function HomePage() {
  const [state, setState] = useState<DashboardState>(() => createInitialDashboardState());
  const [reloadVersion, setReloadVersion] = useState(0);

  useProjectList({ setState, reloadVersion });
  useDashboardStream({ state, setState });

  const retryProjectLoad = () => {
    setReloadVersion((prev) => prev + 1);
  };

  const selectedProject = useMemo(() => {
    if (state.selectedProjectId === null) {
      return null;
    }
    return state.projects.find((project) => project.projectId === state.selectedProjectId) ?? null;
  }, [state.projects, state.selectedProjectId]);

  if (state.status === 'loading' && state.projects.length === 0) {
    return <StateCard title="Ashfox Native Dashboard" message="프로젝트 목록을 불러오는 중입니다." />;
  }

  if (state.status === 'error' && state.projects.length === 0) {
    return (
      <StateCard
        title="Ashfox Native Dashboard"
        message="프로젝트를 불러오지 못했습니다."
        tone="error"
        actionLabel="다시 시도"
        onAction={retryProjectLoad}
      />
    );
  }

  if (state.status === 'empty') {
    return (
      <StateCard
        title="Ashfox Native Dashboard"
        message="표시할 프로젝트가 없습니다."
        actionLabel="프로젝트 다시 불러오기"
        onAction={retryProjectLoad}
      />
    );
  }

  return (
    <main className={styles.layout}>
      <div className={styles.sidebarArea}>
        <ProjectSidebar
          projects={state.projects}
          selectedProjectId={state.selectedProjectId}
          onSelectProject={(projectId) => setState((prev) => selectProject(prev, projectId))}
        />
      </div>
      <div className={styles.centerArea}>
        <DashboardCenterPanel
          selectedProjectName={selectedProject?.name ?? null}
          streamStatus={state.streamStatus}
          errorCode={state.errorCode}
          viewer={state.viewer}
          hasGeometry={Boolean(selectedProject?.hasGeometry)}
          onRotate={(deltaX, deltaY) =>
            setState((prev) => ({
              ...prev,
              viewer: rotateViewer(prev.viewer, deltaX, deltaY)
            }))
          }
        />
      </div>
      <div className={styles.inspectorArea}>
        <InspectorPanel
          activeTab={state.activeTab}
          selectedProject={selectedProject}
          onSelectTab={(tabId) => setState((prev) => setActiveTab(prev, tabId))}
        />
      </div>
    </main>
  );
}
