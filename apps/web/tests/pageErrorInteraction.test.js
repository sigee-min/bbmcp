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

const { MockEventSource, dispatchInAct, emitErrorInAct, flushUpdates, mountHomePage } = require('./helpers/pageHarness');

const findProjectButtonByName = (root, projectName) => {
  const buttons = root.querySelectorAll('button');
  for (const button of buttons) {
    if (button.textContent && button.textContent.includes(projectName)) {
      return button;
    }
  }
  return null;
};

const countOccurrences = (text, token) => text.split(token).length - 1;

module.exports = async () => {
  {
    let loginRequestCount = 0;
    const mounted = await mountHomePage({
      fetchImpl: async (requestUrl) => {
        const url = String(requestUrl);
        if (url === '/api/auth/me') {
          return new Response(
            JSON.stringify({
              ok: false,
              code: 'unauthorized',
              message: '로그인이 필요합니다.'
            }),
            {
              status: 401,
              headers: {
                'content-type': 'application/json; charset=utf-8'
              }
            }
          );
        }
        if (url === '/api/auth/login') {
          loginRequestCount += 1;
          return new Response(
            JSON.stringify({
              ok: false,
              code: 'gateway_unavailable',
              message: 'temporary gateway outage'
            }),
            {
              status: 503,
              headers: {
                'content-type': 'application/json; charset=utf-8'
              }
            }
          );
        }
        throw new Error(`unexpected url: ${url}`);
      },
      EventSourceImpl: MockEventSource
    });

    try {
      await flushUpdates();
      const { container, dom } = mounted;
      const loginIdInput = container.querySelector('input[name="loginId"]');
      const passwordInput = container.querySelector('input[name="password"]');
      const githubButton = container.querySelector('button[aria-label="GitHub로 로그인"]');
      assert.ok(loginIdInput);
      assert.ok(passwordInput);
      assert.ok(githubButton);
      assert.equal(githubButton.disabled, false);

      loginIdInput.value = 'admin';
      await dispatchInAct(loginIdInput, new dom.window.Event('input', { bubbles: true }));
      passwordInput.value = 'admin';
      await dispatchInAct(passwordInput, new dom.window.Event('input', { bubbles: true }));

      const loginButton = Array.from(container.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes('로컬 계정 로그인')
      );
      assert.ok(loginButton);
      await dispatchInAct(loginButton, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();

      const text = container.textContent ?? '';
      assert.equal(loginRequestCount, 1);
      assert.match(text, /백엔드 연결이 필요합니다\. gateway 서버를 실행한 뒤 다시 시도해 주세요\./);
      assert.doesNotMatch(text, /temporary gateway outage/);
      assert.doesNotMatch(text, /로그인에 실패했습니다/);
      assert.equal(
        countOccurrences(text, '백엔드 연결이 필요합니다. gateway 서버를 실행한 뒤 다시 시도해 주세요.'),
        1
      );
      const errorNotices = container.querySelectorAll('[data-ui-error-channel]');
      assert.equal(errorNotices.length, 1);
      assert.equal(errorNotices[0].getAttribute('data-ui-error-channel'), 'blocking');
    } finally {
      await mounted.cleanup();
      MockEventSource.reset();
    }
  }

  const projectPayload = { ok: true, projects: createProjectsFixture(), tree: createProjectTreeFixture() };
  const workspacesPayload = { ok: true, workspaces: createWorkspacesFixture() };
  const authSessionPayload = createAuthSessionFixture();
  const forestFoxProject = projectPayload.projects.find((project) => project.name === 'Forest Fox');
  assert.ok(forestFoxProject, 'missing seeded project: Forest Fox');
  const forestFoxProjectId = forestFoxProject.projectId;
  const desertLynxProject = projectPayload.projects.find((project) => project.name === 'Desert Lynx');
  assert.ok(desertLynxProject, 'missing seeded project: Desert Lynx');
  const desertLynxProjectId = desertLynxProject.projectId;

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
      return new Response(JSON.stringify(projectPayload), {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8'
        }
      });
    },
    EventSourceImpl: MockEventSource
  });

  try {
    await flushUpdates();

    const { container, dom } = mounted;
    const viewport = container.querySelector('[aria-label="Model viewport. Drag or use arrow keys to rotate."]');
    assert.ok(viewport, 'viewport should expose keyboard-accessible aria label');
    assert.equal(viewport.getAttribute('aria-describedby'), 'dashboard-viewport-assist');
    const streamStatus = container.querySelector('[role="status"][aria-live="polite"]');
    assert.ok(streamStatus, 'stream status should be exposed as live region');
    assert.match(streamStatus.textContent ?? '', /스트림 상태/);

    assert.ok(MockEventSource.instances.length >= 1);
    const firstStream = MockEventSource.instances.at(-1);
    assert.ok(firstStream);
    assert.equal(firstStream.url, `/api/projects/${forestFoxProjectId}/stream?lastEventId=10&workspaceId=${DEFAULT_WORKSPACE_ID}`);

    await emitErrorInAct(firstStream);
    await flushUpdates();

    const beforeClickText = container.textContent ?? '';
    assert.match(beforeClickText, /자동으로 다시 연결하는 중입니다/);

    const projectBButton = findProjectButtonByName(container, 'Desert Lynx');
    assert.ok(projectBButton, 'project list should stay visible while stream error banner is shown');
    assert.equal(projectBButton.disabled, false, 'project button should remain clickable while error is shown');

    await dispatchInAct(projectBButton, new mounted.dom.window.MouseEvent('click', { bubbles: true }));
    await flushUpdates();

    const afterClickText = container.textContent ?? '';
    assert.doesNotMatch(afterClickText, /자동으로 다시 연결하는 중입니다/);

    const nextStream = MockEventSource.instances.at(-1);
    assert.ok(nextStream);
    assert.notEqual(nextStream, firstStream);
    assert.equal(firstStream.closed, true);
    assert.equal(nextStream.url, `/api/projects/${desertLynxProjectId}/stream?lastEventId=21&workspaceId=${DEFAULT_WORKSPACE_ID}`);
  } finally {
    await mounted.cleanup();
    MockEventSource.reset();
  }
};
