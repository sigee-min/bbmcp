'use client';

import type { CSSProperties, ReactElement } from 'react';
import { useMemo, useState } from 'react';

import { DashboardViewport } from './_components/DashboardViewport';
import { useDashboardStream } from './_hooks/useDashboardStream';
import { useProjectList } from './_hooks/useProjectList';
import {
  INSPECTOR_TABS,
  createInitialDashboardState,
  rotateViewer,
  selectProject,
  setActiveTab,
  type DashboardState,
  type HierarchyNode
} from '../lib/dashboardModel';

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  gridTemplateColumns: '280px minmax(0, 1fr) 360px',
  background: 'radial-gradient(circle at 10% 10%, #1e293b 0%, #0b1120 45%, #020617 100%)'
};

const sidebarStyle: CSSProperties = {
  borderRight: '1px solid #1f2937',
  padding: 18,
  display: 'flex',
  flexDirection: 'column',
  gap: 12
};

const centerPanelStyle: CSSProperties = {
  padding: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 16
};

const inspectorStyle: CSSProperties = {
  borderLeft: '1px solid #1f2937',
  padding: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 12
};

const stateCardStyle: CSSProperties = {
  maxWidth: 520,
  margin: '56px auto',
  border: '1px solid #334155',
  borderRadius: 14,
  padding: 20,
  background: 'rgba(15, 23, 42, 0.85)'
};

const renderHierarchyRows = (nodes: readonly HierarchyNode[], depth = 0): ReactElement[] => {
  const rows: ReactElement[] = [];
  for (const node of nodes) {
    rows.push(
      <div
        key={node.id}
        style={{
          padding: '6px 0 6px 10px',
          marginLeft: depth * 14,
          borderLeft: '1px solid #334155',
          fontSize: 13,
          color: node.kind === 'bone' ? '#e2e8f0' : '#93c5fd'
        }}
      >
        <strong style={{ color: '#f8fafc' }}>{node.name}</strong>
        <span style={{ marginLeft: 8, color: '#94a3b8' }}>{node.kind}</span>
      </div>
    );
    rows.push(...renderHierarchyRows(node.children, depth + 1));
  }
  return rows;
};

export default function HomePage() {
  const [state, setState] = useState<DashboardState>(() => createInitialDashboardState());

  useProjectList({ setState });
  useDashboardStream({ state, setState });

  const selectedProject = useMemo(() => {
    if (state.selectedProjectId === null) {
      return null;
    }
    return state.projects.find((project) => project.projectId === state.selectedProjectId) ?? null;
  }, [state.projects, state.selectedProjectId]);

  if (state.status === 'loading' && state.projects.length === 0) {
    return (
      <main style={stateCardStyle}>
        <h1 style={{ marginTop: 0 }}>Ashfox Native Dashboard</h1>
        <p style={{ marginBottom: 0, color: '#94a3b8' }}>loading</p>
      </main>
    );
  }

  if (state.status === 'error' && state.projects.length === 0) {
    return (
      <main style={stateCardStyle}>
        <h1 style={{ marginTop: 0 }}>Ashfox Native Dashboard</h1>
        <p style={{ color: '#fecaca', marginBottom: 0 }}>
          failed to load projects (<code>{state.errorCode}</code>)
        </p>
      </main>
    );
  }

  if (state.status === 'empty') {
    return (
      <main style={stateCardStyle}>
        <h1 style={{ marginTop: 0 }}>Ashfox Native Dashboard</h1>
        <p style={{ color: '#94a3b8', marginBottom: 0 }}>empty: no projects</p>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <section style={sidebarStyle}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Projects</h2>
        <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>Native Ashfox only</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {state.projects.map((project) => {
            const selected = project.projectId === state.selectedProjectId;
            return (
              <button
                key={project.projectId}
                onClick={() => setState((prev) => selectProject(prev, project.projectId))}
                type="button"
                style={{
                  border: selected ? '1px solid #60a5fa' : '1px solid #334155',
                  borderRadius: 10,
                  padding: 12,
                  textAlign: 'left',
                  background: selected ? 'rgba(30, 64, 175, 0.45)' : 'rgba(15, 23, 42, 0.72)',
                  color: '#e2e8f0',
                  cursor: 'pointer'
                }}
              >
                <strong>{project.name}</strong>
                <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8' }}>
                  rev {project.revision} · bones {project.stats.bones} · cubes {project.stats.cubes}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section style={centerPanelStyle}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            border: '1px solid #334155',
            borderRadius: 10,
            padding: '8px 12px',
            fontSize: 13
          }}
        >
          <span>{selectedProject?.name ?? 'No project selected'}</span>
          <span style={{ color: state.streamStatus === 'reconnecting' ? '#fbbf24' : '#93c5fd' }}>
            stream: {state.streamStatus}
          </span>
        </div>

        {state.errorCode !== null ? (
          <div
            style={{
              border: '1px solid #f59e0b',
              background: 'rgba(120, 53, 15, 0.28)',
              color: '#fcd34d',
              borderRadius: 10,
              padding: '8px 12px',
              fontSize: 13
            }}
          >
            {state.errorCode === 'stream_unavailable'
              ? 'stream_unavailable: reconnecting'
              : 'project_load_failed: showing last known project list'}
          </div>
        ) : null}

        <DashboardViewport
          viewer={state.viewer}
          hasGeometry={Boolean(selectedProject?.hasGeometry)}
          onRotate={(deltaX, deltaY) =>
            setState((prev) => ({
              ...prev,
              viewer: rotateViewer(prev.viewer, deltaX, deltaY)
            }))
          }
        />
      </section>

      <aside style={inspectorStyle}>
        <div style={{ display: 'flex', gap: 8 }}>
          {INSPECTOR_TABS.map((tab) => {
            const selected = tab.id === state.activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setState((prev) => setActiveTab(prev, tab.id))}
                style={{
                  border: selected ? '1px solid #60a5fa' : '1px solid #334155',
                  background: selected ? 'rgba(59, 130, 246, 0.24)' : 'transparent',
                  color: '#e2e8f0',
                  borderRadius: 999,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: 13
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div
          style={{
            border: '1px solid #334155',
            borderRadius: 12,
            padding: 12,
            overflow: 'auto',
            minHeight: 520,
            background: 'rgba(15, 23, 42, 0.85)'
          }}
        >
          {state.activeTab === 'hierarchy' ? (
            selectedProject && selectedProject.hierarchy.length > 0 ? (
              <div>{renderHierarchyRows(selectedProject.hierarchy)}</div>
            ) : (
              <p style={{ margin: 0, color: '#94a3b8' }}>하이어라키 데이터가 없습니다.</p>
            )
          ) : selectedProject && selectedProject.animations.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectedProject.animations.map((animation) => (
                <div
                  key={animation.id}
                  style={{
                    border: '1px solid #334155',
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 13
                  }}
                >
                  <strong>{animation.name}</strong>
                  <div style={{ marginTop: 4, color: '#94a3b8' }}>
                    length {animation.length}s · {animation.loop ? 'loop' : 'once'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, color: '#94a3b8' }}>애니메이션 데이터가 없습니다.</p>
          )}
        </div>
      </aside>
    </main>
  );
}
