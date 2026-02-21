const assert = require('node:assert/strict');

const DEFAULT_WORKSPACE_ID = 'ws_auto_admin-en845w';
const VIEWPORT_ENVIRONMENT_STORAGE_KEY = 'ashfox.viewer.environmentTemplate';

const clone = (value) => JSON.parse(JSON.stringify(value));

const createProjectsFixture = () =>
  clone([
    {
      projectId: 'prj_0990edef709a',
      name: 'Forest Fox',
      parentFolderId: 'fld_samples',
      revision: 10,
      hasGeometry: true,
      hierarchy: [],
      animations: [],
      stats: {
        bones: 8,
        cubes: 21
      },
      textures: []
    }
  ]);

const createProjectTreeFixture = () =>
  clone({
    maxFolderDepth: 2,
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

const toJsonResponse = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });

const assertMenuWithinViewport = (menuElement, windowObject) => {
  const left = Number.parseFloat(menuElement.style.left);
  const top = Number.parseFloat(menuElement.style.top);
  assert.ok(Number.isFinite(left), 'menu left should be a finite number');
  assert.ok(Number.isFinite(top), 'menu top should be a finite number');
  assert.ok(left >= 8, `menu left should stay inside viewport margin: left=${left}`);
  assert.ok(top >= 8, `menu top should stay inside viewport margin: top=${top}`);
  assert.ok(left <= windowObject.innerWidth - 8, `menu left should not overflow viewport: left=${left}`);
  assert.ok(top <= windowObject.innerHeight - 8, `menu top should not overflow viewport: top=${top}`);
};

const setViewportSize = (windowObject, width, height) => {
  Object.defineProperty(windowObject, 'innerWidth', {
    configurable: true,
    value: width
  });
  Object.defineProperty(windowObject, 'innerHeight', {
    configurable: true,
    value: height
  });
  windowObject.dispatchEvent(new windowObject.Event('resize'));
};

const { dispatchInAct, flushUpdates, mountHomePage } = require('./helpers/pageHarness');

module.exports = async () => {
  const authSessionPayload = createAuthSessionFixture();
  const projectsPayload = { ok: true, projects: createProjectsFixture(), tree: createProjectTreeFixture() };
  const workspacesPayload = { ok: true, workspaces: createWorkspacesFixture() };

  {
    const mounted = await mountHomePage({
      fetchImpl: async (requestUrl) => {
        const url = String(requestUrl);
        if (url === '/api/auth/me') {
          return toJsonResponse(authSessionPayload);
        }
        if (url === '/api/workspaces') {
          return toJsonResponse(workspacesPayload);
        }
        assert.equal(url, `/api/projects/tree?workspaceId=${DEFAULT_WORKSPACE_ID}`);
        return toJsonResponse(projectsPayload);
      },
      EventSourceImpl: class PassiveEventSource {
        addEventListener() {}
        close() {}
      }
    });

    try {
      const { container, dom } = mounted;
      setViewportSize(dom.window, 320, 260);
      await flushUpdates();

      const environmentTrigger = container.querySelector('button[aria-label="뷰포트 배경 템플릿 선택"]');
      assert.ok(environmentTrigger);
      assert.match(environmentTrigger.textContent ?? '', /기본/);

      await dispatchInAct(environmentTrigger, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();

      const environmentMenu = container.querySelector('[role="menu"][aria-label="뷰포트 배경 템플릿 목록"]');
      assert.ok(environmentMenu);
      assertMenuWithinViewport(environmentMenu, dom.window);

      const forestOption = Array.from(environmentMenu.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes('숲')
      );
      assert.ok(forestOption);

      await dispatchInAct(forestOption, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();

      assert.match(environmentTrigger.textContent ?? '', /숲/);
      assert.equal(dom.window.localStorage.getItem(VIEWPORT_ENVIRONMENT_STORAGE_KEY), 'forest');
    } finally {
      await mounted.cleanup();
    }
  }

  {
    const mounted = await mountHomePage({
      fetchImpl: async (requestUrl) => {
        const url = String(requestUrl);
        if (url === '/api/auth/me') {
          return toJsonResponse(authSessionPayload);
        }
        if (url === '/api/workspaces') {
          return toJsonResponse(workspacesPayload);
        }
        assert.equal(url, `/api/projects/tree?workspaceId=${DEFAULT_WORKSPACE_ID}`);
        return toJsonResponse(projectsPayload);
      },
      EventSourceImpl: class PassiveEventSource {
        addEventListener() {}
        close() {}
      },
      beforeRender: (windowObject) => {
        windowObject.localStorage.setItem(VIEWPORT_ENVIRONMENT_STORAGE_KEY, 'swamp');
      }
    });

    try {
      const { container, dom } = mounted;
      await flushUpdates();

      const environmentTrigger = container.querySelector('button[aria-label="뷰포트 배경 템플릿 선택"]');
      assert.ok(environmentTrigger);
      assert.match(environmentTrigger.textContent ?? '', /늪지/);

      await dispatchInAct(environmentTrigger, new dom.window.MouseEvent('click', { bubbles: true }));
      await flushUpdates();

      const environmentMenu = container.querySelector('[role="menu"][aria-label="뷰포트 배경 템플릿 목록"]');
      assert.ok(environmentMenu);
      const selectedOption = environmentMenu.querySelector('button[role="menuitemradio"][aria-checked="true"]');
      assert.ok(selectedOption);
      assert.match(selectedOption.textContent ?? '', /늪지/);
    } finally {
      await mounted.cleanup();
    }
  }
};
