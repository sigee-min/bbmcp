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

const {
  MockEventSource,
  emitErrorInAct,
  emitMessageInAct,
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
      assert.equal(url, `/api/projects/tree?workspaceId=${DEFAULT_WORKSPACE_ID}`);
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
    assert.equal(firstStream.url, `/api/projects/${forestFoxProjectId}/stream?lastEventId=10&workspaceId=${DEFAULT_WORKSPACE_ID}`);

    await emitMessageInAct(firstStream, {
      projectId: forestFoxProjectId,
      revision: 14,
      hasGeometry: true,
      hierarchy: [],
      animations: [],
      stats: { bones: 8, cubes: 21 }
    });
    await flushUpdates();

    await emitErrorInAct(firstStream);
    await flushUpdates();

    const resumedStream = MockEventSource.instances.at(-1);
    assert.ok(resumedStream);
    assert.notEqual(resumedStream, firstStream);
    assert.equal(resumedStream.url, `/api/projects/${forestFoxProjectId}/stream?lastEventId=14&workspaceId=${DEFAULT_WORKSPACE_ID}`);

    await emitMessageInAct(resumedStream, {
      projectId: forestFoxProjectId,
      revision: 15,
      hasGeometry: true,
      hierarchy: [],
      animations: [],
      stats: { bones: 8, cubes: 22 }
    });
    await flushUpdates();

    await emitErrorInAct(resumedStream);
    await flushUpdates();

    const resumedAgainStream = MockEventSource.instances.at(-1);
    assert.ok(resumedAgainStream);
    assert.notEqual(resumedAgainStream, resumedStream);
    assert.equal(resumedAgainStream.url, `/api/projects/${forestFoxProjectId}/stream?lastEventId=15&workspaceId=${DEFAULT_WORKSPACE_ID}`);
  } finally {
    await mounted.cleanup();
    restoreTimers();
    MockEventSource.reset();
  }
};
