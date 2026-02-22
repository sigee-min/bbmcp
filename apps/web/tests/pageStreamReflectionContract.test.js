const assert = require('node:assert/strict');

const DEFAULT_WORKSPACE_ID = 'ws_auto_admin-en845w';

const clone = (value) => JSON.parse(JSON.stringify(value));

const createProjectsFixture = () =>
  clone([
    {
      projectId: 'prj_stream_contract',
      name: 'Stream Contract Project',
      parentFolderId: null,
      revision: 10,
      hasGeometry: true,
      hierarchy: [
        {
          id: 'bone-root',
          name: 'root',
          kind: 'bone',
          children: []
        }
      ],
      animations: [],
      stats: {
        bones: 1,
        cubes: 1
      },
      textures: []
    }
  ]);

const createProjectTreeFixture = () =>
  clone({
    maxFolderDepth: 1,
    roots: [
      {
        kind: 'project',
        projectId: 'prj_stream_contract',
        name: 'Stream Contract Project',
        parentFolderId: null,
        depth: 1,
        activeJobStatus: null
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

const { MockEventSource, dispatchInAct, emitMessageInAct, flushUpdates, mountHomePage } = require('./helpers/pageHarness');

const findAnimationButton = (root, token) =>
  Array.from(root.querySelectorAll('button')).find(
    (button) => String(button.className).includes('animationItem') && (button.textContent ?? '').includes(token)
  ) ?? null;

const findButtonByExactText = (root, text) =>
  Array.from(root.querySelectorAll('button')).find((button) => (button.textContent ?? '').trim() === text) ?? null;

module.exports = async () => {
  const projectsPayload = { ok: true, projects: createProjectsFixture(), tree: createProjectTreeFixture() };
  const workspacesPayload = { ok: true, workspaces: createWorkspacesFixture() };
  const authSessionPayload = createAuthSessionFixture();

  const mounted = await mountHomePage({
    fetchImpl: async (requestUrl) => {
      const url = String(requestUrl);
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
      assert.equal(url, `/api/projects/tree?workspaceId=${DEFAULT_WORKSPACE_ID}`);
      return new Response(JSON.stringify(projectsPayload), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    },
    EventSourceImpl: MockEventSource
  });

  try {
    await flushUpdates();
    const { container, dom } = mounted;
    const animationTab = findButtonByExactText(container, '애니메이션');
    assert.ok(animationTab);
    await dispatchInAct(animationTab, new dom.window.MouseEvent('click', { bubbles: true }));
    await flushUpdates();

    assert.equal(findAnimationButton(container, 'stream-idle'), null);

    const stream = MockEventSource.instances.at(-1);
    assert.ok(stream);
    assert.equal(
      stream.url,
      `/api/projects/prj_stream_contract/stream?lastEventId=10&workspaceId=${DEFAULT_WORKSPACE_ID}`
    );

    await emitMessageInAct(stream, {
      projectId: 'prj_stream_contract',
      revision: 11,
      hasGeometry: true,
      hierarchy: [
        {
          id: 'bone-root',
          name: 'root',
          kind: 'bone',
          children: []
        }
      ],
      animations: [
        {
          id: 'anim-stream-idle',
          name: 'stream-idle',
          length: 1.5,
          loop: true
        }
      ],
      stats: { bones: 1, cubes: 1 }
    });
    await flushUpdates();

    assert.ok(findAnimationButton(container, 'stream-idle'));
  } finally {
    await mounted.cleanup();
    MockEventSource.reset();
  }
};
