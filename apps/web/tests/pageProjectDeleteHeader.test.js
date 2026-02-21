const assert = require('node:assert/strict');

const {
  DEFAULT_WORKSPACE_ID,
  createAuthSessionFixture,
  createProjectsFixture,
  createProjectTreeFixture,
  createWorkspacesFixture
} = require('./fixtures/projects');
const { MockEventSource, dispatchInAct, flushUpdates, mountHomePage } = require('./helpers/pageHarness');

module.exports = async () => {
  const authSessionPayload = createAuthSessionFixture();
  const projectsPayload = { ok: true, projects: createProjectsFixture(), tree: createProjectTreeFixture() };
  const workspacesPayload = { ok: true, workspaces: createWorkspacesFixture() };
  const targetProject = projectsPayload.projects.find((project) => project.name === 'Desert Lynx');
  assert.ok(targetProject);
  const deleteRequests = [];

  const mounted = await mountHomePage({
    fetchImpl: async (requestUrl, init = {}) => {
      const url = String(requestUrl);
      const method = String(init.method ?? 'GET').toUpperCase();
      if (url === '/api/auth/me') {
        return new Response(JSON.stringify(authSessionPayload), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' }
        });
      }
      if (url === '/api/workspaces') {
        return new Response(JSON.stringify(workspacesPayload), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' }
        });
      }
      if (url === `/api/projects/tree?workspaceId=${DEFAULT_WORKSPACE_ID}`) {
        return new Response(JSON.stringify(projectsPayload), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' }
        });
      }
      if (method === 'DELETE' && url === `/api/projects/${targetProject.projectId}?workspaceId=${DEFAULT_WORKSPACE_ID}`) {
        deleteRequests.push(init);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' }
        });
      }
      throw new Error(`unexpected request: ${method} ${url}`);
    },
    EventSourceImpl: MockEventSource
  });

  try {
    await flushUpdates();
    const { container, dom } = mounted;
    dom.window.confirm = () => true;

    const actionMenuButton = container.querySelector(`button[aria-label="${targetProject.name} 프로젝트 메뉴"]`);
    assert.ok(actionMenuButton);
    await dispatchInAct(actionMenuButton, new dom.window.MouseEvent('click', { bubbles: true }));
    await flushUpdates();

    const deleteButton = Array.from(container.querySelectorAll('button')).find((button) =>
      (button.textContent ?? '').includes('프로젝트 삭제')
    );
    assert.ok(deleteButton);
    await dispatchInAct(deleteButton, new dom.window.MouseEvent('click', { bubbles: true }));
    await flushUpdates();

    assert.equal(deleteRequests.length, 1);
    const deleteInit = deleteRequests[0];
    const headers = new Headers(deleteInit.headers ?? {});
    assert.equal(headers.get('content-type'), null);
    assert.equal(typeof deleteInit.body, 'undefined');
  } finally {
    await mounted.cleanup();
    MockEventSource.reset();
  }
};
