const assert = require('node:assert/strict');
const React = require('react');
const { act } = React;
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

const { MockEventSource, flushUpdates, mountHomePage } = require('./helpers/pageHarness');

module.exports = async () => {
  const projectsPayload = { ok: true, projects: createProjectsFixture(), tree: createProjectTreeFixture() };
  const workspacesPayload = { ok: true, workspaces: createWorkspacesFixture() };
  {
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
        if (url === `/api/projects/tree?workspaceId=${DEFAULT_WORKSPACE_ID}`) {
          return new Response(JSON.stringify(projectsPayload), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        throw new Error(`unexpected url: ${url}`);
      },
      EventSourceImpl: MockEventSource
    });

    try {
      await flushUpdates();
      const { container, dom } = mounted;
      const sidebarMenuButton = container.querySelector('button[aria-label="사이드바 설정"]');
      assert.ok(sidebarMenuButton);
      await act(async () => {
        sidebarMenuButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      });
      await flushUpdates();
      const sidebarSettingsMenu = container.querySelector('[role="menu"][aria-label="사이드바 설정 메뉴"]');
      assert.ok(sidebarSettingsMenu);
      assert.match(sidebarSettingsMenu.textContent ?? '', /서비스 관리/);
      assert.doesNotMatch(sidebarSettingsMenu.textContent ?? '', /워크스페이스 관리/);

      const accountSecurityButton = Array.from(container.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes('계정 보안')
      );
      assert.ok(accountSecurityButton);
      await act(async () => {
        accountSecurityButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      });
      await flushUpdates();

      const dialog = container.querySelector('[role="dialog"][aria-label="계정 보안"]');
      assert.ok(dialog);
      assert.match(container.textContent ?? '', /변경할 항목이 없습니다/);

      const saveButton = Array.from(dialog.querySelectorAll('button')).find((button) => (button.textContent ?? '').includes('저장'));
      assert.ok(saveButton);
      assert.equal(saveButton.disabled, true);
    } finally {
      await mounted.cleanup();
      MockEventSource.reset();
    }
  }

  {
    const authSessionPayload = createAuthSessionFixture();
    authSessionPayload.user.localLoginId = null;
    authSessionPayload.user.githubLogin = 'octocat';
    authSessionPayload.user.hasPassword = false;
    authSessionPayload.user.canSetPassword = true;
    const credentialRequests = [];

    const mounted = await mountHomePage({
      fetchImpl: async (requestUrl, init = {}) => {
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
        if (url === `/api/projects/tree?workspaceId=${DEFAULT_WORKSPACE_ID}`) {
          return new Response(JSON.stringify(projectsPayload), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' }
          });
        }
        if (url === '/api/auth/local-credential') {
          const body = JSON.parse(String(init.body ?? '{}'));
          credentialRequests.push(body);
          return new Response(
            JSON.stringify({
              ok: true,
              user: {
                ...authSessionPayload.user,
                localLoginId: body.loginId ?? null,
                hasPassword: true
              }
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json; charset=utf-8' }
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
      const sidebarMenuButton = container.querySelector('button[aria-label="사이드바 설정"]');
      assert.ok(sidebarMenuButton);
      await act(async () => {
        sidebarMenuButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      });
      await flushUpdates();
      const sidebarSettingsMenu = container.querySelector('[role="menu"][aria-label="사이드바 설정 메뉴"]');
      assert.ok(sidebarSettingsMenu);
      assert.match(sidebarSettingsMenu.textContent ?? '', /서비스 관리/);
      assert.doesNotMatch(sidebarSettingsMenu.textContent ?? '', /워크스페이스 관리/);

      const accountSecurityButton = Array.from(container.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes('계정 보안')
      );
      assert.ok(accountSecurityButton);
      await act(async () => {
        accountSecurityButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      });
      await flushUpdates();

      const dialog = container.querySelector('[role="dialog"][aria-label="계정 보안"]');
      assert.ok(dialog);
      const saveButton = Array.from(dialog.querySelectorAll('button')).find((button) => (button.textContent ?? '').includes('저장'));
      assert.ok(saveButton);
      assert.equal(saveButton.disabled, false);

      await act(async () => {
        saveButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      });
      await flushUpdates();

      assert.equal(credentialRequests.length, 1);
      assert.deepEqual(credentialRequests[0], { loginId: 'octocat' });
      assert.match(container.textContent ?? '', /로컬 로그인 정보가 저장되었습니다/);
    } finally {
      await mounted.cleanup();
      MockEventSource.reset();
    }
  }
};
