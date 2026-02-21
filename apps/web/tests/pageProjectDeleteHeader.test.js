const assert = require('node:assert/strict');

const DEFAULT_WORKSPACE_ID = 'ws_auto_admin-en845w';

const clone = (value) => JSON.parse(JSON.stringify(value));

const createProjectsFixture = () =>
  clone([
    {
      projectId: 'prj_0990edef709a',
      name: 'Forest Fox',
      parentFolderId: 'fld_samples',
      revision: 10,
      hasGeometry: true,
      hierarchy: [
        {
          id: 'bone-root',
          name: 'root',
          kind: 'bone',
          children: [
            {
              id: 'bone-body',
              name: 'body',
              kind: 'bone',
              children: []
            }
          ]
        }
      ],
      animations: [],
      stats: {
        bones: 8,
        cubes: 21
      },
      textures: []
    },
    {
      projectId: 'prj_95cb32d1c4f6',
      name: 'Desert Lynx',
      parentFolderId: 'fld_samples',
      revision: 21,
      hasGeometry: true,
      hierarchy: [],
      animations: [],
      stats: {
        bones: 5,
        cubes: 13
      },
      textures: []
    },
    {
      projectId: 'prj_2ca5f18b3df5',
      name: 'Empty Template',
      parentFolderId: 'fld_templates',
      revision: 3,
      hasGeometry: false,
      hierarchy: [],
      animations: [],
      stats: {
        bones: 0,
        cubes: 0
      },
      textures: []
    }
  ]);

const createProjectTreeFixture = () =>
  clone({
    maxFolderDepth: 3,
    roots: [
      {
        kind: 'folder',
        folderId: 'fld_samples',
        name: 'Samples',
        parentFolderId: null,
        depth: 1,
        children: [
          {
            kind: 'project',
            projectId: 'prj_0990edef709a',
            name: 'Forest Fox',
            parentFolderId: 'fld_samples',
            depth: 2,
            activeJobStatus: null
          },
          {
            kind: 'project',
            projectId: 'prj_95cb32d1c4f6',
            name: 'Desert Lynx',
            parentFolderId: 'fld_samples',
            depth: 2,
            activeJobStatus: null
          },
          {
            kind: 'folder',
            folderId: 'fld_templates',
            name: 'Templates',
            parentFolderId: 'fld_samples',
            depth: 2,
            children: [
              {
                kind: 'project',
                projectId: 'prj_2ca5f18b3df5',
                name: 'Empty Template',
                parentFolderId: 'fld_templates',
                depth: 3,
                activeJobStatus: null
              }
            ]
          }
        ]
      }
    ]
  });

const createWorkspacesFixture = () =>
  clone([
    {
      workspaceId: DEFAULT_WORKSPACE_ID,
      name: 'Administrator Workspace',
      defaultMemberRoleId: 'role_user',
      capabilities: {
        canManageWorkspaceSettings: true
      }
    }
  ]);

const createServiceWorkspacesFixture = () =>
  clone(
    createWorkspacesFixture().map((workspace) => ({
      workspaceId: workspace.workspaceId,
      name: workspace.name,
      defaultMemberRoleId: workspace.defaultMemberRoleId,
      createdBy: 'system',
      createdAt: '2026-02-21T00:00:00.000Z',
      updatedAt: '2026-02-21T00:00:00.000Z'
    }))
  );

const createAuthSessionFixture = () =>
  clone({
    ok: true,
    githubEnabled: true,
    user: {
      accountId: 'admin',
      displayName: 'Administrator',
      email: 'admin@ashfox.local',
      systemRoles: ['system_admin'],
      localLoginId: 'admin',
      githubLogin: null,
      hasPassword: true,
      canSetPassword: false
    }
  });

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
