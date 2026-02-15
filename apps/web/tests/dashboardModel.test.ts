import assert from 'node:assert/strict';

import {
  INSPECTOR_TABS,
  applyDashboardError,
  applyProjectStreamPayload,
  buildStreamUrl,
  createInitialDashboardState,
  createLoadedState,
  getViewportCenter,
  isViewerAnchorWithinTolerance,
  markStreamOpen,
  markStreamReconnecting,
  measureViewerAnchorAlignment,
  normalizeFocusAnchor,
  rotateViewer,
  selectProject,
  shouldApplyStreamPayload,
  type DashboardState,
  type ProjectSnapshot,
  type ProjectStreamPayload
} from '../src/lib/dashboardModel';

const makeProject = (input: Partial<ProjectSnapshot> & Pick<ProjectSnapshot, 'projectId' | 'name'>): ProjectSnapshot => ({
  projectId: input.projectId,
  name: input.name,
  revision: input.revision ?? 1,
  hasGeometry: input.hasGeometry ?? true,
  focusAnchor: input.focusAnchor ?? ([0, 24, 0] as const),
  hierarchy: input.hierarchy ?? [],
  animations: input.animations ?? [],
  stats: input.stats ?? { bones: 1, cubes: 1 }
});

const makePayload = (input: Partial<ProjectStreamPayload> & Pick<ProjectStreamPayload, 'projectId' | 'revision'>): ProjectStreamPayload => ({
  projectId: input.projectId,
  revision: input.revision,
  hasGeometry: input.hasGeometry ?? true,
  focusAnchor: input.focusAnchor ?? ([0, 24, 0] as const),
  hierarchy: input.hierarchy ?? [],
  animations: input.animations ?? [],
  stats: input.stats ?? { bones: 1, cubes: 1 }
});

{
  assert.equal(INSPECTOR_TABS.length, 2);
  assert.deepEqual(
    INSPECTOR_TABS.map((tab) => tab.id),
    ['hierarchy', 'animations']
  );
}

{
  const anchor = normalizeFocusAnchor({ hasGeometry: false, focusAnchor: [11, 22, 33] });
  assert.deepEqual(anchor, [0, 0, 0]);
}

{
  const state = createLoadedState([
    makeProject({ projectId: 'project-a', name: 'A', revision: 10, focusAnchor: [0, 20, 0] }),
    makeProject({ projectId: 'project-b', name: 'B', revision: 4, focusAnchor: [3, 12, 1] })
  ]);

  const movedViewer = rotateViewer(state.viewer, 20, -10);
  const movedState: DashboardState = { ...state, viewer: movedViewer };
  const switched = selectProject(movedState, 'project-b');

  assert.equal(switched.selectedProjectId, 'project-b');
  assert.deepEqual(switched.viewer.focusAnchor, [3, 12, 1]);
  assert.equal(switched.viewer.yawDeg, 0);
  assert.equal(switched.viewer.pitchDeg, 0);
}

{
  const viewer = rotateViewer(
    {
      focusAnchor: [5, 6, 7],
      yawDeg: 0,
      pitchDeg: 0
    },
    30,
    -10
  );
  assert.deepEqual(viewer.focusAnchor, [5, 6, 7]);
  assert.notEqual(viewer.yawDeg, 0);
  assert.notEqual(viewer.pitchDeg, 0);
}

{
  const initial = createLoadedState([
    makeProject({ projectId: 'project-a', name: 'A', revision: 10, focusAnchor: [0, 20, 0] }),
    makeProject({ projectId: 'project-b', name: 'B', revision: 21, focusAnchor: [3, 12, 1] })
  ]);
  const switched = selectProject(initial, 'project-b');
  const center = getViewportCenter(290, 290);
  const aligned = measureViewerAnchorAlignment({
    viewportWidth: 290,
    viewportHeight: 290,
    renderedAnchor: center,
    expectedAnchor: [3, 12, 1],
    actualAnchor: switched.viewer.focusAnchor
  });
  assert.equal(isViewerAnchorWithinTolerance(aligned), true);

  const rotated = rotateViewer(switched.viewer, 25, -11);
  const postRotate = measureViewerAnchorAlignment({
    viewportWidth: 290,
    viewportHeight: 290,
    renderedAnchor: center,
    expectedAnchor: switched.viewer.focusAnchor,
    actualAnchor: rotated.focusAnchor
  });
  assert.equal(isViewerAnchorWithinTolerance(postRotate), true);
}

{
  const center = getViewportCenter(290, 290);
  const drifted = measureViewerAnchorAlignment({
    viewportWidth: 290,
    viewportHeight: 290,
    renderedAnchor: {
      x: center.x + 2,
      y: center.y
    },
    expectedAnchor: [0, 24, 0],
    actualAnchor: [0, 24, 0]
  });
  assert.equal(isViewerAnchorWithinTolerance(drifted), false);
}

{
  assert.equal(shouldApplyStreamPayload('project-a', 10, makePayload({ projectId: 'project-a', revision: 11 })), true);
  assert.equal(shouldApplyStreamPayload('project-a', 10, makePayload({ projectId: 'project-b', revision: 99 })), false);
  assert.equal(shouldApplyStreamPayload('project-a', 10, makePayload({ projectId: 'project-a', revision: 10 })), false);
}

{
  const state = createLoadedState([makeProject({ projectId: 'project-a', name: 'A', revision: 10 })]);
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
  const state = createLoadedState([makeProject({ projectId: 'project-a', name: 'A', revision: 10, focusAnchor: [8, 8, 8] })]);
  const updated = applyProjectStreamPayload(
    state,
    makePayload({
      projectId: 'project-a',
      revision: 11,
      hasGeometry: false
    })
  );
  assert.deepEqual(updated.viewer.focusAnchor, [0, 0, 0]);
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
  const loaded = createLoadedState([
    makeProject({ projectId: 'project-a', name: 'A', revision: 10 }),
    makeProject({ projectId: 'project-b', name: 'B', revision: 20 })
  ]);
  const failed = applyDashboardError(loaded, 'project_load_failed');
  assert.equal(failed.status, 'success');
  assert.equal(failed.errorCode, 'project_load_failed');

  const switched = selectProject(failed, 'project-b');
  assert.equal(switched.selectedProjectId, 'project-b');
  assert.equal(switched.errorCode, null);
  assert.equal(switched.streamStatus, 'connecting');
}

{
  const state = createLoadedState([makeProject({ projectId: 'project-a', name: 'A', revision: 10 })]);
  const stale = applyProjectStreamPayload(state, makePayload({ projectId: 'project-a', revision: 9 }));
  assert.deepEqual(stale, state);
}

{
  const state = createLoadedState([makeProject({ projectId: 'project-a', name: 'A', revision: 10 })]);
  const reconnecting = markStreamReconnecting(state, 'project-a');
  assert.equal(reconnecting.streamStatus, 'reconnecting');
  assert.equal(reconnecting.errorCode, 'stream_unavailable');

  const opened = markStreamOpen(reconnecting, 'project-a');
  assert.equal(opened.streamStatus, 'open');
  assert.equal(opened.errorCode, null);
}

{
  const state = createLoadedState([makeProject({ projectId: 'project-a', name: 'A', revision: 10 })]);
  const unchanged = markStreamReconnecting(state, 'project-b');
  assert.deepEqual(unchanged, state);
}
