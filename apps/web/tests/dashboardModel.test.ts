import assert from 'node:assert/strict';

import {
  INSPECTOR_TABS,
  applyDashboardError,
  applyProjectStreamPayload,
  buildStreamUrl,
  createInitialDashboardState,
  createLoadedState,
  markStreamOpen,
  markStreamReconnecting,
  rotateViewer,
  selectProject,
  shouldApplyStreamPayload,
  type DashboardState,
  type ProjectSnapshot,
  type ProjectStreamPayload,
  type ProjectTreeSnapshot
} from '../src/lib/dashboardModel';

const makeProject = (input: Partial<ProjectSnapshot> & Pick<ProjectSnapshot, 'projectId' | 'name'>): ProjectSnapshot => ({
  projectId: input.projectId,
  name: input.name,
  parentFolderId: input.parentFolderId ?? null,
  revision: input.revision ?? 1,
  hasGeometry: input.hasGeometry ?? true,
  hierarchy: input.hierarchy ?? [],
  animations: input.animations ?? [],
  stats: input.stats ?? { bones: 1, cubes: 1 },
  textures: input.textures ?? []
});

const makePayload = (input: Partial<ProjectStreamPayload> & Pick<ProjectStreamPayload, 'projectId' | 'revision'>): ProjectStreamPayload => ({
  projectId: input.projectId,
  revision: input.revision,
  ...(input.parentFolderId !== undefined ? { parentFolderId: input.parentFolderId } : {}),
  hasGeometry: input.hasGeometry ?? true,
  hierarchy: input.hierarchy ?? [],
  animations: input.animations ?? [],
  stats: input.stats ?? { bones: 1, cubes: 1 },
  ...(input.activeJobStatus !== undefined ? { activeJobStatus: input.activeJobStatus } : {}),
  ...(input.projectLock ? { projectLock: input.projectLock } : {}),
  ...(input.textures ? { textures: input.textures } : {})
});

const makeTree = (projects: readonly ProjectSnapshot[]): ProjectTreeSnapshot => ({
  maxFolderDepth: 3,
  roots: projects.map((project) => ({
    kind: 'project',
    projectId: project.projectId,
    name: project.name,
    parentFolderId: project.parentFolderId,
    depth: 1,
    activeJobStatus: null
  }))
});

{
  assert.equal(INSPECTOR_TABS.length, 2);
  assert.deepEqual(
    INSPECTOR_TABS.map((tab) => tab.id),
    ['hierarchy', 'animations']
  );
  assert.deepEqual(
    INSPECTOR_TABS.map((tab) => tab.label),
    ['하이어라키', '애니메이션']
  );
}

{
  const projects = [
    makeProject({ projectId: 'project-a', name: 'A', revision: 10 }),
    makeProject({ projectId: 'project-b', name: 'B', revision: 4 })
  ] as const;
  const state = createLoadedState([...projects], makeTree(projects));

  const movedViewer = rotateViewer(state.viewer, 20, -10);
  const movedState: DashboardState = { ...state, viewer: movedViewer };
  const switched = selectProject(movedState, 'project-b');

  assert.equal(switched.selectedProjectId, 'project-b');
  assert.equal(switched.viewer.yawDeg, 0);
  assert.equal(switched.viewer.pitchDeg, 0);
}

{
  const viewer = rotateViewer(
    {
      yawDeg: 0,
      pitchDeg: 0
    },
    30,
    -10
  );
  assert.notEqual(viewer.yawDeg, 0);
  assert.notEqual(viewer.pitchDeg, 0);
}

{
  const projects = [makeProject({ projectId: 'project-a', name: 'A', revision: 10 })] as const;
  const state = createLoadedState([...projects], makeTree(projects));
  assert.equal(shouldApplyStreamPayload(state, makePayload({ projectId: 'project-a', revision: 11 })), true);
  assert.equal(shouldApplyStreamPayload(state, makePayload({ projectId: 'project-b', revision: 99 })), false);
  assert.equal(shouldApplyStreamPayload(state, makePayload({ projectId: 'project-a', revision: 10 })), false);
  assert.equal(
    shouldApplyStreamPayload(
      state,
      makePayload({
        projectId: 'project-a',
        revision: 10,
        activeJobStatus: 'running'
      })
    ),
    true
  );
}

{
  const projects = [makeProject({ projectId: 'project-a', name: 'A', revision: 10 })] as const;
  const state = createLoadedState([...projects], makeTree(projects));
  const updated = applyProjectStreamPayload(
    state,
    makePayload({
      projectId: 'project-a',
      revision: 12,
      stats: { bones: 2, cubes: 7 }
    })
  );

  assert.equal(updated.lastAppliedRevision, 12);
  assert.equal(updated.projects[0]?.stats.cubes, 7);
  assert.equal(updated.streamStatus, 'open');
}

{
  assert.equal(buildStreamUrl('project-a', -1), '/api/projects/project-a/stream');
  assert.equal(buildStreamUrl('project-a', 33), '/api/projects/project-a/stream?lastEventId=33');
}

{
  const initial = createInitialDashboardState();
  const failed = applyDashboardError(initial, 'project_load_failed');
  assert.equal(failed.status, 'error');
  assert.equal(failed.errorCode, 'project_load_failed');
}

{
  const projects = [
    makeProject({ projectId: 'project-a', name: 'A', revision: 10 }),
    makeProject({ projectId: 'project-b', name: 'B', revision: 20 })
  ] as const;
  const loaded = createLoadedState([...projects], makeTree(projects));
  const failed = applyDashboardError(loaded, 'project_load_failed');
  assert.equal(failed.status, 'success');
  assert.equal(failed.errorCode, 'project_load_failed');

  const switched = selectProject(failed, 'project-b');
  assert.equal(switched.selectedProjectId, 'project-b');
  assert.equal(switched.errorCode, null);
  assert.equal(switched.streamStatus, 'connecting');
}

{
  const projects = [makeProject({ projectId: 'project-a', name: 'A', revision: 10 })] as const;
  const state = createLoadedState([...projects], makeTree(projects));
  const stale = applyProjectStreamPayload(state, makePayload({ projectId: 'project-a', revision: 9 }));
  assert.deepEqual(stale, state);
}

{
  const projects = [makeProject({ projectId: 'project-a', name: 'A', revision: 10 })] as const;
  const state = createLoadedState([...projects], makeTree(projects));
  const reconnecting = markStreamReconnecting(state, 'project-a');
  assert.equal(reconnecting.streamStatus, 'reconnecting');
  assert.equal(reconnecting.errorCode, 'stream_unavailable');

  const opened = markStreamOpen(reconnecting, 'project-a');
  assert.equal(opened.streamStatus, 'open');
  assert.equal(opened.errorCode, null);
}

{
  const projects = [makeProject({ projectId: 'project-a', name: 'A', revision: 10 })] as const;
  const state = createLoadedState([...projects], makeTree(projects));
  const unchanged = markStreamReconnecting(state, 'project-b');
  assert.deepEqual(unchanged, state);
}
