const assert = require('node:assert/strict');

const { createAuthSessionFixture, createProjectsFixture, createProjectTreeFixture, createWorkspacesFixture } = require('./fixtures/projects');
const {
  MockEventSource,
  flushUpdates,
  installImmediateTimers,
  mountHomePage
} = require('./helpers/pageHarness');

module.exports = async () => {
  const restoreTimers = installImmediateTimers();
  const seededProjects = createProjectsFixture();
  const workspacesPayload = { ok: true, workspaces: createWorkspacesFixture() };
  const authSessionPayload = createAuthSessionFixture();
  const forestFoxProject = seededProjects.find((project) => project.name === 'Forest Fox');
  assert.ok(forestFoxProject, 'missing seeded project: Forest Fox');
  const forestFoxProjectId = forestFoxProject.projectId;

  const mounted = await mountHomePage({
    fetchImpl: async (requestUrl) => {
      const url = String(requestUrl);
      if (url === '/api/auth/me') {
        return new Response(JSON.stringify(authSessionPayload), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8'
          }
        });
      }
      if (url === '/api/workspaces') {
        return new Response(JSON.stringify(workspacesPayload), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8'
          }
        });
      }
      assert.equal(url, '/api/projects/tree?workspaceId=ws_default');
      return new Response(
        JSON.stringify({
          ok: true,
          projects: seededProjects,
          tree: createProjectTreeFixture()
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8'
          }
        }
      );
    },
    EventSourceImpl: MockEventSource
  });

  try {
    mounted.dom.window.setTimeout = globalThis.setTimeout;
    mounted.dom.window.clearTimeout = globalThis.clearTimeout;

    await flushUpdates();

    const { container } = mounted;
    const viewport = container.querySelector('[aria-label="Model viewport. Drag or use arrow keys to rotate."]');
    assert.ok(viewport, 'viewport should remain keyboard reachable after stream reconnect');
    const streamStatus = container.querySelector('[role="status"][aria-live="polite"]');
    assert.ok(streamStatus, 'stream status should expose live updates');

    const firstStream = MockEventSource.instances.at(-1);
    assert.ok(firstStream);
    assert.equal(firstStream.url, `/api/projects/${forestFoxProjectId}/stream?lastEventId=10&workspaceId=ws_default`);

    firstStream.emitMessage({
      projectId: forestFoxProjectId,
      revision: 14,
      hasGeometry: true,
      hierarchy: [],
      animations: [],
      stats: { bones: 8, cubes: 21 }
    });
    await flushUpdates();

    firstStream.emitError();
    await flushUpdates();

    const resumedStream = MockEventSource.instances.at(-1);
    assert.ok(resumedStream);
    assert.notEqual(resumedStream, firstStream);
    assert.equal(resumedStream.url, `/api/projects/${forestFoxProjectId}/stream?lastEventId=14&workspaceId=ws_default`);
  } finally {
    await mounted.cleanup();
    restoreTimers();
    MockEventSource.reset();
  }
};
