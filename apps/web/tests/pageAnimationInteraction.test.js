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

const findButtonByExactText = (root, text) =>
  Array.from(root.querySelectorAll('button')).find((button) => (button.textContent ?? '').trim() === text) ?? null;

const findAnimationItemByName = (root, token) =>
  Array.from(root.querySelectorAll('button')).find(
    (button) => String(button.className).includes('animationItem') && (button.textContent ?? '').includes(token)
  ) ?? null;

const hasOverlayControlButtons = (root) =>
  Boolean(
    root.querySelector('button[aria-label="애니메이션 재생"]') ||
      root.querySelector('button[aria-label="무한 재생 토글"]') ||
      root.querySelector('button[aria-label="애니메이션 정지"]')
  );

module.exports = async () => {
  const authSessionPayload = createAuthSessionFixture();
  const seededProjects = createProjectsFixture();
  const projectsPayload = {
    ok: true,
    projects: [
      {
        ...seededProjects[0],
        animations: [
          {
            id: 'anim-preview-a',
            name: 'preview-a',
            length: 2.4,
            loop: true
          }
        ]
      },
      {
        ...seededProjects[1],
        animations: [
          {
            id: 'anim-preview-b',
            name: 'preview-b',
            length: 3.2,
            loop: true
          }
        ]
      },
      seededProjects[2]
    ],
    tree: createProjectTreeFixture()
  };
  const workspacesPayload = { ok: true, workspaces: createWorkspacesFixture() };
  const secondProjectName = projectsPayload.projects[1].name;
  const thirdProjectName = projectsPayload.projects[2].name;

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

    const firstAnimationButton = findAnimationItemByName(container, 'preview-a');
    assert.ok(firstAnimationButton);
    assert.equal(String(firstAnimationButton.className).includes('animationItemActive'), false);
    assert.equal(hasOverlayControlButtons(container), false);

    await dispatchInAct(firstAnimationButton, new dom.window.MouseEvent('click', { bubbles: true }));
    await flushUpdates();
    assert.equal(String(firstAnimationButton.className).includes('animationItemActive'), true);
    assert.equal(hasOverlayControlButtons(container), false);

    const secondProjectButton = findButtonByExactText(container, secondProjectName);
    assert.ok(secondProjectButton);
    await dispatchInAct(secondProjectButton, new dom.window.MouseEvent('click', { bubbles: true }));
    await flushUpdates();

    const secondAnimationButton = findAnimationItemByName(container, 'preview-b');
    assert.ok(secondAnimationButton);
    assert.equal(String(secondAnimationButton.className).includes('animationItemActive'), false);

    await dispatchInAct(secondAnimationButton, new dom.window.MouseEvent('click', { bubbles: true }));
    await flushUpdates();
    assert.equal(String(secondAnimationButton.className).includes('animationItemActive'), true);
    assert.equal(hasOverlayControlButtons(container), false);

    const thirdProjectButton = findButtonByExactText(container, thirdProjectName);
    assert.ok(thirdProjectButton);
    await dispatchInAct(thirdProjectButton, new dom.window.MouseEvent('click', { bubbles: true }));
    await flushUpdates();

    assert.match(container.textContent ?? '', /애니메이션 데이터가 없습니다\./);
    assert.equal(hasOverlayControlButtons(container), false);
  } finally {
    await mounted.cleanup();
    MockEventSource.reset();
  }
};
